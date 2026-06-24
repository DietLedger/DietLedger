package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) registerHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := validateEmail(req.Email); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	resp, err := s.auth.Register(req.Email, req.Password, req.DisplayName)
	if err != nil {
		writeError(w, http.StatusConflict, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, resp)
}

func (s *Server) loginHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	resp, err := s.auth.Login(req.Email, req.Password)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *Server) refreshHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req RefreshRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	resp, err := s.auth.RefreshToken(req.RefreshToken)
	if err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, resp)
}

// ── Recipes ──────────────────────────────────────────────────────────

func (s *Server) recipesRouter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		s.listRecipes(w, r)
	case "POST":
		s.createRecipe(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) recipeItemRouter(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimPrefix(r.URL.Path, "/api/recipes/")
	if id == "" {
		s.recipesRouter(w, r)
		return
	}
	if strings.Contains(id, "/ingredients") {
		parts := strings.SplitN(id, "/", 3)
		if len(parts) >= 2 && parts[1] == "ingredients" {
			recipeID := parts[0]
			ingID := ""
			if len(parts) == 3 {
				ingID = parts[2]
			}
			s.ingredientRouter(w, r, recipeID, ingID)
			return
		}
	}
	if strings.Contains(id, "/categories") {
		parts := strings.SplitN(id, "/", 3)
		if len(parts) >= 2 && parts[1] == "categories" {
			recipeID := parts[0]
			s.recipeCategoriesRouter(w, r, recipeID)
			return
		}
	}
	switch r.Method {
	case "GET":
		s.getRecipe(w, r, id)
	case "PUT":
		s.updateRecipe(w, r, id)
	case "DELETE":
		s.deleteRecipe(w, r, id)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) listRecipes(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	page, perPage := validatePagination(queryInt(r, "page", 1), queryInt(r, "perPage", 20))
	recipes, total, err := s.store.ListRecipes(user.ID, page, perPage)
	if err != nil {
		log.Printf("Error listing recipes: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list recipes")
		return
	}
	if recipes == nil {
		recipes = []Recipe{}
	}
	totalPages := total / perPage
	if total%perPage > 0 {
		totalPages++
	}
	writeJSON(w, http.StatusOK, PaginatedResponse{Data: recipes, Total: total, Page: page, PerPage: perPage, TotalPages: totalPages})
}

func (s *Server) getRecipe(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	recipe, err := s.store.GetRecipe(user.ID, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get recipe")
		return
	}
	if recipe == nil {
		writeError(w, http.StatusNotFound, "recipe not found")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: recipe})
}

func (s *Server) createRecipe(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}
	var req CreateRecipeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := validateRequired(map[string]string{"name": req.Name}); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	recipe, err := s.store.CreateRecipe(user.ID, &req)
	if err != nil {
		log.Printf("Error creating recipe: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create recipe")
		return
	}
	writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: recipe})
}

func (s *Server) updateRecipe(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}
	var req UpdateRecipeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	recipe, err := s.store.UpdateRecipe(user.ID, id, &req)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update recipe")
		return
	}
	if recipe == nil {
		writeError(w, http.StatusNotFound, "recipe not found")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: recipe})
}

func (s *Server) deleteRecipe(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	if err := s.store.DeleteRecipe(user.ID, id); err != nil {
		writeError(w, http.StatusNotFound, "recipe not found")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

func (s *Server) ingredientRouter(w http.ResponseWriter, r *http.Request, recipeID, ingID string) {
	user := getUserFromContext(r)
	recipe, err := s.store.GetRecipe(user.ID, recipeID)
	if err != nil || recipe == nil {
		writeError(w, http.StatusNotFound, "recipe not found")
		return
	}
	if ingID == "" {
		switch r.Method {
		case "GET":
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: recipe.Ingredients})
		case "POST":
			var req CreateIngredientReq
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid JSON")
				return
			}
			ing, err := s.store.CreateIngredient(recipeID, &req)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "failed to create ingredient")
				return
			}
			writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: ing})
		default:
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		}
		return
	}
	switch r.Method {
	case "PUT":
		var req CreateIngredientReq
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		ing, err := s.store.UpdateIngredient(ingID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update ingredient")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: ing})
	case "DELETE":
		if err := s.store.DeleteIngredient(ingID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete ingredient")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) recipeCategoriesRouter(w http.ResponseWriter, r *http.Request, recipeID string) {
	switch r.Method {
	case "GET":
		rcs, err := s.store.ListRecipeCategories(recipeID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list recipe categories")
			return
		}
		if rcs == nil {
			rcs = []RecipeCategory{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: rcs})
	case "POST":
		var req struct {
			CategoryID string `json:"categoryId"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.CategoryID == "" {
			writeError(w, http.StatusBadRequest, "categoryId is required")
			return
		}
		rc, err := s.store.AddRecipeCategory(recipeID, req.CategoryID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add recipe category")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: rc})
	case "DELETE":
		categoryID := r.URL.Query().Get("categoryId")
		if categoryID == "" {
			writeError(w, http.StatusBadRequest, "categoryId is required")
			return
		}
		if err := s.store.RemoveRecipeCategory(recipeID, categoryID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to remove recipe category")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Profiles ─────────────────────────────────────────────────────────

func (s *Server) profilesRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		profiles, err := s.store.ListProfiles(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list profiles")
			return
		}
		if profiles == nil {
			profiles = []PersonProfile{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: profiles})
	case "POST":
		var req CreateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := validateRequired(map[string]string{"name": req.Name, "sex": req.Sex}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		profile, err := s.store.CreateProfile(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create profile")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: profile})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) profileItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	path := r.URL.Path
	if strings.Contains(path, "/log") {
		s.foodLogRouter(w, r, id)
		return
	}
	if strings.Contains(path, "/weight") {
		s.weightRouter(w, r, id)
		return
	}
	switch r.Method {
	case "GET":
		p, err := s.store.GetProfile(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get profile")
			return
		}
		if p == nil {
			writeError(w, http.StatusNotFound, "profile not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
	case "PUT":
		var req CreateProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		p, err := s.store.UpdateProfile(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update profile")
			return
		}
		if p == nil {
			writeError(w, http.StatusNotFound, "profile not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
	case "DELETE":
		if err := s.store.DeleteProfile(user.ID, id); err != nil {
			writeError(w, http.StatusNotFound, "profile not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Food Log ─────────────────────────────────────────────────────────

func (s *Server) foodLogRouter(w http.ResponseWriter, r *http.Request, profileID string) {
	user := getUserFromContext(r)
	if profileID == "" {
		writeError(w, http.StatusBadRequest, "profile id is required")
		return
	}
	switch r.Method {
	case "GET":
		date := r.URL.Query().Get("date")
		startDate := r.URL.Query().Get("startDate")
		endDate := r.URL.Query().Get("endDate")
		var entries []FoodLogEntry
		var err error
		if startDate != "" && endDate != "" {
			entries, err = s.store.ListFoodLogEntriesByDateRange(profileID, startDate, endDate)
		} else {
			entries, err = s.store.ListFoodLogEntries(profileID, date)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list food log")
			return
		}
		if entries == nil {
			entries = []FoodLogEntry{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entries})
	case "POST":
		var req CreateFoodLogRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := validateRequired(map[string]string{"date": req.Date, "name": req.Name, "mealSlot": req.MealSlot, "sourceType": req.SourceType}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		entry, err := s.store.CreateFoodLogEntry(user.ID, profileID, &req)
		if err != nil {
			log.Printf("Error creating food log entry (profileID=%s, sourceType=%s, mealSlot=%s): %v", profileID, req.SourceType, req.MealSlot, err)
			writeError(w, http.StatusInternalServerError, "failed to create food log entry")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: entry})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) foodLogEntryRouter(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case "PUT":
		var req CreateFoodLogRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		entry, err := s.store.UpdateFoodLogEntry(id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update food log entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entry})
	case "DELETE":
		if err := s.store.DeleteFoodLogEntry(id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete food log entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Weight Entries ───────────────────────────────────────────────────

func (s *Server) weightRouter(w http.ResponseWriter, r *http.Request, profileID string) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		from := r.URL.Query().Get("from")
		to := r.URL.Query().Get("to")
		entries, err := s.store.ListWeightEntries(profileID, from, to)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list weight entries")
			return
		}
		if entries == nil {
			entries = []WeightEntry{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entries})
	case "POST":
		var req CreateWeightEntryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := validateRequired(map[string]string{"date": req.Date}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		entry, err := s.store.CreateWeightEntry(user.ID, profileID, &req)
		if err != nil {
			log.Printf("[ERROR] CreateWeightEntry: %v", err)
			writeError(w, http.StatusInternalServerError, "failed to create weight entry")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: entry})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) weightEntryRouter(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case "PUT":
		var req CreateWeightEntryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		entry, err := s.store.UpdateWeightEntry(id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update weight entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entry})
	case "DELETE":
		if err := s.store.DeleteWeightEntry(id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete weight entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Meal Plans ───────────────────────────────────────────────────────

func (s *Server) mealPlansRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		plans, err := s.store.ListMealPlans(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list meal plans")
			return
		}
		if plans == nil {
			plans = []MealPlan{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: plans})
	case "POST":
		var req CreateMealPlanRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		plan, err := s.store.CreateMealPlan(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create meal plan")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: plan})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) mealPlanItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	if strings.HasPrefix(id, "week/") {
		weekStart := strings.TrimPrefix(id, "week/")
		plan, err := s.store.GetMealPlanByWeekStart(user.ID, weekStart)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get meal plan")
			return
		}
		if plan == nil {
			writeError(w, http.StatusNotFound, "meal plan not found for this week")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: plan})
		return
	}
	switch r.Method {
	case "GET":
		plan, err := s.store.GetMealPlan(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get meal plan")
			return
		}
		if plan == nil {
			writeError(w, http.StatusNotFound, "meal plan not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: plan})
	case "PUT":
		existing, err := s.store.GetMealPlan(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get meal plan")
			return
		}
		if existing == nil {
			writeError(w, http.StatusNotFound, "meal plan not found")
			return
		}
		// Seed request with existing values so a partial body only overwrites
		// the fields it actually provides (PATCH semantics over PUT).
		var req CreateMealPlanRequest
		base, _ := json.Marshal(existing)
		json.Unmarshal(base, &req)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		plan, err := s.store.UpdateMealPlan(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update meal plan")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: plan})
	case "DELETE":
		if err := s.store.DeleteMealPlan(user.ID, id); err != nil {
			writeError(w, http.StatusNotFound, "meal plan not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) dayPlanEntriesRouter(w http.ResponseWriter, r *http.Request, mealPlanID string) {
	switch r.Method {
	case "GET":
		entries, err := s.store.ListDayPlanEntries(mealPlanID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list entries")
			return
		}
		if entries == nil {
			entries = []DayPlanEntry{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entries})
	case "POST":
		var req CreateDayPlanEntryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		entry, err := s.store.CreateDayPlanEntry(mealPlanID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create entry")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: entry})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) dayPlanEntryItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case "PUT":
		existing, err := s.store.GetDayPlanEntryByID(id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get entry")
			return
		}
		if existing == nil {
			writeError(w, http.StatusNotFound, "entry not found")
			return
		}
		// Seed request with existing values so a partial body only overwrites
		// the fields it actually provides (PATCH semantics over PUT).
		var req CreateDayPlanEntryRequest
		base, _ := json.Marshal(existing)
		json.Unmarshal(base, &req)
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		entry, err := s.store.UpdateDayPlanEntry(id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: entry})
	case "DELETE":
		if err := s.store.DeleteDayPlanEntry(id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete entry")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) mealGroupsRouter(w http.ResponseWriter, r *http.Request, mealPlanID string) {
	if r.Method == "GET" {
		groups, err := s.store.ListMealGroups(mealPlanID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list groups")
			return
		}
		if groups == nil {
			groups = []MealGroup{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: groups})
		return
	}
	if r.Method == "POST" {
		var req struct {
			Name     string `json:"name"`
			Date     string `json:"date"`
			Slot     string `json:"slot"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		group, err := s.store.CreateMealGroup(mealPlanID, req.Name, req.Date, req.Slot, req.Position)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create group")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: group})
		return
	}
	if r.Method == "DELETE" {
		id := r.URL.Query().Get("id")
		if id == "" {
			writeError(w, http.StatusBadRequest, "id is required")
			return
		}
		if err := s.store.DeleteMealGroup(id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete group")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

// ── Books ────────────────────────────────────────────────────────────

func (s *Server) booksRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		books, err := s.store.ListBooks(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list books")
			return
		}
		if books == nil {
			books = []RecipeBook{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: books})
	case "POST":
		var req CreateBookRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := validateRequired(map[string]string{"title": req.Title}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		book, err := s.store.CreateBook(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create book")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: book})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) bookItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	path := r.URL.Path
	if strings.Contains(path, "/chapters") {
		bookID := strings.SplitN(id, "/", 2)[0]
		s.chaptersRouter(w, r, bookID)
		return
	}
	if strings.Contains(path, "/pages") {
		bookID := strings.SplitN(id, "/", 2)[0]
		s.bookPagesRouter(w, r, bookID)
		return
	}
	if strings.HasSuffix(path, "/items/reorder") {
		bookID := strings.SplitN(id, "/", 2)[0]
		s.bookItemsReorderHandler(w, r, bookID)
		return
	}
	switch r.Method {
	case "GET":
		book, err := s.store.GetBook(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get book")
			return
		}
		if book == nil {
			writeError(w, http.StatusNotFound, "book not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: book})
	case "PUT":
		var req CreateBookRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		book, err := s.store.UpdateBook(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update book")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: book})
	case "DELETE":
		if err := s.store.DeleteBook(user.ID, id); err != nil {
			writeError(w, http.StatusNotFound, "book not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) chaptersRouter(w http.ResponseWriter, r *http.Request, bookID string) {
	parts := strings.Split(strings.TrimPrefix(r.URL.Path, "/api/books/"+bookID+"/chapters/"), "/")
	if len(parts) > 0 && parts[0] != "" {
		chapterID := parts[0]
		if len(parts) > 1 {
			if parts[1] == "recipes" {
				s.chapterRecipesRouter(w, r, chapterID)
				return
			}
			if parts[1] == "pages" {
				s.chapterPagesRouter(w, r, chapterID)
				return
			}
		}
		s.chapterItemRouter(w, r, chapterID)
		return
	}
	switch r.Method {
	case "GET":
		chapters, err := s.store.ListChapters(bookID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list chapters")
			return
		}
		if chapters == nil {
			chapters = []Chapter{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: chapters})
	case "POST":
		var req CreateChapterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		ch, err := s.store.CreateChapter(bookID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create chapter")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: ch})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) chapterItemRouter(w http.ResponseWriter, r *http.Request, chapterID string) {
	switch r.Method {
	case "PUT":
		var req CreateChapterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		ch, err := s.store.UpdateChapter(chapterID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update chapter")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: ch})
	case "DELETE":
		if err := s.store.DeleteChapter(chapterID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete chapter")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) chapterRecipesRouter(w http.ResponseWriter, r *http.Request, chapterID string) {
	switch r.Method {
	case "GET":
		crs, err := s.store.ListChapterRecipes(chapterID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list chapter recipes")
			return
		}
		if crs == nil { crs = []ChapterRecipe{} }
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: crs})
	case "POST":
		var req struct {
			RecipeID string `json:"recipeId"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		cr, err := s.store.AddChapterRecipe(chapterID, req.RecipeID, req.Position)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add chapter recipe")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: cr})
	case "DELETE":
		recipeID := r.URL.Query().Get("recipeId")
		if recipeID == "" {
			// Fall back to a path segment: .../recipes/{recipeId}
			if idx := strings.LastIndex(r.URL.Path, "/recipes/"); idx >= 0 {
				recipeID = strings.TrimSuffix(r.URL.Path[idx+len("/recipes/"):], "/")
			}
		}
		if recipeID == "" {
			writeError(w, http.StatusBadRequest, "recipeId is required")
			return
		}
		if err := s.store.RemoveChapterRecipe(chapterID, recipeID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to remove chapter recipe")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) chapterPagesRouter(w http.ResponseWriter, r *http.Request, chapterID string) {
	parts := strings.Split(r.URL.Path, "/pages/")
	if len(parts) > 1 && parts[1] != "" {
		s.chapterPageItemRouter(w, r, parts[1])
		return
	}
	switch r.Method {
	case "GET":
		pages, err := s.store.ListChapterPages(chapterID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list pages")
			return
		}
		if pages == nil { pages = []ChapterPage{} }
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: pages})
	case "POST":
		var req struct {
			Title    string `json:"title"`
			Content  string `json:"content"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		p, err := s.store.CreateChapterPage(chapterID, req.Title, req.Content, req.Position)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create page")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: p})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// chapterPageItemRouter handles update/delete of a single chapter page by ID.
func (s *Server) chapterPageItemRouter(w http.ResponseWriter, r *http.Request, pageID string) {
	switch r.Method {
	case "PUT":
		var req struct {
			Title    string `json:"title"`
			Content  string `json:"content"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		p, err := s.store.UpdateChapterPage(pageID, req.Title, req.Content, req.Position)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update page")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
	case "DELETE":
		if err := s.store.DeleteChapterPage(pageID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete page")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Ordering & moves ─────────────────────────────────────────────────

// bookItemsReorderHandler reorders the interleaved book-level list
// (chapters + book pages) addressed by PUT /api/books/{bookID}/items/reorder.
func (s *Server) bookItemsReorderHandler(w http.ResponseWriter, r *http.Request, bookID string) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Items []BookLevelItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.store.ReorderBookLevelItems(bookID, req.Items); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reorder book items")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// chapterItemsReorderHandler reorders the interleaved chapter list
// (recipes + pages) addressed by PUT /api/chapters/{chapterID}/items/reorder.
func (s *Server) chapterItemsReorderHandler(w http.ResponseWriter, r *http.Request, chapterID string) {
	if r.Method != http.MethodPut {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		Items []ChapterItem `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.store.ReorderChapterItems(chapterID, req.Items); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reorder chapter items")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// moveChapterRecipeHandler moves a recipe from one chapter to another,
// addressed by POST /api/chapter-recipes/{chapterRecipeID}/move.
func (s *Server) moveChapterRecipeHandler(w http.ResponseWriter, r *http.Request, chapterRecipeID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		TargetChapterID string `json:"targetChapterId"`
		Position        int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.TargetChapterID == "" {
		writeError(w, http.StatusBadRequest, "targetChapterId is required")
		return
	}
	if err := s.store.MoveRecipeBetweenChapters(chapterRecipeID, req.TargetChapterID, req.Position); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to move recipe")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// movePageBetweenChaptersHandler moves a chapter page from one chapter to
// another, addressed by POST /api/pages/{pageID}/move.
func (s *Server) movePageBetweenChaptersHandler(w http.ResponseWriter, r *http.Request, pageID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		TargetChapterID string `json:"targetChapterId"`
		Position        int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.TargetChapterID == "" {
		writeError(w, http.StatusBadRequest, "targetChapterId is required")
		return
	}
	if err := s.store.MovePageBetweenChapters(pageID, req.TargetChapterID, req.Position); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to move page")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// convertPageToBookHandler moves a chapter page to the book level,
// addressed by POST /api/pages/{pageID}/to-book.
func (s *Server) convertPageToBookHandler(w http.ResponseWriter, r *http.Request, pageID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		BookID   string `json:"bookId"`
		Position int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.BookID == "" {
		writeError(w, http.StatusBadRequest, "bookId is required")
		return
	}
	p, err := s.store.ConvertChapterPageToBookPage(pageID, req.BookID, req.Position)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to convert page")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
}

// convertPageToChapterHandler moves a book page into a chapter,
// addressed by POST /api/pages/{pageID}/to-chapter.
func (s *Server) convertPageToChapterHandler(w http.ResponseWriter, r *http.Request, pageID string) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req struct {
		ChapterID string `json:"chapterId"`
		Position  int    `json:"position"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.ChapterID == "" {
		writeError(w, http.StatusBadRequest, "chapterId is required")
		return
	}
	p, err := s.store.ConvertBookPageToChapterPage(pageID, req.ChapterID, req.Position)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to convert page")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
}

func (s *Server) bookPagesRouter(w http.ResponseWriter, r *http.Request, bookID string) {
	switch r.Method {
	case "GET":
		pages, err := s.store.ListBookPages(bookID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list pages")
			return
		}
		if pages == nil { pages = []BookPage{} }
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: pages})
	case "POST":
		var req struct {
			Title    string `json:"title"`
			Content  string `json:"content"`
			Position int    `json:"position"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		p, err := s.store.CreateBookPage(bookID, req.Title, req.Content, req.Position)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create page")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: p})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Categories ───────────────────────────────────────────────────────

func (s *Server) categoriesRouter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		cats, err := s.store.ListCategories()
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list categories")
			return
		}
		if cats == nil { cats = []Category{} }
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: cats})
	case "POST":
		var req CreateCategoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		cat, err := s.store.CreateCategory(&req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create category")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: cat})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) categoryItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	switch r.Method {
	case "PUT":
		var req CreateCategoryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		cat, err := s.store.UpdateCategory(id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update category")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: cat})
	case "DELETE":
		if err := s.store.DeleteCategory(id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete category")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) categoryDescendants(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	cats, err := s.store.ListCategories()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list categories")
		return
	}
	ids := []string{id}
	queue := []string{id}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, c := range cats {
			if c.ParentID != nil && *c.ParentID == current {
				ids = append(ids, c.ID)
				queue = append(queue, c.ID)
			}
		}
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: ids})
}

func (s *Server) categoryRecipes(w http.ResponseWriter, r *http.Request, id string) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	rcs, err := s.store.RecipeCategoriesByCategory(id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list recipes by category")
		return
	}
	if rcs == nil { rcs = []RecipeCategory{} }
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: rcs})
}

// ── Custom Foods ─────────────────────────────────────────────────────

func (s *Server) customFoodsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		foods, err := s.store.ListCustomFoods(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list custom foods")
			return
		}
		if foods == nil { foods = []CustomFood{} }
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: foods})
	case "POST":
		var req CreateCustomFoodRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if err := validateRequired(map[string]string{"name": req.Name}); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		food, err := s.store.CreateCustomFood(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create custom food")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: food})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) customFoodItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	path := r.URL.Path
	if strings.HasSuffix(path, "/share") {
		if r.Method != "POST" {
			writeError(w, http.StatusMethodNotAllowed, "method not allowed")
			return
		}
		if err := s.store.ShareCustomFood(user.ID, id); err != nil {
			writeError(w, http.StatusNotFound, "custom food not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
		return
	}
	switch r.Method {
	case "PUT":
		var req CreateCustomFoodRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		food, err := s.store.UpdateCustomFood(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update custom food")
			return
		}
		if food == nil {
			writeError(w, http.StatusNotFound, "custom food not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: food})
	case "DELETE":
		if err := s.store.DeleteCustomFood(user.ID, id); err != nil {
			writeError(w, http.StatusNotFound, "custom food not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) communityCustomFoodsRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	page, perPage := validatePagination(queryInt(r, "page", 1), queryInt(r, "perPage", 20))
	foods, total, err := s.store.ListSharedCustomFoods(page, perPage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list community foods")
		return
	}
	if foods == nil { foods = []CustomFood{} }
	totalPages := total / perPage
	if total%perPage > 0 { totalPages++ }
	writeJSON(w, http.StatusOK, PaginatedResponse{Data: foods, Total: total, Page: page, PerPage: perPage, TotalPages: totalPages})
}

// ── Grocery Checklists ───────────────────────────────────────────────

func (s *Server) groceryRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	weekStart := r.URL.Query().Get("weekStart")
	if weekStart == "" {
		writeError(w, http.StatusBadRequest, "weekStart is required")
		return
	}
	switch r.Method {
	case "GET":
		g, err := s.store.GetGroceryChecklist(user.ID, weekStart)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get grocery checklist")
			return
		}
		if g == nil {
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: nil})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: g})
	case "PUT", "POST":
		var g GroceryChecklist
		if err := json.NewDecoder(r.Body).Decode(&g); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		g.UserID = user.ID
		result, err := s.store.UpsertGroceryChecklist(user.ID, &g)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save grocery checklist")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: result})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── API Key Management ────────────────────────────────────────────────

func (s *Server) apiKeysRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	switch r.Method {
	case "GET":
		keys, err := s.store.ListAPIKeys(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list API keys")
			return
		}
		if keys == nil {
			keys = []ApiKey{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: keys})
	case "POST":
		var req struct {
			Name        string `json:"name"`
			Permissions string `json:"permissions"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if req.Permissions == "" {
			req.Permissions = "{}"
		}
		key, raw, err := s.store.CreateAPIKey(user.ID, req.Name, req.Permissions)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create API key")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: map[string]interface{}{
			"id":          key.ID,
			"name":        key.Name,
			"key":         raw,
			"keyPrefix":   key.KeyPrefix,
			"permissions": key.Permissions,
			"createdAt":   key.CreatedAt,
		}})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) apiKeyItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if r.Method == "DELETE" {
		err := s.store.DeleteAPIKey(user.ID, id)
		if err != nil {
			writeError(w, http.StatusNotFound, "API key not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
		return
	}
	writeError(w, http.StatusMethodNotAllowed, "method not allowed")
}

// ── Helper ───────────────────────────────────────────────────────────

func queryInt(r *http.Request, key string, defaultVal int) int {
	v := r.URL.Query().Get(key)
	if v == "" {
		return defaultVal
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return defaultVal
	}
	return n
}
