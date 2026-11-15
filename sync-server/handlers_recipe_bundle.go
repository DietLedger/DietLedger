package main

import (
	"encoding/json"
	"errors"
	"net/http"
)

type recipeBundleExportRequest struct {
	RecipeIDs   []string `json:"recipeIds"`
	BookIDs     []string `json:"bookIds"`
	ProfileIDs  []string `json:"profileIds"`
	MealPlanIDs []string `json:"mealPlanIds"`
}

func (s *Server) recipeBundlesRouter(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	if path == "/api/recipe-bundles/candidates" {
		s.recipeBundleCandidatesHandler(w, r)
		return
	}
	if path == "/api/recipe-bundles/export" {
		s.recipeBundleExportHandler(w, r)
		return
	}
	if path == "/api/recipe-bundles/owner-backup" {
		s.recipeBundleOwnerBackupHandler(w, r)
		return
	}
	if path == "/api/recipe-bundles/import" {
		s.recipeBundleImportHandler(w, r)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Server) recipeBundleCandidatesHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	pg, ok := s.store.(*PostgresStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "recipe bundles require PostgreSQL store")
		return
	}
	candidates, err := pg.ListRecipeBundleExportCandidates(user)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list export candidates")
		return
	}
	if candidates == nil {
		candidates = []ExportCandidate{}
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: candidates})
}

func (s *Server) recipeBundleExportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	pg, ok := s.store.(*PostgresStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "recipe bundles require PostgreSQL store")
		return
	}
	var req recipeBundleExportRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	bundle, err := pg.ExportRecipeBundleForUser(user, req.RecipeIDs, req.BookIDs, req.ProfileIDs, req.MealPlanIDs)
	if err != nil {
		if errors.Is(err, ErrExportForbidden) {
			writeError(w, http.StatusForbidden, "not allowed to export selected item")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to export recipe bundle")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: bundle})
}

func (s *Server) recipeBundleOwnerBackupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	pg, ok := s.store.(*PostgresStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "recipe bundles require PostgreSQL store")
		return
	}
	bundle, err := pg.ExportOwnerRecipeBookBackup(user.ID)
	if err != nil {
		if errors.Is(err, ErrExportForbidden) {
			writeError(w, http.StatusForbidden, "owner recipe/book backup contains an inaccessible dependency")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create owner recipe/book backup")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: bundle})
}

func (s *Server) recipeBundleImportHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	pg, ok := s.store.(*PostgresStore)
	if !ok {
		writeError(w, http.StatusInternalServerError, "recipe bundles require PostgreSQL store")
		return
	}
	var bundle RecipeBundle
	if err := json.NewDecoder(r.Body).Decode(&bundle); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	result, err := pg.StageRecipeBundle(user.ID, bundle)
	if err != nil {
		if errors.Is(err, ErrExportForbidden) {
			writeError(w, http.StatusForbidden, "import contains an inaccessible dependency")
			return
		}
		var conflict *RecipeBundleIdentityConflictError
		if errors.As(err, &conflict) {
			writeError(w, http.StatusConflict, conflict.Error())
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: result})
}
