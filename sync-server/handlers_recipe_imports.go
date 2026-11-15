package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
)

func (s *Server) recipeImportsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	pg, ok := s.store.(*PostgresStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "recipe imports require PostgreSQL store")
		return
	}
	if r.URL.Path == "/api/recipe-imports" {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		rows, err := pg.ListQuarantinedRecipes(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to read recipe imports")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: rows})
		return
	}
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/recipe-imports/"), "/")
	var summary *RecipeBundleImportSummary
	var err error
	if len(parts) == 2 && parts[0] != "" && parts[1] == "decision" {
		if r.Method != http.MethodPost {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var req struct {
			Action string `json:"action"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		summary, err = pg.DecideRecipeImport(user.ID, parts[0], req.Action)
	} else if len(parts) == 3 && parts[0] != "" && parts[1] == "ingredients" && parts[2] != "" {
		if r.Method != http.MethodPut {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		var req CreateIngredientReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		summary, err = pg.ResolveQuarantinedIngredient(user.ID, parts[0], parts[2], req)
	} else {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	if err != nil {
		code := http.StatusBadRequest
		var conflict *RecipeBundleIdentityConflictError
		switch {
		case errors.Is(err, ErrImportNotFound):
			code = http.StatusNotFound
		case errors.Is(err, ErrImportAccepted) || errors.As(err, &conflict):
			code = http.StatusConflict
		case errors.Is(err, ErrExportForbidden):
			code = http.StatusForbidden
		}
		writeError(w, code, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: summary})
}
