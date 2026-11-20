package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// ── Settings ─────────────────────────────────────────────────────────

func (s *Server) settingsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		us, err := s.store.GetSettings(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get settings")
			return
		}
		if us == nil {
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]interface{}{"settings": map[string]interface{}{}}})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: us})
	case "PUT":
		var req UpdateSettingsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		us, err := s.store.UpsertSettings(user.ID, req.Settings)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save settings")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: us})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) locationRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		loc, err := s.store.GetLocation(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get location")
			return
		}
		if loc == nil {
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: nil})
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: loc})
	case "PUT":
		var req UpdateLocationRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Country == "" || req.Region == "" {
			writeError(w, http.StatusBadRequest, "country and region are required")
			return
		}
		loc, err := s.store.UpsertLocation(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save location")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: loc})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) seasonalFoodsRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	country := r.URL.Query().Get("country")
	region := r.URL.Query().Get("region")
	monthStr := r.URL.Query().Get("month")
	if country == "" || region == "" || monthStr == "" {
		writeError(w, http.StatusBadRequest, "country, region, and month are required")
		return
	}
	var month int
	fmt.Sscanf(monthStr, "%d", &month)
	if month < 1 || month > 12 {
		writeError(w, http.StatusBadRequest, "month must be 1-12")
		return
	}
	foods, err := s.store.GetSeasonalFoods(country, region, month)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get seasonal foods")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: foods})
}

// ── Templates ────────────────────────────────────────────────────────

func (s *Server) templatesRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		tmplType := r.URL.Query().Get("type")
		var templates []Template
		var err error
		if tmplType != "" {
			templates, err = s.store.ListTemplatesByType(user.ID, tmplType)
		} else {
			templates, err = s.store.ListTemplates(user.ID)
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list templates")
			return
		}
		if templates == nil {
			templates = []Template{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: templates})
	case "POST":
		var req CreateTemplateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" || req.Type == "" {
			writeError(w, http.StatusBadRequest, "name and type are required")
			return
		}
		if req.IsDefault && !user.IsAdmin {
			writeError(w, http.StatusForbidden, "administrator access required to publish a default template")
			return
		}
		if req.Type != "recipe" && req.Type != "book-page" && req.Type != "book-recipe" {
			writeError(w, http.StatusBadRequest, "type must be recipe, book-page, or book-recipe")
			return
		}
		t, err := s.store.CreateTemplate(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create template")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: t})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) templateItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		t, err := s.store.GetTemplate(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get template")
			return
		}
		if t == nil {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: t})
	case "PUT":
		var req UpdateTemplateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		current, err := s.store.GetTemplate(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get template")
			return
		}
		if current == nil {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		if current.IsDefault && !user.IsAdmin {
			writeError(w, http.StatusForbidden, "administrator access required")
			return
		}
		if req.IsDefault != nil && *req.IsDefault && !user.IsAdmin {
			writeError(w, http.StatusForbidden, "administrator access required to publish a default template")
			return
		}
		t, err := s.store.UpdateTemplate(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update template")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: t})
	case "DELETE":
		t, err := s.store.GetTemplate(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get template")
			return
		}
		if t == nil {
			writeError(w, http.StatusNotFound, "template not found")
			return
		}
		if t.IsDefault && !user.IsAdmin {
			writeError(w, http.StatusForbidden, "administrator access required")
			return
		}
		if err := s.store.DeleteTemplate(user.ID, id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete template")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Dietary Profiles ─────────────────────────────────────────────────

func (s *Server) recipeAssessmentsRouter(w http.ResponseWriter, r *http.Request, profileID string) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	profile, err := s.store.GetDietaryProfile(user.ID, profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get dietary profile")
		return
	}
	if profile == nil {
		writeError(w, http.StatusNotFound, "dietary profile not found")
		return
	}
	const pageSize = 100
	page := 1
	assessments := make([]RecipeAssessment, 0)
	for {
		recipes, total, err := s.store.ListRecipes(user.ID, page, pageSize)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to assess recipes")
			return
		}
		for _, recipe := range recipes {
			assessments = append(assessments, assessRecipeNutrients(*profile, recipe))
		}
		if len(assessments) >= total {
			break
		}
		page++
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: assessments})
}

func (s *Server) dietaryProfilesRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		profiles, err := s.store.ListDietaryProfiles(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list dietary profiles")
			return
		}
		if profiles == nil {
			profiles = []DietaryProfile{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: profiles})
	case "POST":
		var req CreateDietaryProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if req.Allergens == "" {
			req.Allergens = "[]"
		}
		if req.DietaryTags == "" {
			req.DietaryTags = "[]"
		}
		if validateDietaryProfileEnumArray(req.Allergens, dietaryProfileAllergens) != nil || validateDietaryProfileEnumArray(req.DietaryTags, dietaryProfileTags) != nil {
			writeError(w, http.StatusBadRequest, "allergens and dietaryTags must be arrays of known values")
			return
		}
		if req.NutrientThresholds == "" {
			req.NutrientThresholds = "[]"
		}
		if err := validateNutrientThresholds(req.NutrientThresholds); err != nil {
			writeError(w, http.StatusBadRequest, "invalid nutrient thresholds")
			return
		}
		p, err := s.store.CreateDietaryProfile(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create dietary profile")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: p})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) dietaryProfileItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	path := r.URL.Path
	if strings.Contains(path, "/allergen-rules") {
		s.allergenRulesRouter(w, r, user, id)
		return
	}
	switch r.Method {
	case "GET":
		p, err := s.store.GetDietaryProfile(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get dietary profile")
			return
		}
		if p == nil {
			writeError(w, http.StatusNotFound, "dietary profile not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
	case "PUT":
		var req UpdateDietaryProfileRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Allergens != nil && validateDietaryProfileEnumArray(*req.Allergens, dietaryProfileAllergens) != nil {
			writeError(w, http.StatusBadRequest, "allergens must be an array of known values")
			return
		}
		if req.DietaryTags != nil && validateDietaryProfileEnumArray(*req.DietaryTags, dietaryProfileTags) != nil {
			writeError(w, http.StatusBadRequest, "dietaryTags must be an array of known values")
			return
		}
		if req.NutrientThresholds != nil {
			if err := validateNutrientThresholds(*req.NutrientThresholds); err != nil {
				writeError(w, http.StatusBadRequest, "invalid nutrient thresholds")
				return
			}
		}
		p, err := s.store.UpdateDietaryProfile(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update dietary profile")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: p})
	case "DELETE":
		p, err := s.store.GetDietaryProfile(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get dietary profile")
			return
		}
		if p == nil {
			writeError(w, http.StatusNotFound, "dietary profile not found")
			return
		}
		if err := s.store.DeleteDietaryProfile(user.ID, id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete dietary profile")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Allergen Rules ───────────────────────────────────────────────────

func (s *Server) allergenRulesRouter(w http.ResponseWriter, r *http.Request, user *User, profileID string) {
	profile, err := s.store.GetDietaryProfile(user.ID, profileID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get dietary profile")
		return
	}
	if profile == nil {
		writeError(w, http.StatusNotFound, "dietary profile not found")
		return
	}
	switch r.Method {
	case "GET":
		rules, err := s.store.ListAllergenRules(user.ID, profileID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list allergen rules")
			return
		}
		if rules == nil {
			rules = []AllergenRule{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: rules})
	case "POST":
		var req CreateAllergenRuleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Allergen == "" {
			writeError(w, http.StatusBadRequest, "allergen is required")
			return
		}
		rule, err := s.store.CreateAllergenRule(user.ID, profileID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create allergen rule")
			return
		}
		if rule == nil {
			writeError(w, http.StatusNotFound, "dietary profile not found")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: rule})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) allergenRuleItemRouter(w http.ResponseWriter, r *http.Request, profileID, id string) {
	user := getUserFromContext(r)
	switch r.Method {
	case "PUT":
		var req UpdateAllergenRuleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		rule, err := s.store.UpdateAllergenRule(user.ID, profileID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update allergen rule")
			return
		}
		if rule == nil {
			writeError(w, http.StatusNotFound, "allergen rule not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: rule})
	case "DELETE":
		if err := s.store.DeleteAllergenRule(user.ID, profileID, id); err != nil {
			writeError(w, http.StatusNotFound, "allergen rule not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Brand Kits ───────────────────────────────────────────────────────

func (s *Server) brandKitsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		kits, err := s.store.ListBrandKits(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list brand kits")
			return
		}
		if kits == nil {
			kits = []BrandKit{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: kits})
	case "POST":
		var req CreateBrandKitRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		k, err := s.store.CreateBrandKit(user.ID, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create brand kit")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: k})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) brandKitItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		k, err := s.store.GetBrandKit(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get brand kit")
			return
		}
		if k == nil {
			writeError(w, http.StatusNotFound, "brand kit not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: k})
	case "PUT":
		var req UpdateBrandKitRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		k, err := s.store.UpdateBrandKit(user.ID, id, &req)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update brand kit")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: k})
	case "DELETE":
		k, err := s.store.GetBrandKit(user.ID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get brand kit")
			return
		}
		if k == nil {
			writeError(w, http.StatusNotFound, "brand kit not found")
			return
		}
		if err := s.store.DeleteBrandKit(user.ID, id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete brand kit")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Pantry Staples ───────────────────────────────────────────────────

func (s *Server) pantryStaplesRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		staples, err := s.store.ListPantryStaples(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list pantry staples")
			return
		}
		if staples == nil {
			staples = []PantryStaple{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: staples})
	case "POST":
		var req CreatePantryStapleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		ps, err := s.store.AddPantryStaple(user.ID, req.Name)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to add pantry staple")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: ps})
	case "DELETE":
		var req CreatePantryStapleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.Name == "" {
			writeError(w, http.StatusBadRequest, "name is required")
			return
		}
		if err := s.store.RemovePantryStaple(user.ID, req.Name); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to remove pantry staple")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── User Secrets ─────────────────────────────────────────────────────

func (s *Server) secretsRouter(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		secrets, err := s.store.ListSecrets(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list secrets")
			return
		}
		if secrets == nil {
			secrets = []UserSecret{}
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: secrets})
	case "POST":
		var req CreateSecretRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.KeyName == "" || req.Value == "" {
			writeError(w, http.StatusBadRequest, "keyName and value are required")
			return
		}
		encrypted, err := encryptSecret([]byte(req.Value), s.auth.SecretKey())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to encrypt secret")
			return
		}
		sec, err := s.store.CreateSecret(user.ID, &req, encrypted)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create secret")
			return
		}
		writeJSON(w, http.StatusCreated, APIResponse{OK: true, Data: sec})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) secretItemRouter(w http.ResponseWriter, r *http.Request, id string) {
	user := getUserFromContext(r)
	switch r.Method {
	case "GET":
		secrets, err := s.store.ListSecrets(user.ID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list secrets")
			return
		}
		for _, sec := range secrets {
			if sec.ID == id {
				encrypted, err := s.store.GetSecret(user.ID, sec.KeyName)
				if err != nil || encrypted == nil {
					writeError(w, http.StatusNotFound, "secret not found")
					return
				}
				decrypted, err := decryptSecret(encrypted, s.auth.SecretKey())
				if err != nil {
					writeError(w, http.StatusInternalServerError, "failed to decrypt secret")
					return
				}
				writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]string{
					"id":      sec.ID,
					"keyName": sec.KeyName,
					"value":   string(decrypted),
				}})
				return
			}
		}
		writeError(w, http.StatusNotFound, "secret not found")
	case "DELETE":
		if err := s.store.DeleteSecret(user.ID, id); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to delete secret")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true})
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// ── Encryption helpers ───────────────────────────────────────────────

func encryptSecret(plaintext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonce := make([]byte, aesGCM.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return aesGCM.Seal(nonce, nonce, plaintext, nil), nil
}

func decryptSecret(ciphertext []byte, key []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aesGCM, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	nonceSize := aesGCM.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, fmt.Errorf("ciphertext too short")
	}
	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	return aesGCM.Open(nil, nonce, ciphertext, nil)
}
