package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strconv"
	"strings"
)

func (s *Server) foodSearchHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	q := r.URL.Query().Get("q")
	if q == "" {
		q = r.URL.Query().Get("query")
	}
	page, perPage := validatePagination(queryInt(r, "page", 1), queryInt(r, "perPage", 20))
	foods, total, err := s.store.SearchFoods(q, page, perPage)
	if err != nil {
		log.Printf("Error searching foods: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to search foods")
		return
	}
	source := "local"

	// Local miss: try the live USDA API using the user's FDA key, then cache
	// the results so subsequent searches are served locally.
	if total == 0 && q != "" && page == 1 {
		liveFoods, src := s.tryUSDAFallback(r, q)
		if len(liveFoods) > 0 {
			foods = liveFoods
			total = len(liveFoods)
			source = src
		}
	}

	if foods == nil {
		foods = []FoodItem{}
	}
	totalPages := total / perPage
	if total%perPage > 0 {
		totalPages++
	}
	writeJSON(w, http.StatusOK, FoodSearchResult{Foods: foods, Total: total, Page: page, PerPage: perPage, TotalPages: totalPages, Source: source})
}

// tryUSDAFallback resolves the requesting user's FDA API key, queries the live
// USDA FoodData Central API, and caches the results into the shared food table.
// It returns the foods and the source label ("fda"). On any failure it returns
// a nil slice (caller keeps local results).
func (s *Server) tryUSDAFallback(r *http.Request, query string) ([]FoodItem, string) {
	user := getUserFromContext(r)
	if user == nil {
		return nil, ""
	}
	enc, err := s.store.GetSecret(user.ID, "fda-api-key")
	if err != nil || len(enc) == 0 {
		return nil, ""
	}
	decrypted, err := decryptSecret(enc, s.auth.SecretKey())
	if err != nil {
		log.Printf("Error decrypting FDA key: %v", err)
		return nil, ""
	}
	apiKey := string(decrypted)
	if apiKey == "" || apiKey == "DEMO_KEY" {
		return nil, ""
	}

	liveFoods, err := searchUSDALive(query, apiKey, 50)
	if err != nil {
		log.Printf("USDA live search failed for %q: %v", query, err)
		return nil, ""
	}
	if len(liveFoods) == 0 {
		return nil, ""
	}

	// Cache into the shared local DB so future searches are local. Errors are
	// non-fatal — we still return the live results to the caller.
	if _, err := s.store.CreateFoodItems(liveFoods); err != nil {
		log.Printf("Warning: failed to cache USDA results: %v", err)
	}
	return liveFoods, "fda"
}

func (s *Server) foodItemHandler(w http.ResponseWriter, r *http.Request, path string) {
	if strings.HasPrefix(path, "upc/") {
		gtinUpc := strings.TrimPrefix(path, "upc/")
		food, err := s.store.GetFoodByGtinUpc(gtinUpc)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to get food")
			return
		}
		if food == nil || !hasMeaningfulFoodNutrition(*food) {
			writeError(w, http.StatusNotFound, "food not found")
			return
		}
		writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: food})
		return
	}
	fdcIDStr := path
	if fdcIDStr == "" {
		writeError(w, http.StatusBadRequest, "fdc_id is required")
		return
	}
	fdcID, err := strconv.Atoi(fdcIDStr)
	if err != nil {
		fdcID = queryInt(r, "fdcId", 0)
	}
	if fdcID == 0 {
		writeError(w, http.StatusBadRequest, "invalid fdc_id")
		return
	}
	food, err := s.store.GetFoodByFdcID(fdcID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get food")
		return
	}
	if food == nil || !hasMeaningfulFoodNutrition(*food) {
		writeError(w, http.StatusNotFound, "food not found")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: food})
}

func (s *Server) foodSeedRouter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "GET":
		s.listSeedJobsHandler(w, r)
	case "POST":
		s.startSeedJobHandler(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) foodSeedItemRouter(w http.ResponseWriter, r *http.Request, jobIDStr string) {
	jobID, err := strconv.Atoi(jobIDStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid job ID")
		return
	}
	switch r.Method {
	case "GET":
		s.getSeedJobHandler(w, r, jobID)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) foodStatsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "GET" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	stats, err := s.store.GetFoodStats()
	if err != nil {
		log.Printf("Error getting food stats: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get food stats")
		return
	}
	if stats.ByDataType == nil {
		stats.ByDataType = []FoodTypeCount{}
	}
	if stats.BySource == nil {
		stats.BySource = []FoodSourceCount{}
	}
	writeJSON(w, http.StatusOK, stats)
}

func (s *Server) foodCacheHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case "POST":
		s.cacheFoodsHandler(w, r)
	case "DELETE":
		s.clearFoodCacheHandler(w, r)
	default:
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (s *Server) foodSeedUploadHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := r.ParseMultipartForm(512 << 20); err != nil {
		log.Printf("Error parsing multipart form: %v", err)
		writeError(w, http.StatusBadRequest, "failed to parse form (file may be too large)")
		return
	}
	file, _, err := r.FormFile("file")
	if err != nil {
		writeError(w, http.StatusBadRequest, "no file provided")
		return
	}
	defer file.Close()
	dataType := r.FormValue("dataType")
	if dataType == "" {
		dataType = "uploaded"
	}
	body, err := io.ReadAll(file)
	if err != nil {
		log.Printf("Error reading upload file: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to read file")
		return
	}
	var foods []FoodItem
	if err := json.Unmarshal(body, &foods); err != nil {
		log.Printf("Error parsing food JSON: %v", err)
		writeError(w, http.StatusBadRequest, "invalid JSON: array of food items expected")
		return
	}
	foods = foodsWithMeaningfulNutrition(foods)
	if len(foods) == 0 {
		writeError(w, http.StatusBadRequest, "no foods with meaningful nutrition to import")
		return
	}
	job, err := s.store.CreateSeedJob(dataType, "", "upload")
	if err != nil {
		log.Printf("Error creating seed job: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to create seed job")
		return
	}
	totalInserted := 0
	batchSize := 500
	for i := 0; i < len(foods); i += batchSize {
		end := i + batchSize
		if end > len(foods) {
			end = len(foods)
		}
		batch := foods[i:end]
		inserted, err := s.store.CreateFoodItems(batch)
		totalInserted += inserted
		if err != nil {
			log.Printf("Error importing food batch (items %d-%d): %v", i, end, err)
			s.store.UpdateSeedJob(job.ID, "failed", totalInserted, 0, err.Error())
			writeError(w, http.StatusInternalServerError, "failed to import foods")
			return
		}
		progress := float64(end) / float64(len(foods)) * 100
		s.store.UpdateSeedJob(job.ID, "importing", totalInserted, progress, "")
	}
	s.store.UpdateSeedJob(job.ID, "completed", totalInserted, 100, "")
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]interface{}{"jobId": job.ID, "inserted": totalInserted}})
}

func (s *Server) listSeedJobsHandler(w http.ResponseWriter, r *http.Request) {
	type datasetStatus struct {
		Key          string  `json:"key"`
		Name         string  `json:"name"`
		ReleaseDate  string  `json:"releaseDate"`
		LastImported *string `json:"lastImported"`
		RecordCount  int     `json:"recordCount"`
		Status       string  `json:"status"`
		Format       string  `json:"format"`
	}

	catalog := []struct {
		key    string
		name   string
		format string
	}{
		{"foundation", "Foundation Foods", "json"},
		{"sr_legacy", "SR Legacy (2018)", "json"},
		{"fndds", "FNDDS (2019-2020)", "json"},
		{"branded", "Branded Food Products", "json"},
		{"all", "Full USDA FoodData Central", "json"},
	}

	jobs, _ := s.store.ListSeedJobs()
	jobMap := map[string]SeedJob{}
	for _, j := range jobs {
		if j.Status == "completed" {
			if existing, ok := jobMap[j.DataType]; !ok || j.CreatedAt.After(existing.CreatedAt) {
				jobMap[j.DataType] = j
			}
		}
	}

	var result []datasetStatus
	for _, ds := range catalog {
		status := "not_imported"
		var lastImported *string
		recordCount := 0
		releaseDate := ""
		if job, ok := jobMap[ds.key]; ok {
			status = "imported"
			recordCount = job.RecordCount
			if job.CompletedAt != nil {
				t := job.CompletedAt.Format("2006-01-02T15:04:05Z")
				lastImported = &t
			}
			if job.ReleaseDate != "" {
				releaseDate = job.ReleaseDate
			}
		}
		result = append(result, datasetStatus{
			Key:          ds.key,
			Name:         ds.name,
			ReleaseDate:  releaseDate,
			LastImported: lastImported,
			RecordCount:  recordCount,
			Status:       status,
			Format:       ds.format,
		})
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: result})
}

func (s *Server) startSeedJobHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DataType string `json:"dataType"`
		Dataset  string `json:"dataset"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	dataType := req.DataType
	if dataType == "" {
		dataType = req.Dataset
	}
	if dataType == "" {
		writeError(w, http.StatusBadRequest, "dataType is required")
		return
	}
	job, err := s.store.CreateSeedJob(dataType, "", dataType)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create seed job")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]interface{}{"jobId": job.ID}})
}

func (s *Server) getSeedJobHandler(w http.ResponseWriter, r *http.Request, jobID int) {
	jobs, err := s.store.ListSeedJobs()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get seed job")
		return
	}
	for _, j := range jobs {
		if j.ID == jobID {
			writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: j})
			return
		}
	}
	writeError(w, http.StatusNotFound, "job not found")
}

func (s *Server) cacheFoodsHandler(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Foods []FoodItem `json:"foods"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if len(req.Foods) == 0 {
		writeError(w, http.StatusBadRequest, "foods array is required")
		return
	}
	foods := foodsWithMeaningfulNutrition(req.Foods)
	if len(foods) == 0 {
		writeError(w, http.StatusBadRequest, "no foods with meaningful nutrition to cache")
		return
	}
	inserted, err := s.store.CreateFoodItems(foods)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to cache foods")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]interface{}{"cached": inserted}})
}

func (s *Server) clearFoodCacheHandler(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteAllFoods(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to clear food cache")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: map[string]interface{}{"message": "food cache cleared"}})
}
