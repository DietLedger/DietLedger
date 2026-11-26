package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"strings"
	"time"
)

const personalKeyPrefix = "dlpk1_"
const personalKeyDiscoveryPath = "/api/auth/key"

// Personal keys never carry a session User (including its administrator role).
type personalKeyAccount struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
}

type personalKeyInfo struct {
	ID        string    `json:"id"`
	Scopes    []string  `json:"scopes"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type personalKeyDiscovery struct {
	ContractVersion int                `json:"contractVersion"`
	Account         personalKeyAccount `json:"account"`
	Key             personalKeyInfo    `json:"key"`
}

func validPersonalKeyScopes(scopes []string) bool {
	if len(scopes) == 0 {
		return false
	}
	seen := make(map[string]bool)
	for _, scope := range scopes {
		switch scope {
		case "profiles:read", "profiles:write", "diary:read", "diary:write", "weight:read", "weight:write",
			"catalog:read", "catalog:live", "custom-foods:read", "custom-foods:write", "meal-plans:read", "meal-plans:write",
			"recipes:read", "recipes:write", "books:read", "books:write", "sharing:read", "sharing:publish",
			"transfer:export", "transfer:import", "preferences:read", "preferences:write", "design:read", "design:write",
			"dietary:read", "dietary:write":
		default:
			return false
		}
		if seen[scope] {
			return false
		}
		seen[scope] = true
	}
	return true
}

// Detect attempts across all values before any session or anonymous dispatch.
// Parsing, below, still requires one unambiguous Bearer credential.
func isPersonalKeyRequest(r *http.Request) bool {
	if r.URL.Path == personalKeyDiscoveryPath {
		return true
	}
	for _, value := range r.Header.Values("Authorization") {
		for _, word := range strings.FieldsFunc(value, func(c rune) bool {
			return c == ' ' || c == '\t' || c == ','
		}) {
			if strings.HasPrefix(word, personalKeyPrefix) {
				return true
			}
		}
	}
	return false
}

func personalKeyDigest(values []string) ([32]byte, bool) {
	if len(values) != 1 {
		return [32]byte{}, false
	}
	scheme, token, ok := strings.Cut(values[0], " ")
	encoded, prefixed := strings.CutPrefix(token, personalKeyPrefix)
	if !ok || !strings.EqualFold(scheme, "Bearer") || !prefixed || len(encoded) != base64.RawURLEncoding.EncodedLen(32) {
		return [32]byte{}, false
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(encoded)
	if err != nil || len(raw) != 32 {
		return [32]byte{}, false
	}
	return sha256.Sum256([]byte(token)), true
}

func writePersonalKeyError(w http.ResponseWriter, status int, code, message string) {
	if status == http.StatusUnauthorized {
		w.Header().Set("WWW-Authenticate", "Bearer")
	}
	writeJSON(w, status, map[string]any{"ok": false, "code": code, "error": message})
}

func (s *Server) routePersonalKeys(next http.Handler) http.Handler {
	// A dedicated, immutable store view disables privileged SQL branches even
	// when the database owner of a key is an administrator.
	var routes personalRoutes
	if pg, ok := s.store.(*PostgresStore); ok {
		personalStore, personalServer := *pg, *s
		personalStore.personalOnly = true
		personalServer.store = &personalStore
		routes = personalServer.personalKeyRoutes()
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !isPersonalKeyRequest(r) {
			next.ServeHTTP(w, r)
			return
		}
		digest, ok := personalKeyDigest(r.Header.Values("Authorization"))
		if !ok {
			writePersonalKeyError(w, http.StatusUnauthorized, "key_invalid", "invalid personal key")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
		defer cancel()
		principal, err := s.store.LookupPersonalKey(ctx, digest)
		if err != nil {
			writePersonalKeyError(w, http.StatusServiceUnavailable, "key_unavailable", "personal key verification unavailable")
			return
		}
		if principal == nil || !validPersonalKeyScopes(principal.Key.Scopes) {
			writePersonalKeyError(w, http.StatusUnauthorized, "key_invalid", "invalid personal key")
			return
		}

		if !canonicalPersonalRequest(r) {
			denyPersonalKey(w)
			return
		}
		if r.URL.Path == personalKeyDiscoveryPath {
			if r.Method != http.MethodGet || r.URL.RawQuery != "" || r.URL.ForceQuery || r.ContentLength != 0 {
				denyPersonalKey(w)
				return
			}
			principal.ContractVersion = 1
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: principal})
			return
		}
		routes.serve(w, r, principal)
	})
}
