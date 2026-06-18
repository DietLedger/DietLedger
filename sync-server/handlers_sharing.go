package main

import (
	"encoding/json"
	"net/http"
	"strings"
)

func (s *Server) shareRouter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "POST":
		s.createShare(w, r)
	case "GET":
		s.listShares(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) shareItemRouter(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/share/")
	id = strings.TrimSuffix(id, "/")
	if id == "" {
		s.requireAuth(s.shareRouter).ServeHTTP(w, r)
		return
	}
	switch r.Method {
	case "GET":
		s.optionalAuth(func(w http.ResponseWriter, r *http.Request) {
			s.getShareByToken(w, r, id)
		}).ServeHTTP(w, r)
	case "PUT":
		s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.updateShare(w, r, id)
		})).ServeHTTP(w, r)
	case "DELETE":
		s.requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.deleteShare(w, r, id)
		})).ServeHTTP(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) createShare(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	var req ShareRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RecipeID == "" || req.Title == "" || req.RecipeData == "" {
		writeError(w, http.StatusBadRequest, "recipeId, title, and recipeData are required")
		return
	}

	shared, err := s.store.CreateSharedRecipe(user.ID, req.RecipeID, req.Title, req.Description, req.Category, req.Tags, req.RecipeData, req.Visibility)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create share")
		return
	}
	writeJSON(w, http.StatusCreated, shared)
}

func (s *Server) listShares(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	recipes, err := s.store.GetSharedRecipesByUser(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list shares")
		return
	}
	if recipes == nil {
		recipes = []SharedRecipe{}
	}
	writeJSON(w, http.StatusOK, recipes)
}

func (s *Server) getShareByToken(w http.ResponseWriter, r *http.Request, shareToken string) {
	shared, err := s.store.GetSharedRecipeByToken(shareToken)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get share")
		return
	}
	if shared == nil {
		writeError(w, http.StatusNotFound, "shared recipe not found")
		return
	}

	user := getUserFromContext(r)
	switch shared.Visibility {
	case VisibilityPublic:
		// anyone can view
	case VisibilityUsers:
		if user == nil {
			writeError(w, http.StatusUnauthorized, "log in to view this recipe")
			return
		}
	case VisibilityPrivate:
		if user == nil || user.ID != shared.UserID {
			writeError(w, http.StatusForbidden, "this recipe is private")
			return
		}
	}

	go s.store.IncrementSharedRecipeViews(shared.ID)
	writeJSON(w, http.StatusOK, shared)
}

func (s *Server) deleteShare(w http.ResponseWriter, r *http.Request, id string) {
	if err := s.store.DeleteSharedRecipe(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete share")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

func (s *Server) updateShare(w http.ResponseWriter, r *http.Request, id string) {
	var req struct {
		Visibility string `json:"visibility"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.store.SetSharedRecipeVisibility(id, req.Visibility); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update share")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

func (s *Server) communitySearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	category := r.URL.Query().Get("category")
	sort := r.URL.Query().Get("sort")
	page, perPage := validatePagination(queryInt(r, "page", 1), queryInt(r, "perPage", 20))
	authenticated := getUserFromContext(r) != nil

	recipes, err := s.store.SearchCommunityRecipes(q, category, sort, authenticated, page, perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "search failed")
		return
	}
	if recipes == nil {
		recipes = []SharedRecipe{}
	}
	writeJSON(w, http.StatusOK, recipes)
}

func (s *Server) communityCategories(w http.ResponseWriter, r *http.Request) {
	cats, err := s.store.GetCommunityCategories()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get categories")
		return
	}
	if cats == nil {
		cats = []CommunityCategory{}
	}
	writeJSON(w, http.StatusOK, cats)
}
