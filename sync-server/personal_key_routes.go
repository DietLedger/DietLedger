package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"path"
	"slices"
	"strconv"
	"strings"
	"time"
)

const personalKeyContextKey contextKey = "personal-key"

type personalRoutes struct {
	paths  []personalRoute
	grants map[string]map[string]string
}

// Keep literal segments ahead of parameters at the same position. Unlike a
// general-purpose mux this registration has no method fallback or redirects.
type personalRoute struct {
	pattern     string
	parts       []string
	literalMask int
	handler     http.HandlerFunc
}

func personalKeyFromContext(r *http.Request) *personalKeyDiscovery {
	key, _ := r.Context().Value(personalKeyContextKey).(*personalKeyDiscovery)
	return key
}

func canonicalPersonalRequest(r *http.Request) bool {
	p := r.URL.Path
	return strings.HasPrefix(p, "/api/") && path.Clean(p) == strings.TrimSuffix(p, "/") && r.URL.EscapedPath() == p &&
		r.Header.Get("X-HTTP-Method-Override") == "" && r.Header.Get("X-Method-Override") == "" && r.Header.Get("X-HTTP-Method") == ""
}

func (routes personalRoutes) serve(w http.ResponseWriter, r *http.Request, key *personalKeyDiscovery) {
	// Match the path independently of method: a literal such as /completions
	// must not fall through to an item pattern when its method is forbidden.
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/"), "/")
	var matched *personalRoute
	for i := range routes.paths {
		route := &routes.paths[i]
		if len(parts) != len(route.parts) || (matched != nil && matched.literalMask >= route.literalMask) {
			continue
		}
		if route.matches(parts) {
			matched = route
		}
	}
	if matched == nil {
		denyPersonalKey(w)
		return
	}
	required := routes.grants[matched.pattern][r.Method]
	if required == "" || !slices.Contains(key.Key.Scopes, required) {
		denyPersonalKey(w)
		return
	}
	ctx := context.WithValue(r.Context(), personalKeyContextKey, key)
	ctx = context.WithValue(ctx, userContextKey, &User{ID: key.Account.ID})
	r = r.WithContext(ctx)
	for i, p := range matched.parts {
		if strings.HasPrefix(p, "{") {
			r.SetPathValue(p[1:len(p)-1], parts[i])
		}
	}
	matched.handler(w, r)
}

func (route *personalRoute) matches(parts []string) bool {
	for i, p := range route.parts {
		if strings.HasPrefix(p, "{") {
			if parts[i] == "" {
				return false
			}
		} else if p != parts[i] {
			return false
		}
	}
	return true
}

func keySourceNotFound(w http.ResponseWriter, r *http.Request, err error) bool {
	if personalKeyFromContext(r) == nil || !errors.Is(err, sql.ErrNoRows) {
		return false
	}
	writeError(w, 404, "resource or linked source not found")
	return true
}

func denyPersonalKey(w http.ResponseWriter) {
	writePersonalKeyError(w, http.StatusForbidden, "key_forbidden", "operation not permitted for personal key")
}

func (s *Server) personalKeyRoutes() personalRoutes {
	r := personalRoutes{grants: map[string]map[string]string{}}
	add := func(pattern, read, write, methods string, handler http.HandlerFunc) {
		grants := map[string]string{}
		if read != "" {
			grants[http.MethodGet] = read
		}
		for _, method := range strings.Fields(methods) {
			grants[method] = write
		}
		r.grants[pattern] = grants
		parts := strings.Split(strings.TrimPrefix(strings.TrimSuffix(pattern, "{$}"), "/"), "/")
		mask := 0
		for _, part := range parts {
			mask <<= 1
			if !strings.HasPrefix(part, "{") {
				mask |= 1
			}
		}
		r.paths = append(r.paths, personalRoute{pattern, parts, mask, handler})
	}
	add("/api/profiles", "profiles:read", "profiles:write", "POST", s.profilesRouter)
	add("/api/profiles/{profileId}", "profiles:read", "profiles:write", "PUT DELETE", s.profileRoutes)
	add("/api/profiles/{profileId}/log", "diary:read", "diary:write", "POST", s.profileRoutes)
	add("/api/profiles/{profileId}/log/{entryId}", "", "diary:write", "PUT DELETE", s.profileRoutes)
	add("/api/profiles/{profileId}/weight", "weight:read", "weight:write", "POST", s.profileRoutes)
	add("/api/profiles/{profileId}/weight/{entryId}", "", "weight:write", "PUT DELETE", s.profileRoutes)

	add("/api/foods/search", "catalog:read", "", "", s.foodSearchHandler)
	add("/api/foods", "catalog:read", "", "", s.foodSearchHandler)
	add("/api/foods/stats", "catalog:read", "", "", s.foodStatsHandler)
	add("/api/foods/{fdcId}", "catalog:read", "", "", s.personalFoodItem)
	add("/api/foods/upc/{gtinUpc}", "catalog:read", "", "", s.personalFoodItem)
	add("/api/settings/seasonal-foods", "catalog:read", "", "", s.seasonalFoodsRouter)
	add("/api/custom-foods", "custom-foods:read", "custom-foods:write", "POST", s.customFoodsRouter)
	add("/api/custom-foods/{foodId}", "", "custom-foods:write", "PUT DELETE", s.customFoodRoutes)
	add("/api/food-storage-defaults", "custom-foods:read", "", "", s.foodStorageDefaultsRouter)
	add("/api/food-storage-defaults/{sourceType}/{sourceKey}", "", "custom-foods:write", "PUT", s.foodStorageDefaultItemRouter)

	add("/api/meal-plans", "meal-plans:read", "meal-plans:write", "POST", s.mealPlansRouter)
	add("/api/meal-plans/week/{weekStart}", "meal-plans:read", "", "", s.personalMealPlanWeek)
	add("/api/meal-plans/{planId}", "meal-plans:read", "meal-plans:write", "PUT DELETE", s.mealPlanRoutes)
	add("/api/meal-plans/{planId}/entries", "meal-plans:read", "meal-plans:write", "POST", s.mealPlanRoutes)
	add("/api/meal-plans/{planId}/entries/{entryId}", "", "meal-plans:write", "PUT DELETE", s.mealPlanRoutes)
	add("/api/entries/{entryId}", "", "meal-plans:write", "PUT DELETE", s.entryRoutes)
	add("/api/meal-plans/{planId}/groups", "meal-plans:read", "meal-plans:write", "POST DELETE", s.mealPlanRoutes)
	add("/api/grocery", "meal-plans:read", "meal-plans:write", "PUT POST", s.groceryRouter)
	add("/api/pantry-staples", "meal-plans:read", "meal-plans:write", "POST DELETE", s.pantryStaplesRouter)

	add("/api/recipes", "recipes:read", "recipes:write", "POST", s.recipesRouter)
	add("/api/recipes/{recipeId}", "recipes:read", "recipes:write", "PUT DELETE", s.recipeRoutes)
	add("/api/recipes/{recipeId}/ingredients", "recipes:read", "recipes:write", "POST", s.recipeRoutes)
	add("/api/recipes/{recipeId}/ingredients/{ingredientId}", "", "recipes:write", "PUT DELETE", s.recipeRoutes)
	add("/api/recipes/{recipeId}/categories", "recipes:read", "recipes:write", "POST DELETE", s.recipeRoutes)
	add("/api/recipes/completions", "recipes:read", "", "", s.recipeCompletionsRouter)
	add("/api/recipes/completions/{recipeId}", "", "recipes:write", "PUT POST DELETE", s.recipeCompletionsRouter)
	add("/api/categories", "recipes:read", "", "", s.categoriesRouter)
	add("/api/categories/{categoryId}/descendants", "recipes:read", "", "", s.categoryRoutes)
	add("/api/categories/{categoryId}/recipes", "recipes:read", "", "", s.categoryRoutes)

	add("/api/books", "books:read", "books:write", "POST", s.booksRouter)
	add("/api/books/{bookId}", "books:read", "books:write", "PUT DELETE", s.bookRoutes)
	add("/api/books/{bookId}/chapters/{$}", "books:read", "books:write", "POST", s.personalBookChild((*Server).chaptersRouter))
	for _, p := range []string{"/api/chapters/{chapterId}", "/api/books/{bookId}/chapters/{chapterId}"} {
		add(p, "", "books:write", "PUT DELETE", s.personalChapterChild((*Server).chapterItemRouter))
		add(p+"/recipes", "books:read", "books:write", "POST DELETE", s.personalChapterChild((*Server).chapterRecipesRouter))
		add(p+"/recipes/{recipeId}", "", "books:write", "DELETE", s.personalChapterChild((*Server).chapterRecipesRouter))
		add(p+"/pages", "books:read", "books:write", "POST", s.personalChapterChild((*Server).chapterPagesRouter))
		add(p+"/pages/{pageId}", "", "books:write", "PUT DELETE", s.personalChapterChild((*Server).chapterPagesRouter))
	}
	add("/api/pages/{pageId}", "", "books:write", "PUT DELETE", s.pageRoutes)
	add("/api/books/{bookId}/pages", "books:read", "books:write", "POST", s.personalBookChild((*Server).bookPagesRouter))
	add("/api/book-pages/{pageId}", "", "books:write", "PUT DELETE", s.bookPageRoutes)
	add("/api/books/{bookId}/items/reorder", "", "books:write", "PUT", s.personalBookChild((*Server).bookItemsReorderHandler))
	add("/api/chapters/{chapterId}/items/reorder", "", "books:write", "PUT", s.personalChapterChild((*Server).chapterItemsReorderHandler))
	add("/api/chapter-recipes/{chapterRecipeId}/move", "", "books:write", "POST", s.chapterRecipeItemRoutes)
	for _, action := range []string{"move", "to-book", "to-chapter"} {
		add("/api/pages/{pageId}/"+action, "", "books:write", "POST", s.pageRoutes)
	}

	add("/api/share", "sharing:read", "sharing:publish", "POST", s.shareRouter)
	// Same structural path; the parameter is a share token on GET and a row ID on writes.
	add("/api/share/{shareToken}", "sharing:read", "sharing:publish", "PUT DELETE", s.personalShareItem)
	add("/api/community", "sharing:read", "", "", s.communitySearch)
	add("/api/community/categories", "sharing:read", "", "", s.communityCategories)
	add("/api/custom-foods/community", "sharing:read", "", "", s.communityCustomFoodsRouter)
	add("/api/custom-foods/{foodId}/share", "", "sharing:publish", "POST", func(w http.ResponseWriter, r *http.Request) { s.customFoodItemRouter(w, r, r.PathValue("foodId")) })

	add("/api/recipe-bundles/candidates", "transfer:export", "", "", s.recipeBundleCandidatesHandler)
	add("/api/recipe-bundles/export", "", "transfer:export", "POST", s.recipeBundleExportHandler)
	add("/api/recipe-bundles/owner-backup", "", "transfer:export", "POST", s.recipeBundleOwnerBackupHandler)
	add("/api/recipe-bundles/import", "", "transfer:import", "POST", s.recipeBundleImportHandler)
	add("/api/recipe-imports", "transfer:import", "", "", s.recipeImportsRouter)
	add("/api/recipe-imports/{batchId}/decision", "", "transfer:import", "POST", s.recipeImportsRouter)
	add("/api/recipe-imports/{stagedRecipeId}/ingredients/{ingredientId}", "", "transfer:import", "PUT", s.recipeImportsRouter)
	add("/api/settings", "preferences:read", "preferences:write", "PUT", s.settingsRouter)
	add("/api/settings/location", "preferences:read", "preferences:write", "PUT", s.locationRouter)
	add("/api/templates", "design:read", "design:write", "POST", s.templatesRouter)
	add("/api/templates/{templateId}", "design:read", "design:write", "PUT DELETE", s.templateRoutes)
	add("/api/brand-kits", "design:read", "design:write", "POST", s.brandKitsRouter)
	add("/api/brand-kits/{brandKitId}", "design:read", "design:write", "PUT DELETE", s.brandKitRoutes)
	add("/api/dietary-profiles", "dietary:read", "dietary:write", "POST", s.dietaryProfilesRouter)
	add("/api/dietary-profiles/{dietaryProfileId}", "dietary:read", "dietary:write", "PUT DELETE", s.dietaryProfileRoutes)
	add("/api/dietary-profiles/{dietaryProfileId}/recipe-assessments", "dietary:read", "", "", s.dietaryProfileRoutes)
	add("/api/dietary-profiles/diabetes-aware-starter", "", "dietary:write", "POST", s.restoreDiabetesAwareProfileHandler)
	add("/api/dietary-profiles/{dietaryProfileId}/allergen-rules", "dietary:read", "dietary:write", "POST", s.dietaryProfileRoutes)
	add("/api/dietary-profiles/{dietaryProfileId}/allergen-rules/{ruleId}", "", "dietary:write", "PUT DELETE", s.dietaryProfileRoutes)
	add("/api/allergen-rules/{ruleId}", "", "dietary:write", "PUT DELETE", s.allergenRuleRoutes)
	return r
}

func (s *Server) personalBookChild(handler func(*Server, http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		book := r.PathValue("bookId")
		s.runBookScope(w, func(fn func(Store) error) error { return s.store.WithOwnedBook(getUserFromContext(r).ID, book, fn) }, func(scoped *Server, response http.ResponseWriter) { handler(scoped, response, r, book) })
	}
}

func (s *Server) personalChapterChild(handler func(*Server, http.ResponseWriter, *http.Request, string)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		chapter := r.PathValue("chapterId")
		s.runBookScope(w, func(fn func(Store) error) error {
			return s.store.WithOwnedChapter(getUserFromContext(r).ID, chapter, r.PathValue("bookId"), fn)
		}, func(scoped *Server, response http.ResponseWriter) { handler(scoped, response, r, chapter) })
	}
}

func (s *Server) personalFoodItem(w http.ResponseWriter, r *http.Request) {
	if code := r.PathValue("gtinUpc"); code != "" {
		for _, c := range code {
			if c < '0' || c > '9' {
				denyPersonalKey(w)
				return
			}
		}
		s.foodItemHandler(w, r, "upc/"+code)
		return
	}
	id := r.PathValue("fdcId")
	n, err := strconv.Atoi(id)
	if err != nil || n <= 0 || strconv.Itoa(n) != id {
		denyPersonalKey(w)
		return
	}
	s.foodItemHandler(w, r, id)
}

func (s *Server) personalMealPlanWeek(w http.ResponseWriter, r *http.Request) {
	week := r.PathValue("weekStart")
	if _, err := time.Parse(time.DateOnly, week); err != nil {
		writeError(w, 400, "invalid weekStart")
		return
	}
	s.mealPlanItemRouter(w, r, "week/"+week)
}

func (s *Server) personalShareItem(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("shareToken")
	switch r.Method {
	case http.MethodGet:
		s.getShareByToken(w, r, id)
	case http.MethodPut:
		s.updateShare(w, r, id)
	case http.MethodDelete:
		s.deleteShare(w, r, id)
	}
}
