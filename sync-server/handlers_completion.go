package main

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"
)

// ── Recipe Completions (Phase P1) ─────────────────────────────────────
//
// "Recipe X was cooked on date Y." Previously browser localStorage
// ('kitchen-helper-completed'); now persisted per user in PostgreSQL so it
// survives devices, logouts, and browser clears.

func isValidDateString(s string) bool {
	if len(s) != 10 {
		return false
	}
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

func (s *Server) recipeCompletionsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	// /api/recipes/completions/{recipeId}
	recipeID := strings.TrimPrefix(r.URL.Path, "/api/recipes/completions")
	recipeID = strings.Trim(recipeID, "/")

	switch r.Method {
	case http.MethodGet:
		if recipeID != "" {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		completions, err := s.store.ListRecipeCompletions(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list completions")
			return
		}
		if completions == nil {
			completions = []RecipeCompletion{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: completions})
	case http.MethodPut, http.MethodPost:
		if recipeID == "" {
			writeError(w, http.StatusBadRequest, "recipe id is required")
			return
		}
		var req struct {
			Date string `json:"date"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if !isValidDateString(req.Date) {
			writeError(w, http.StatusBadRequest, "date must be YYYY-MM-DD")
			return
		}
		if err := s.store.UpsertRecipeCompletion(user.ID, recipeID, req.Date); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save completion")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	case http.MethodDelete:
		if recipeID == "" {
			writeError(w, http.StatusBadRequest, "recipe id is required")
			return
		}
		if err := s.store.DeleteRecipeCompletion(user.ID, recipeID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete completion")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}
