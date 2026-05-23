package main

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	_ "modernc.org/sqlite"
)

type SQLiteStore struct {
	db *sql.DB
}

func NewSQLiteStore(dbPath string) (*SQLiteStore, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(1)

	pragmas := []string{
		"PRAGMA journal_mode=WAL",
		"PRAGMA synchronous=NORMAL",
		"PRAGMA foreign_keys=ON",
		"PRAGMA cache_size=10000",
		"PRAGMA busy_timeout=5000",
	}
	for _, p := range pragmas {
		if _, err := db.Exec(p); err != nil {
			db.Close()
			return nil, fmt.Errorf("set pragma %s: %w", p, err)
		}
	}

	return &SQLiteStore{db: db}, nil
}

func (s *SQLiteStore) Close() error {
	return s.db.Close()
}

func (s *SQLiteStore) InitDB() error {
	schema := `
	CREATE TABLE IF NOT EXISTS users (
		id TEXT PRIMARY KEY,
		email TEXT UNIQUE,
		display_name TEXT,
		password_hash TEXT,
		api_key TEXT UNIQUE NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	CREATE TABLE IF NOT EXISTS devices (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		device_name TEXT,
		device_type TEXT,
		last_synced_at DATETIME,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

	CREATE TABLE IF NOT EXISTS sync_records (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		store_name TEXT NOT NULL,
		record_id TEXT NOT NULL,
		action TEXT NOT NULL DEFAULT 'upsert',
		data TEXT NOT NULL,
		version INTEGER DEFAULT 1,
		checksum TEXT NOT NULL,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		device_id TEXT,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(user_id, store_name, record_id)
	);
	CREATE INDEX IF NOT EXISTS idx_sync_records_user_store ON sync_records(user_id, store_name);
	CREATE INDEX IF NOT EXISTS idx_sync_records_user_ts ON sync_records(user_id, timestamp);
	CREATE INDEX IF NOT EXISTS idx_sync_records_ts ON sync_records(timestamp);

	CREATE TABLE IF NOT EXISTS conflicts (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		store_name TEXT NOT NULL,
		record_id TEXT NOT NULL,
		local_data TEXT NOT NULL,
		remote_data TEXT NOT NULL,
		local_version INTEGER,
		remote_version INTEGER,
		status TEXT DEFAULT 'pending',
		resolution TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		resolved_at DATETIME,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_conflicts_user_status ON conflicts(user_id, status);
	CREATE INDEX IF NOT EXISTS idx_conflicts_user_store ON conflicts(user_id, store_name);

	CREATE TABLE IF NOT EXISTS shared_recipes (
		id TEXT PRIMARY KEY,
		user_id TEXT NOT NULL,
		recipe_id TEXT NOT NULL,
		share_token TEXT UNIQUE NOT NULL,
		is_public BOOLEAN DEFAULT 1,
		title TEXT NOT NULL,
		description TEXT,
		category TEXT,
		tags TEXT DEFAULT '',
		recipe_data TEXT NOT NULL,
		view_count INTEGER DEFAULT 0,
		import_count INTEGER DEFAULT 0,
		average_rating REAL DEFAULT 0,
		rating_count INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_shared_recipes_user ON shared_recipes(user_id);
	CREATE INDEX IF NOT EXISTS idx_shared_recipes_token ON shared_recipes(share_token);
	CREATE INDEX IF NOT EXISTS idx_shared_recipes_public ON shared_recipes(is_public);

	CREATE TABLE IF NOT EXISTS recipe_ratings (
		id TEXT PRIMARY KEY,
		recipe_id TEXT NOT NULL,
		user_id TEXT NOT NULL,
		rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (recipe_id) REFERENCES shared_recipes(id) ON DELETE CASCADE,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
		UNIQUE(recipe_id, user_id)
	);
	CREATE INDEX IF NOT EXISTS idx_ratings_recipe ON recipe_ratings(recipe_id);

	CREATE TABLE IF NOT EXISTS community_categories (
		id TEXT PRIMARY KEY,
		name TEXT NOT NULL,
		slug TEXT UNIQUE NOT NULL
	);
	`
	_, err := s.db.Exec(schema)
	return err
}

func generateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return "dl_" + hex.EncodeToString(b), nil
}

func (s *SQLiteStore) CreateUser(email, password, displayName string) (*User, error) {
	var hash []byte
	var err error
	if password != "" {
		hash, err = bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
		if err != nil {
			return nil, fmt.Errorf("hash password: %w", err)
		}
	}

	apiKey, err := generateAPIKey()
	if err != nil {
		return nil, fmt.Errorf("generate API key: %w", err)
	}

	id := uuid.New().String()
	now := time.Now().UTC()

	_, err = s.db.Exec(
		"INSERT INTO users (id, email, display_name, password_hash, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		id, email, displayName, string(hash), apiKey, now, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert user: %w", err)
	}

	return &User{
		ID:           id,
		Email:        email,
		DisplayName:  displayName,
		PasswordHash: string(hash),
		APIKey:       apiKey,
		CreatedAt:    now,
		UpdatedAt:    now,
	}, nil
}

func (s *SQLiteStore) GetUserByAPIKey(apiKey string) (*User, error) {
	u := &User{}
	err := s.db.QueryRow(
		"SELECT id, email, display_name, password_hash, api_key, created_at, updated_at FROM users WHERE api_key = ?",
		apiKey,
	).Scan(&u.ID, &u.Email, &u.DisplayName, &u.PasswordHash, &u.APIKey, &u.CreatedAt, &u.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return u, nil
}

func (s *SQLiteStore) CreateDevice(userID, name, deviceType string) (*Device, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"INSERT INTO devices (id, user_id, device_name, device_type, created_at) VALUES (?, ?, ?, ?, ?)",
		id, userID, name, deviceType, now,
	)
	if err != nil {
		return nil, fmt.Errorf("insert device: %w", err)
	}
	return &Device{
		ID:         id,
		UserID:     userID,
		DeviceName: name,
		DeviceType: deviceType,
		CreatedAt:  now,
	}, nil
}

func (s *SQLiteStore) GetDevicesByUser(userID string) ([]Device, error) {
	rows, err := s.db.Query(
		"SELECT id, user_id, device_name, device_type, last_synced_at, created_at FROM devices WHERE user_id = ?",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var devices []Device
	for rows.Next() {
		var d Device
		err := rows.Scan(&d.ID, &d.UserID, &d.DeviceName, &d.DeviceType, &d.LastSyncedAt, &d.CreatedAt)
		if err != nil {
			return nil, err
		}
		devices = append(devices, d)
	}
	return devices, nil
}

func (s *SQLiteStore) DeleteDevice(id string) error {
	_, err := s.db.Exec("DELETE FROM devices WHERE id = ?", id)
	return err
}

func (s *SQLiteStore) UpdateDeviceLastSynced(id string, t time.Time) error {
	_, err := s.db.Exec("UPDATE devices SET last_synced_at = ? WHERE id = ?", t, id)
	return err
}

func (s *SQLiteStore) GetSyncRecord(userID, storeName, recordID string) (*SyncRecord, error) {
	r := &SyncRecord{}
	err := s.db.QueryRow(
		"SELECT id, user_id, store_name, record_id, action, data, version, checksum, timestamp, device_id FROM sync_records WHERE user_id = ? AND store_name = ? AND record_id = ?",
		userID, storeName, recordID,
	).Scan(&r.ID, &r.UserID, &r.StoreName, &r.RecordID, &r.Action, &r.Data, &r.Version, &r.Checksum, &r.Timestamp, &r.DeviceID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (s *SQLiteStore) InsertSyncRecord(userID, storeName, recordID, action, data, checksum, deviceID string) (*SyncRecord, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"INSERT INTO sync_records (id, user_id, store_name, record_id, action, data, version, checksum, timestamp, device_id) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)",
		id, userID, storeName, recordID, action, data, checksum, now, deviceID,
	)
	if err != nil {
		return nil, err
	}
	return &SyncRecord{
		ID:        id,
		UserID:    userID,
		StoreName: storeName,
		RecordID:  recordID,
		Action:    action,
		Data:      data,
		Version:   1,
		Checksum:  checksum,
		Timestamp: now,
		DeviceID:  deviceID,
	}, nil
}

func (s *SQLiteStore) UpdateSyncRecord(id, action, data, checksum string, ts time.Time, deviceID string) error {
	_, err := s.db.Exec(
		"UPDATE sync_records SET action = ?, data = ?, version = version + 1, checksum = ?, timestamp = ?, device_id = ? WHERE id = ?",
		action, data, checksum, ts, deviceID, id,
	)
	return err
}

func (s *SQLiteStore) GetSyncRecordsSince(userID string, since time.Time, excludeDeviceID string) ([]SyncRecord, error) {
	var rows *sql.Rows
	var err error

	if excludeDeviceID != "" {
		rows, err = s.db.Query(
			"SELECT id, user_id, store_name, record_id, action, data, version, checksum, timestamp, device_id FROM sync_records WHERE user_id = ? AND timestamp > ? AND (device_id IS NULL OR device_id != ?) ORDER BY timestamp ASC",
			userID, since, excludeDeviceID,
		)
	} else {
		rows, err = s.db.Query(
			"SELECT id, user_id, store_name, record_id, action, data, version, checksum, timestamp, device_id FROM sync_records WHERE user_id = ? AND timestamp > ? ORDER BY timestamp ASC",
			userID, since,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var records []SyncRecord
	for rows.Next() {
		var r SyncRecord
		err := rows.Scan(&r.ID, &r.UserID, &r.StoreName, &r.RecordID, &r.Action, &r.Data, &r.Version, &r.Checksum, &r.Timestamp, &r.DeviceID)
		if err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, nil
}

func (s *SQLiteStore) GetAllSyncRecordsByUser(userID string) (map[string][]SyncRecord, error) {
	rows, err := s.db.Query(
		"SELECT id, user_id, store_name, record_id, action, data, version, checksum, timestamp, device_id FROM sync_records WHERE user_id = ? ORDER BY timestamp ASC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	result := make(map[string][]SyncRecord)
	for rows.Next() {
		var r SyncRecord
		err := rows.Scan(&r.ID, &r.UserID, &r.StoreName, &r.RecordID, &r.Action, &r.Data, &r.Version, &r.Checksum, &r.Timestamp, &r.DeviceID)
		if err != nil {
			return nil, err
		}
		result[r.StoreName] = append(result[r.StoreName], r)
	}
	return result, nil
}

func (s *SQLiteStore) UpsertSyncRecord(userID, storeName, recordID, action, data, checksum, deviceID string, ts time.Time) (*SyncRecord, error) {
	existing, err := s.GetSyncRecord(userID, storeName, recordID)
	if err != nil {
		return nil, err
	}

	if existing == nil {
		return s.InsertSyncRecord(userID, storeName, recordID, action, data, checksum, deviceID)
	}

	if existing.Checksum == checksum {
		return existing, nil
	}

	err = s.UpdateSyncRecord(existing.ID, action, data, checksum, ts, deviceID)
	if err != nil {
		return nil, err
	}

	existing.Action = action
	existing.Data = data
	existing.Version++
	existing.Checksum = checksum
	existing.Timestamp = ts
	existing.DeviceID = deviceID
	return existing, nil
}

func (s *SQLiteStore) CountSyncRecordsByUser(userID string) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM sync_records WHERE user_id = ?", userID).Scan(&count)
	return count, err
}

func (s *SQLiteStore) CreateConflict(userID, storeName, recordID, localData, remoteData string, localVersion, remoteVersion int) (*Conflict, error) {
	id := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"INSERT INTO conflicts (id, user_id, store_name, record_id, local_data, remote_data, local_version, remote_version, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
		id, userID, storeName, recordID, localData, remoteData, localVersion, remoteVersion, now,
	)
	if err != nil {
		return nil, err
	}
	return &Conflict{
		ID:            id,
		UserID:        userID,
		StoreName:     storeName,
		RecordID:      recordID,
		LocalData:     localData,
		RemoteData:    remoteData,
		LocalVersion:  localVersion,
		RemoteVersion: remoteVersion,
		Status:        "pending",
		CreatedAt:     now,
	}, nil
}

func (s *SQLiteStore) GetConflictsByUser(userID, status string) ([]Conflict, error) {
	var rows *sql.Rows
	var err error

	if status != "" {
		rows, err = s.db.Query(
			"SELECT id, user_id, store_name, record_id, local_data, remote_data, local_version, remote_version, status, resolution, created_at, resolved_at FROM conflicts WHERE user_id = ? AND status = ? ORDER BY created_at DESC",
			userID, status,
		)
	} else {
		rows, err = s.db.Query(
			"SELECT id, user_id, store_name, record_id, local_data, remote_data, local_version, remote_version, status, resolution, created_at, resolved_at FROM conflicts WHERE user_id = ? ORDER BY created_at DESC",
			userID,
		)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var conflicts []Conflict
	for rows.Next() {
		var c Conflict
		err := rows.Scan(&c.ID, &c.UserID, &c.StoreName, &c.RecordID, &c.LocalData, &c.RemoteData, &c.LocalVersion, &c.RemoteVersion, &c.Status, &c.Resolution, &c.CreatedAt, &c.ResolvedAt)
		if err != nil {
			return nil, err
		}
		conflicts = append(conflicts, c)
	}
	return conflicts, nil
}

func (s *SQLiteStore) GetConflict(id string) (*Conflict, error) {
	c := &Conflict{}
	err := s.db.QueryRow(
		"SELECT id, user_id, store_name, record_id, local_data, remote_data, local_version, remote_version, status, resolution, created_at, resolved_at FROM conflicts WHERE id = ?",
		id,
	).Scan(&c.ID, &c.UserID, &c.StoreName, &c.RecordID, &c.LocalData, &c.RemoteData, &c.LocalVersion, &c.RemoteVersion, &c.Status, &c.Resolution, &c.CreatedAt, &c.ResolvedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return c, nil
}

func (s *SQLiteStore) ResolveConflict(id, resolution, data string) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"UPDATE conflicts SET status = 'resolved', resolution = ?, resolved_at = ? WHERE id = ?",
		resolution, now, id,
	)
	if err != nil {
		return err
	}

	if data != "" {
		c, err := s.GetConflict(id)
		if err != nil {
			log.Printf("Warning: could not fetch conflict after resolving: %v", err)
			return nil
		}
		if c != nil {
			existing, err := s.GetSyncRecord(c.UserID, c.StoreName, c.RecordID)
			if err != nil {
				log.Printf("Warning: could not fetch sync record for conflict resolution: %v", err)
				return nil
			}
			if existing != nil {
				return s.UpdateSyncRecord(existing.ID, "upsert", data, "", now, "")
			}
		}
	}

	return nil
}

func (s *SQLiteStore) CountPendingConflicts(userID string) (int, error) {
	var count int
	err := s.db.QueryRow("SELECT COUNT(*) FROM conflicts WHERE user_id = ? AND status = 'pending'", userID).Scan(&count)
	return count, err
}

// ── Sharing Store Methods ────────────────────────────────────────────

func (s *SQLiteStore) CreateSharedRecipe(userID, recipeID, title, description, category, tags, recipeData string, isPublic bool) (*SharedRecipe, error) {
	id := uuid.New().String()
	shareToken := uuid.New().String()
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"INSERT INTO shared_recipes (id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
		id, userID, recipeID, shareToken, isPublic, title, description, category, tags, recipeData, now, now,
	)
	if err != nil {
		return nil, err
	}
	return &SharedRecipe{
		ID: id, UserID: userID, RecipeID: recipeID, ShareToken: shareToken,
		IsPublic: isPublic, Title: title, Description: description,
		Category: category, Tags: tags, RecipeData: recipeData,
		CreatedAt: now, UpdatedAt: now,
	}, nil
}

func (s *SQLiteStore) GetSharedRecipeByToken(shareToken string) (*SharedRecipe, error) {
	r := &SharedRecipe{}
	err := s.db.QueryRow(
		"SELECT id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE share_token = ?",
		shareToken,
	).Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return r, nil
}

func (s *SQLiteStore) GetSharedRecipesByUser(userID string) ([]SharedRecipe, error) {
	rows, err := s.db.Query(
		"SELECT id, user_id, recipe_id, share_token, is_public, title, description, category, tags, recipe_data, view_count, import_count, average_rating, rating_count, created_at, updated_at FROM shared_recipes WHERE user_id = ? ORDER BY updated_at DESC",
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() {
		var r SharedRecipe
		if err := rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, nil
}

func (s *SQLiteStore) SetSharedRecipePublic(id string, isPublic bool) error {
	_, err := s.db.Exec("UPDATE shared_recipes SET is_public = ?, updated_at = ? WHERE id = ?", isPublic, time.Now().UTC(), id)
	return err
}

func (s *SQLiteStore) DeleteSharedRecipe(id string) error {
	_, err := s.db.Exec("UPDATE shared_recipes SET is_public = 0, updated_at = ? WHERE id = ?", time.Now().UTC(), id)
	return err
}

func (s *SQLiteStore) IncrementSharedRecipeViews(id string) error {
	_, err := s.db.Exec("UPDATE shared_recipes SET view_count = view_count + 1 WHERE id = ?", id)
	return err
}

func (s *SQLiteStore) IncrementSharedRecipeImports(id string) error {
	_, err := s.db.Exec("UPDATE shared_recipes SET import_count = import_count + 1 WHERE id = ?", id)
	return err
}

func (s *SQLiteStore) UpsertRecipeRating(recipeID, userID string, rating int) error {
	now := time.Now().UTC()
	_, err := s.db.Exec(
		"INSERT INTO recipe_ratings (id, recipe_id, user_id, rating, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(recipe_id, user_id) DO UPDATE SET rating = ?, updated_at = ?",
		uuid.New().String(), recipeID, userID, rating, now, now, rating, now,
	)
	if err != nil {
		return err
	}
	return s.recalcAverageRating(recipeID)
}

func (s *SQLiteStore) recalcAverageRating(recipeID string) error {
	var avg float64
	var count int
	err := s.db.QueryRow("SELECT COALESCE(AVG(rating), 0), COUNT(*) FROM recipe_ratings WHERE recipe_id = ?", recipeID).Scan(&avg, &count)
	if err != nil {
		return err
	}
	_, err = s.db.Exec("UPDATE shared_recipes SET average_rating = ?, rating_count = ? WHERE id = ?", avg, count, recipeID)
	return err
}

func (s *SQLiteStore) SearchCommunityRecipes(query, category, sort string, page, perPage int) ([]SharedRecipe, error) {
	if perPage <= 0 {
		perPage = 20
	}
	if page <= 0 {
		page = 1
	}
	offset := (page - 1) * perPage

	orderClause := "ORDER BY s.created_at DESC"
	switch sort {
	case "rating":
		orderClause = "ORDER BY s.average_rating DESC"
	case "most_imported":
		orderClause = "ORDER BY s.import_count DESC"
	}

	whereClause := "WHERE s.is_public = 1"
	args := []interface{}{}
	if query != "" {
		whereClause += " AND s.title LIKE ?"
		args = append(args, "%"+query+"%")
	}
	if category != "" {
		whereClause += " AND s.category = ?"
		args = append(args, category)
	}
	args = append(args, offset, perPage)

	rows, err := s.db.Query(
		"SELECT s.id, s.user_id, s.recipe_id, s.share_token, s.is_public, s.title, s.description, s.category, s.tags, '' as recipe_data, s.view_count, s.import_count, s.average_rating, s.rating_count, s.created_at, s.updated_at FROM shared_recipes s "+whereClause+" "+orderClause+" LIMIT ? OFFSET ?",
		args...,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var recipes []SharedRecipe
	for rows.Next() {
		var r SharedRecipe
		if err := rows.Scan(&r.ID, &r.UserID, &r.RecipeID, &r.ShareToken, &r.IsPublic, &r.Title, &r.Description, &r.Category, &r.Tags, &r.RecipeData, &r.ViewCount, &r.ImportCount, &r.AverageRating, &r.RatingCount, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		recipes = append(recipes, r)
	}
	return recipes, nil
}

func (s *SQLiteStore) GetCommunityCategories() ([]CommunityCategory, error) {
	rows, err := s.db.Query("SELECT id, name, slug FROM community_categories ORDER BY name")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var cats []CommunityCategory
	for rows.Next() {
		var c CommunityCategory
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, nil
}

func (s *SQLiteStore) SeedCategories() error {
	cats := []CommunityCategory{
		{ID: uuid.New().String(), Name: "Breakfast", Slug: "breakfast"},
		{ID: uuid.New().String(), Name: "Lunch", Slug: "lunch"},
		{ID: uuid.New().String(), Name: "Dinner", Slug: "dinner"},
		{ID: uuid.New().String(), Name: "Desserts", Slug: "desserts"},
		{ID: uuid.New().String(), Name: "Snacks", Slug: "snacks"},
		{ID: uuid.New().String(), Name: "Beverages", Slug: "beverages"},
		{ID: uuid.New().String(), Name: "Appetizers", Slug: "appetizers"},
		{ID: uuid.New().String(), Name: "Soups", Slug: "soups"},
		{ID: uuid.New().String(), Name: "Salads", Slug: "salads"},
		{ID: uuid.New().String(), Name: "Sides", Slug: "sides"},
	}
	for _, c := range cats {
		s.db.Exec("INSERT OR IGNORE INTO community_categories (id, name, slug) VALUES (?, ?, ?)", c.ID, c.Name, c.Slug)
	}
	return nil
}
