package main

import (
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"
)

type APIResponse struct {
	OK    bool        `json:"ok"`
	Data  interface{} `json:"data,omitempty"`
	Error string      `json:"error,omitempty"`
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":      true,
		"service": "dietledger-sync",
		"version": version,
	})
}

func (s *Server) about(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":        "DietLedger Sync Server",
		"version":     version,
		"description": "Sync and sharing backend for DietLedger",
	})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	if r.Method == "OPTIONS" {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	if r.Method != "POST" {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1024*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}

	var req RegisterRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.Email == "" {
		writeError(w, http.StatusBadRequest, "email is required")
		return
	}
	if req.Password == "" {
		writeError(w, http.StatusBadRequest, "password is required")
		return
	}
	if req.DeviceName == "" {
		req.DeviceName = "Unknown Device"
	}
	if req.DeviceType == "" {
		req.DeviceType = "browser"
	}

	user, err := s.store.CreateUser(req.Email, req.Password, req.DisplayName)
	if err != nil {
		log.Printf("Error creating user: %v", err)
		writeError(w, http.StatusConflict, "email already registered")
		return
	}

	device, err := s.store.CreateDevice(user.ID, req.DeviceName, req.DeviceType)
	if err != nil {
		log.Printf("Error creating device: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to register device")
		return
	}

	writeJSON(w, http.StatusCreated, APIResponse{
		OK: true,
		Data: RegisterResponse{
			UserID:   user.ID,
			DeviceID: device.ID,
			APIKey:   user.APIKey,
		},
	})
}

func (s *Server) push(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}

	var req PushRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	var accepted []string
	var conflicts []ConflictOut

	for _, change := range req.Changes {
		if change.StoreName == "" || change.RecordID == "" {
			continue
		}

		incomingTime := time.Now().UTC()
		if change.Timestamp != "" {
			if parsed, err := time.Parse(time.RFC3339, change.Timestamp); err == nil {
				incomingTime = parsed
			}
		}

		existing, err := s.store.GetSyncRecord(user.ID, change.StoreName, change.RecordID)
		if err != nil {
			log.Printf("Error getting sync record: %v", err)
			continue
		}

		if existing == nil {
			_, err := s.store.InsertSyncRecord(user.ID, change.StoreName, change.RecordID, change.Action, change.Data, change.Checksum, req.DeviceID)
			if err != nil {
				log.Printf("Error inserting sync record: %v", err)
				continue
			}
			accepted = append(accepted, change.RecordID)
		} else if existing.Checksum == change.Checksum {
			accepted = append(accepted, change.RecordID)
		} else {
			if incomingTime.After(existing.Timestamp) {
				err := s.store.UpdateSyncRecord(existing.ID, change.Action, change.Data, change.Checksum, incomingTime, req.DeviceID)
				if err != nil {
					log.Printf("Error updating sync record: %v", err)
					continue
				}
				accepted = append(accepted, change.RecordID)
			} else {
				conflicts = append(conflicts, ConflictOut{
					StoreName:     change.StoreName,
					RecordID:      change.RecordID,
					ServerData:    existing.Data,
					ServerVersion: existing.Version,
					LocalData:     change.Data,
					LocalVersion:  existing.Version + 1,
				})
				s.store.CreateConflict(user.ID, change.StoreName, change.RecordID, change.Data, existing.Data, existing.Version+1, existing.Version)
			}
		}
	}

	if req.DeviceID != "" {
		s.store.UpdateDeviceLastSynced(req.DeviceID, time.Now().UTC())
	}

	writeJSON(w, http.StatusOK, PushResponse{
		Accepted:      accepted,
		Conflicts:     conflicts,
		ServerVersion: time.Now().Unix(),
	})
}

func (s *Server) pull(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	sinceStr := r.URL.Query().Get("since")
	deviceID := r.URL.Query().Get("deviceId")

	var since time.Time
	if sinceStr != "" {
		parsed, err := time.Parse(time.RFC3339, sinceStr)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid 'since' timestamp, use RFC3339 format")
			return
		}
		since = parsed
	}

	records, err := s.store.GetSyncRecordsSince(user.ID, since, deviceID)
	if err != nil {
		log.Printf("Error pulling records: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to fetch records")
		return
	}

	out := make([]SyncRecordOut, 0, len(records))
	for _, r := range records {
		out = append(out, SyncRecordOut{
			ID:        r.ID,
			StoreName: r.StoreName,
			RecordID:  r.RecordID,
			Action:    r.Action,
			Data:      r.Data,
			Version:   r.Version,
			Checksum:  r.Checksum,
			Timestamp: r.Timestamp.Format(time.RFC3339),
			DeviceID:  r.DeviceID,
		})
	}

	writeJSON(w, http.StatusOK, PullResponse{
		Changes:         out,
		ServerTimestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) status(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	devices, err := s.store.GetDevicesByUser(user.ID)
	if err != nil {
		log.Printf("Error getting devices: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get devices")
		return
	}

	totalRecords, err := s.store.CountSyncRecordsByUser(user.ID)
	if err != nil {
		totalRecords = 0
	}

	pendingConflicts, err := s.store.CountPendingConflicts(user.ID)
	if err != nil {
		pendingConflicts = 0
	}

	var lastSyncedAt *time.Time
	for _, d := range devices {
		if d.LastSyncedAt != nil {
			if lastSyncedAt == nil || d.LastSyncedAt.After(*lastSyncedAt) {
				lastSyncedAt = d.LastSyncedAt
			}
		}
	}

	writeJSON(w, http.StatusOK, StatusResponse{
		LastSyncedAt:     lastSyncedAt,
		TotalRecords:     totalRecords,
		Devices:          devices,
		PendingConflicts: pendingConflicts,
	})
}

func (s *Server) listConflicts(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	status := r.URL.Query().Get("status")
	if status == "" {
		status = "pending"
	}

	conflicts, err := s.store.GetConflictsByUser(user.ID, status)
	if err != nil {
		log.Printf("Error getting conflicts: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get conflicts")
		return
	}

	if conflicts == nil {
		conflicts = []Conflict{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":        true,
		"conflicts": conflicts,
	})
}

func (s *Server) resolveConflict(w http.ResponseWriter, r *http.Request, conflictID string) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	if conflictID == "" {
		writeError(w, http.StatusBadRequest, "missing conflict ID")
		return
	}

	conflict, err := s.store.GetConflict(conflictID)
	if err != nil {
		log.Printf("Error getting conflict: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get conflict")
		return
	}
	if conflict == nil || conflict.UserID != user.ID {
		writeError(w, http.StatusNotFound, "conflict not found")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 5*1024*1024)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}

	var req ResolveConflictRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.Resolution != "local" && req.Resolution != "remote" && req.Resolution != "merge" {
		writeError(w, http.StatusBadRequest, "resolution must be 'local', 'remote', or 'merge'")
		return
	}

	var resolvedData string
	switch req.Resolution {
	case "local":
		resolvedData = conflict.LocalData
	case "remote":
		resolvedData = conflict.RemoteData
	case "merge":
		if req.Data == "" {
			writeError(w, http.StatusBadRequest, "merged data is required for 'merge' resolution")
			return
		}
		resolvedData = req.Data
	}

	err = s.store.ResolveConflict(conflictID, req.Resolution, resolvedData)
	if err != nil {
		log.Printf("Error resolving conflict: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to resolve conflict")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":     true,
		"status": "resolved",
	})
}

func (s *Server) removeDevice(w http.ResponseWriter, r *http.Request, deviceID string) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	if deviceID == "" {
		writeError(w, http.StatusBadRequest, "missing device ID")
		return
	}

	devices, err := s.store.GetDevicesByUser(user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get devices")
		return
	}

	found := false
	for _, d := range devices {
		if d.ID == deviceID {
			found = true
			break
		}
	}
	if !found {
		writeError(w, http.StatusNotFound, "device not found")
		return
	}

	if err := s.store.DeleteDevice(deviceID); err != nil {
		log.Printf("Error deleting device: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to delete device")
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok": true,
	})
}

func (s *Server) fullDumpUpload(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	r.Body = http.MaxBytesReader(w, r.Body, s.maxBodyBytes)
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "request body too large")
		return
	}

	var req FullDumpRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	count := 0
	for storeName, records := range req.Data {
		for _, rec := range records {
			ts := time.Now().UTC()
			if rec.Timestamp != "" {
				if parsed, err := time.Parse(time.RFC3339, rec.Timestamp); err == nil {
					ts = parsed
				}
			}

			_, err := s.store.UpsertSyncRecord(user.ID, storeName, rec.RecordID, "upsert", rec.Data, rec.Checksum, req.DeviceID, ts)
			if err != nil {
				log.Printf("Error upserting record %s/%s: %v", storeName, rec.RecordID, err)
				continue
			}
			count++
		}
	}

	if req.DeviceID != "" {
		s.store.UpdateDeviceLastSynced(req.DeviceID, time.Now().UTC())
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ok":            true,
		"recordsSynced": count,
	})
}

func (s *Server) fullDumpDownload(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	w.Header().Set("Content-Type", "application/json")

	records, err := s.store.GetAllSyncRecordsByUser(user.ID)
	if err != nil {
		log.Printf("Error getting all records: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to get records")
		return
	}

	if records == nil {
		records = make(map[string][]SyncRecord)
	}

	data := make(map[string][]SyncRecordOut)
	for storeName, recs := range records {
		out := make([]SyncRecordOut, 0, len(recs))
		for _, r := range recs {
			out = append(out, SyncRecordOut{
				ID:        r.ID,
				StoreName: r.StoreName,
				RecordID:  r.RecordID,
				Action:    r.Action,
				Data:      r.Data,
				Version:   r.Version,
				Checksum:  r.Checksum,
				Timestamp: r.Timestamp.Format(time.RFC3339),
				DeviceID:  r.DeviceID,
			})
		}
		data[storeName] = out
	}

	writeJSON(w, http.StatusOK, FullDumpResponse{
		Data:            data,
		ServerTimestamp: time.Now().UTC().Format(time.RFC3339),
	})
}

// ── Sharing Handlers ─────────────────────────────────────────────────

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
	id := r.URL.Path
	if id == "" {
		s.shareRouter(w, r)
		return
	}
	switch r.Method {
	case "GET":
		s.getShareByToken(w, r, id)
	case "DELETE":
		s.deleteShare(w, r, id)
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

	shared, err := s.store.CreateSharedRecipe(user.ID, req.RecipeID, req.Title, req.Description, req.Category, req.Tags, req.RecipeData, req.IsPublic)
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

func (s *Server) rateRecipe(w http.ResponseWriter, r *http.Request) {
	user := getUserFromContext(r)
	shareToken := r.URL.Path
	shared, err := s.store.GetSharedRecipeByToken(shareToken)
	if err != nil || shared == nil {
		writeError(w, http.StatusNotFound, "shared recipe not found")
		return
	}

	var req RateRecipeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Rating < 1 || req.Rating > 5 {
		writeError(w, http.StatusBadRequest, "rating must be between 1 and 5")
		return
	}

	if err := s.store.UpsertRecipeRating(shared.ID, user.ID, req.Rating); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save rating")
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"ok": true})
}

func (s *Server) communitySearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	category := r.URL.Query().Get("category")
	sort := r.URL.Query().Get("sort")
	page := 1
	perPage := 20
	if p := r.URL.Query().Get("page"); p != "" {
		if v, err := time.Parse("2006", p); err == nil {
			_ = v
		}
	}

	recipes, err := s.store.SearchCommunityRecipes(q, category, sort, page, perPage)
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
