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
	store        Store
	auth         *AuthService
	rateLimiter  *RateLimiter
	corsOrigin   string
	maxBodyBytes int64
}

func NewServer(store Store, auth *AuthService, corsOrigin string, maxBodyMB int64, rl *RateLimiter) *Server {
	return &Server{
		store:        store,
		auth:         auth,
		rateLimiter:  rl,
		corsOrigin:   corsOrigin,
		maxBodyBytes: maxBodyMB * 1024 * 1024,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("/api/health", s.health)
	mux.HandleFunc("/api/about", s.about)

	mux.HandleFunc("/api/auth/register", s.registerHandler)
	mux.HandleFunc("/api/auth/login", s.loginHandler)
	mux.HandleFunc("/api/auth/refresh", s.refreshHandler)

	// Instance metadata: state is public so first-run routing works pre-auth;
	// the mutations are administrator-only.
	mux.HandleFunc("/api/instance/state", s.instanceStateHandler)
	mux.HandleFunc("/api/instance/onboarding/complete", s.requireAuth(s.requireAdmin(s.completeOnboardingHandler)))
	mux.HandleFunc("/api/instance/registration", s.requireAuth(s.requireAdmin(s.registrationHandler)))
	mux.HandleFunc("/api/instance/reset-user-data", s.requireAuth(s.requireAdmin(s.resetUserDataHandler)))
	mux.HandleFunc("/api/instance/factory-reset", s.requireAuth(s.requireAdmin(s.factoryResetHandler)))
	mux.HandleFunc("/api/instance/users", s.requireAuth(s.requireAdmin(s.listUsersHandler)))

	// Account self-service (caller-scoped, password-gated via the handler body).
	mux.HandleFunc("/api/account/delete-data", s.requireAuth(s.deleteDataHandler))
	mux.HandleFunc("/api/account/delete", s.requireAuth(s.deleteAccountHandler))

	mux.HandleFunc("/api/recipes/", s.requireAuth(s.recipeRoutes))
	mux.HandleFunc("/api/recipes", s.requireAuth(s.recipesRouter))
	// Completions get exact patterns so they win over the generic recipe
	// item route (Go's mux prefers the longest match).
	mux.HandleFunc("/api/recipes/completions", s.requireAuth(s.recipeCompletionsRouter))
	mux.HandleFunc("/api/recipes/completions/", s.requireAuth(s.recipeCompletionsRouter))
	mux.HandleFunc("/api/recipe-bundles/candidates", s.requireAuth(s.recipeBundlesRouter))
	mux.HandleFunc("/api/recipe-bundles/export", s.requireAuth(s.recipeBundlesRouter))
	mux.HandleFunc("/api/recipe-bundles/import", s.requireAuth(s.recipeBundlesRouter))

	mux.HandleFunc("/api/profiles/", s.requireAuth(s.profileRoutes))
	mux.HandleFunc("/api/profiles", s.requireAuth(s.profilesRouter))

	mux.HandleFunc("/api/foods/search", s.requireAuth(s.foodSearchHandler))
	mux.HandleFunc("/api/foods/", s.requireAuth(s.foodRoutes))
	mux.HandleFunc("/api/foods", s.requireAuth(s.foodSearchHandler))

	mux.HandleFunc("/api/meal-plans/", s.requireAuth(s.mealPlanRoutes))
	mux.HandleFunc("/api/meal-plans", s.requireAuth(s.mealPlansRouter))

	mux.HandleFunc("/api/entries/", s.requireAuth(s.entryRoutes))

	mux.HandleFunc("/api/books/", s.requireAuth(s.bookRoutes))
	mux.HandleFunc("/api/books", s.requireAuth(s.booksRouter))

	mux.HandleFunc("/api/chapters/", s.requireAuth(s.chapterRoutes))
	mux.HandleFunc("/api/pages/", s.requireAuth(s.pageRoutes))
	mux.HandleFunc("/api/chapter-recipes/", s.requireAuth(s.chapterRecipeItemRoutes))

	mux.HandleFunc("/api/categories/", s.requireAuth(s.categoryRoutes))
	mux.HandleFunc("/api/categories", s.requireAuth(s.categoriesRouter))

	mux.HandleFunc("/api/custom-foods/community", s.requireAuth(s.communityCustomFoodsRouter))
	mux.HandleFunc("/api/custom-foods/", s.requireAuth(s.customFoodRoutes))
	mux.HandleFunc("/api/custom-foods", s.requireAuth(s.customFoodsRouter))
	mux.HandleFunc("/api/food-storage-defaults", s.requireAuth(s.foodStorageDefaultsRouter))
	mux.HandleFunc("/api/food-storage-defaults/", s.requireAuth(s.foodStorageDefaultItemRouter))

	mux.HandleFunc("/api/grocery", s.requireAuth(s.groceryRouter))

	mux.HandleFunc("/api/keys/", s.requireAuth(s.apiKeyRoutes))
	mux.HandleFunc("/api/keys", s.requireAuth(s.apiKeysRouter))

	mux.HandleFunc("/api/share", s.requireAuth(s.shareRouter))
	mux.HandleFunc("/api/share/", s.shareItemRouter)
	mux.HandleFunc("/api/community", s.optionalAuth(s.communitySearch))
	mux.HandleFunc("/api/community/categories", s.communityCategories)

	mux.HandleFunc("/api/settings", s.requireAuth(s.settingsRouter))
	mux.HandleFunc("/api/settings/location", s.requireAuth(s.locationRouter))
	mux.HandleFunc("/api/settings/seasonal-foods", s.seasonalFoodsRouter)

	mux.HandleFunc("/api/templates/", s.requireAuth(s.templateRoutes))
	mux.HandleFunc("/api/templates", s.requireAuth(s.templatesRouter))

	mux.HandleFunc("/api/dietary-profiles/", s.requireAuth(s.dietaryProfileRoutes))
	mux.HandleFunc("/api/dietary-profiles", s.requireAuth(s.dietaryProfilesRouter))

	mux.HandleFunc("/api/allergen-rules/", s.requireAuth(s.allergenRuleRoutes))

	mux.HandleFunc("/api/brand-kits/", s.requireAuth(s.brandKitRoutes))
	mux.HandleFunc("/api/brand-kits", s.requireAuth(s.brandKitsRouter))

	mux.HandleFunc("/api/pantry-staples", s.requireAuth(s.pantryStaplesRouter))

	mux.HandleFunc("/api/secrets/", s.requireAuth(s.secretRoutes))
	mux.HandleFunc("/api/secrets", s.requireAuth(s.secretsRouter))

	var handler http.Handler = mux
	if s.rateLimiter != nil {
		handler = s.rateLimiter.Middleware(handler)
	}
	return s.corsMiddleware(handler)
}

func (s *Server) recipeRoutes(w http.ResponseWriter, r *http.Request) {
	s.recipeItemRouter(w, r)
}

func (s *Server) profileRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/profiles/")
	if path == "" {
		s.profilesRouter(w, r)
		return
	}
	parts := strings.SplitN(path, "/", 3)
	profileID := parts[0]
	if len(parts) >= 2 {
		sub := parts[1]
		if sub == "log" {
			entryID := ""
			if len(parts) >= 3 {
				entryID = parts[2]
			}
			if entryID != "" {
				s.foodLogEntryRouter(w, r, entryID)
			} else {
				s.foodLogRouter(w, r, profileID)
			}
			return
		}
		if sub == "weight" {
			entryID := ""
			if len(parts) >= 3 {
				entryID = parts[2]
			}
			if entryID != "" {
				s.weightEntryRouter(w, r, entryID)
			} else {
				s.weightRouter(w, r, profileID)
			}
			return
		}
	}
	s.profileItemRouter(w, r, profileID)
}

func (s *Server) foodRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/foods/")
	// Dataset imports and cache management are administrator-only. The food
	// data itself is shared and read-only for everyone else.
	if strings.HasPrefix(path, "seed") || strings.HasPrefix(path, "cache") {
		s.requireAdmin(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			s.foodAdminRoutes(w, r, path)
		})).ServeHTTP(w, r)
		return
	}
	if path == "stats" || path == "stats/" {
		s.foodStatsHandler(w, r)
		return
	}
	s.foodItemHandler(w, r, path)
}

// foodAdminRoutes dispatches the administrator-only food management paths.
func (s *Server) foodAdminRoutes(w http.ResponseWriter, r *http.Request, path string) {
	if path == "seed" || path == "seed/" {
		s.foodSeedRouter(w, r)
		return
	}
	if strings.HasPrefix(path, "seed/upload") {
		s.foodSeedUploadHandler(w, r)
		return
	}
	if strings.HasPrefix(path, "seed/") {
		jobID := strings.TrimPrefix(path, "seed/")
		jobID = strings.TrimSuffix(jobID, "/")
		s.foodSeedItemRouter(w, r, jobID)
		return
	}
	if path == "cache" || path == "cache/" {
		s.foodCacheHandler(w, r)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Server) entryRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/entries/")
	id = strings.TrimSuffix(id, "/")
	if id == "" {
		writeError(w, http.StatusBadRequest, "entry id is required")
		return
	}
	s.dayPlanEntryItemRouter(w, r, id)
}

func (s *Server) mealPlanRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/meal-plans/")
	if path == "" {
		s.mealPlansRouter(w, r)
		return
	}
	parts := strings.SplitN(path, "/", 3)
	planID := parts[0]
	if len(parts) >= 2 {
		sub := parts[1]
		if sub == "entries" {
			entryID := ""
			if len(parts) >= 3 {
				entryID = parts[2]
			}
			if entryID != "" {
				s.dayPlanEntryItemRouter(w, r, entryID)
			} else {
				s.dayPlanEntriesRouter(w, r, planID)
			}
			return
		}
		if sub == "groups" {
			s.mealGroupsRouter(w, r, planID)
			return
		}
	}
	s.mealPlanItemRouter(w, r, planID)
}

func (s *Server) bookRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/books/")
	s.bookItemRouter(w, r, path)
}

// chapterRoutes dispatches the flat chapter routes addressed directly by
// chapter ID. Chapters have globally unique IDs, so chapter-scoped operations
// (recipes, pages, update, delete) do not require the parent book ID. These
// mirror the nested /api/books/{bookID}/chapters/... routes.
func (s *Server) chapterRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/chapters/")
	path = strings.TrimSuffix(path, "/")
	if path == "" {
		writeError(w, http.StatusBadRequest, "chapter id is required")
		return
	}
	parts := strings.SplitN(path, "/", 3)
	chapterID := parts[0]
	if len(parts) == 1 {
		s.chapterItemRouter(w, r, chapterID)
		return
	}
	switch parts[1] {
	case "recipes":
		s.chapterRecipesRouter(w, r, chapterID)
		return
	case "pages":
		s.chapterPagesRouter(w, r, chapterID)
		return
	case "items":
		s.chapterItemsReorderHandler(w, r, chapterID)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

// pageRoutes dispatches the flat chapter-page routes addressed directly by
// page ID (update/delete of a single chapter page, or conversion between
// chapter pages and book pages).
func (s *Server) pageRoutes(w http.ResponseWriter, r *http.Request) {
	pagePath := strings.TrimPrefix(r.URL.Path, "/api/pages/")
	pagePath = strings.TrimSuffix(pagePath, "/")
	parts := strings.SplitN(pagePath, "/", 2)
	pageID := parts[0]
	if pageID == "" {
		writeError(w, http.StatusBadRequest, "page id is required")
		return
	}
	if len(parts) >= 2 {
		switch parts[1] {
		case "to-book":
			s.convertPageToBookHandler(w, r, pageID)
			return
		case "to-chapter":
			s.convertPageToChapterHandler(w, r, pageID)
			return
		case "move":
			s.movePageBetweenChaptersHandler(w, r, pageID)
			return
		}
	}
	s.chapterPageItemRouter(w, r, pageID)
}

// chapterRecipeItemRoutes dispatches operations on a single chapter-recipe join
// row addressed by its own ID (e.g. moving it between chapters).
func (s *Server) chapterRecipeItemRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/chapter-recipes/")
	path = strings.TrimSuffix(path, "/")
	parts := strings.SplitN(path, "/", 2)
	chapterRecipeID := parts[0]
	if chapterRecipeID == "" {
		writeError(w, http.StatusBadRequest, "chapter recipe id is required")
		return
	}
	if len(parts) >= 2 && parts[1] == "move" {
		s.moveChapterRecipeHandler(w, r, chapterRecipeID)
		return
	}
	writeError(w, http.StatusNotFound, "not found")
}

func (s *Server) categoryRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/categories/")
	if path == "" {
		s.categoriesRouter(w, r)
		return
	}
	parts := strings.SplitN(path, "/", 3)
	id := parts[0]
	if len(parts) >= 2 && parts[1] == "descendants" {
		s.categoryDescendants(w, r, id)
		return
	}
	if len(parts) >= 2 && parts[1] == "recipes" {
		s.categoryRecipes(w, r, id)
		return
	}
	s.categoryItemRouter(w, r, id)
}

func (s *Server) customFoodRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/custom-foods/")
	if path == "" || path == "community" {
		s.customFoodsRouter(w, r)
		return
	}
	s.customFoodItemRouter(w, r, path)
}

func (s *Server) apiKeyRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/keys/")
	s.apiKeyItemRouter(w, r, id)
}

func (s *Server) templateRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/templates/")
	if id == "" {
		s.templatesRouter(w, r)
		return
	}
	s.templateItemRouter(w, r, id)
}

func (s *Server) dietaryProfileRoutes(w http.ResponseWriter, r *http.Request) {
	path := strings.TrimPrefix(r.URL.Path, "/api/dietary-profiles/")
	if path == "" {
		s.dietaryProfilesRouter(w, r)
		return
	}
	parts := strings.SplitN(path, "/", 3)
	profileID := parts[0]
	if len(parts) >= 2 && parts[1] == "allergen-rules" {
		ruleID := ""
		if len(parts) >= 3 {
			ruleID = parts[2]
		}
		if ruleID != "" {
			s.allergenRuleItemRouter(w, r, ruleID)
			return
		}
		user := getUserFromContext(r)
		s.allergenRulesRouter(w, r, user, profileID)
		return
	}
	s.dietaryProfileItemRouter(w, r, profileID)
}

func (s *Server) allergenRuleRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/allergen-rules/")
	s.allergenRuleItemRouter(w, r, id)
}

func (s *Server) brandKitRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/brand-kits/")
	s.brandKitItemRouter(w, r, id)
}

func (s *Server) secretRoutes(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/secrets/")
	s.secretItemRouter(w, r, id)
}

func (s *Server) requireAuth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			writeError(w, http.StatusUnauthorized, "missing Authorization header")
			return
		}

		if strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			userID, err := s.auth.ValidateAccessToken(token)
			if err != nil {
				user, err2 := s.store.GetUserByAPIKey(token)
				if err2 != nil || user == nil {
					writeError(w, http.StatusUnauthorized, "invalid token or API key")
					return
				}
				ctx := context.WithValue(r.Context(), userContextKey, user)
				h.ServeHTTP(w, r.WithContext(ctx))
				return
			}
			user, err := s.store.GetUserByID(userID)
			if err != nil || user == nil {
				writeError(w, http.StatusUnauthorized, "user not found")
				return
			}
			ctx := context.WithValue(r.Context(), userContextKey, user)
			h.ServeHTTP(w, r.WithContext(ctx))
			return
		}

		writeError(w, http.StatusUnauthorized, "invalid Authorization format, use: Bearer <token>")
	}
}

// optionalAuth attempts to authenticate the request but does not reject it
// when no token is present. If a valid token is supplied the user is stored
// in the request context; otherwise the request proceeds unauthenticated.
// Used for endpoints that behave differently for logged-in vs anonymous
// users (e.g. share visibility tiers, community gallery).
func (s *Server) optionalAuth(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		authHeader := r.Header.Get("Authorization")
		if authHeader != "" && strings.HasPrefix(authHeader, "Bearer ") {
			token := strings.TrimPrefix(authHeader, "Bearer ")
			userID, err := s.auth.ValidateAccessToken(token)
			if err == nil {
				user, err := s.store.GetUserByID(userID)
				if err == nil && user != nil {
					ctx := context.WithValue(r.Context(), userContextKey, user)
					r = r.WithContext(ctx)
				}
			} else {
				user, err2 := s.store.GetUserByAPIKey(token)
				if err2 == nil && user != nil {
					ctx := context.WithValue(r.Context(), userContextKey, user)
					r = r.WithContext(ctx)
				}
			}
		}
		h.ServeHTTP(w, r)
	}
}

// requireAdmin wraps a handler that already passed requireAuth, rejecting
// non-administrators. It must be used inside requireAuth (which sets the user
// in context), e.g. s.requireAuth(s.requireAdmin(handler)).
func (s *Server) requireAdmin(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		user := getUserFromContext(r)
		if user == nil || !user.IsAdmin {
			writeError(w, http.StatusForbidden, "administrator access required")
			return
		}
		h.ServeHTTP(w, r)
	}
}

func (s *Server) corsMiddleware(next http.Handler) http.Handler {
	allowedOrigins := parseAllowedOrigins(s.corsOrigin)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		if origin != "" {
			if isOriginAllowed(origin, allowedOrigins) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Credentials", "true")
			} else {
				w.Header().Set("Vary", "Origin")
			}
		} else {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		}
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Max-Age", "86400")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func parseAllowedOrigins(raw string) []string {
	if raw == "" || raw == "*" {
		return nil
	}
	parts := strings.Split(raw, ",")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	return parts
}

func isOriginAllowed(origin string, allowed []string) bool {
	if len(allowed) == 0 {
		return true
	}
	for _, a := range allowed {
		if a == "*" || a == origin {
			return true
		}
	}
	return false
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
	u := r.Context().Value(userContextKey)
	if u == nil {
		return nil
	}
	return u.(*User)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"service": "dietledger-api",
		"version": version,
	})
}

func (s *Server) about(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":        "DietLedger API Server",
		"version":     version,
		"description": "Server-first API for DietLedger",
	})
}
