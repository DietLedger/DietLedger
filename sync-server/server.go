package main

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
)

type contextKey string

const userContextKey contextKey = "user"

type Server struct {
	store        *SQLiteStore
	corsOrigin   string
	maxBodyBytes int64
}

func NewServer(store *SQLiteStore, corsOrigin string, maxBodyMB int64) *Server {
	return &Server{
		store:        store,
		corsOrigin:   corsOrigin,
		maxBodyBytes: maxBodyMB * 1024 * 1024,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/sync/register", s.register)

	mux.HandleFunc("/api/sync/push", s.requireAuth(s.push))
	mux.HandleFunc("/api/sync/pull", s.requireAuth(s.pull))
	mux.HandleFunc("/api/sync/status", s.requireAuth(s.status))
	mux.HandleFunc("/api/sync/conflicts", s.requireAuth(s.listConflicts))
	mux.HandleFunc("/api/sync/conflicts/", s.requireAuth(s.conflictsRouter))
	mux.HandleFunc("/api/sync/device/", s.requireAuth(s.deviceRouter))
	mux.HandleFunc("/api/sync/full-dump", s.requireAuth(s.fullDumpRouter))

	return s.corsMiddleware(mux)
}

func (s *Server) requireAuth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing Authorization header")
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		if token == authHeader {
			writeError(w, http.StatusUnauthorized, "invalid Authorization format, use: Bearer <token>")
			return
		}

		user, err := s.store.GetUserByAPIKey(token)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		if user == nil {
			writeError(w, http.StatusUnauthorized, "invalid API key")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		h.ServeHTTP(w, r.WithContext(ctx))
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", s.corsOrigin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"ok":    false,
		"error": msg,
	})
}

func getUserFromContext(r *http.Request) *User {
	return r.Context().Value(userContextKey).(*User)
}

func (s *Server) conflictsRouter(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/sync/conflicts/")
	if id == "" {
		s.listConflicts(w, r)
		return
	}
	s.resolveConflict(w, r, id)
}

func (s *Server) deviceRouter(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/sync/device/")
	s.removeDevice(w, r, id)
}

func (s *Server) fullDumpRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method == "POST" {
		s.fullDumpUpload(w, r)
	} else {
		s.fullDumpDownload(w, r)
	}
}
