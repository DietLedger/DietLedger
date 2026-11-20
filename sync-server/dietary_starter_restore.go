package main

import (
	"database/sql"
	"net/http"
	"time"
)

// RestoreDiabetesAwareProfile is an explicit user action, never a read-time seed.
// The owner lock serializes concurrent restores/retries and follows reset's
// user-first lock order. Existing eligible profiles, including edits, are reused.
func (s *PostgresStore) RestoreDiabetesAwareProfile(userID string) (*DietaryProfile, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	var owner string
	if err := tx.QueryRow(`SELECT id FROM users WHERE id = $1 FOR UPDATE`, userID).Scan(&owner); err != nil {
		return nil, err
	}
	readEligible := func() (*DietaryProfile, error) {
		var p DietaryProfile
		err := tx.QueryRow(`SELECT id, user_id, name, allergens_json, dietary_tags_json,
			nutrient_thresholds_json, is_active, created_at, updated_at
			FROM dietary_profiles WHERE user_id = $1 AND dietary_tags_json @> '["diabetesAware"]'::jsonb
			ORDER BY is_active DESC, name, id LIMIT 1`, userID).Scan(
			&p.ID, &p.UserID, &p.Name, &p.AllergensJSON, &p.DietaryTagsJSON,
			&p.NutrientThresholdsJSON, &p.IsActive, &p.CreatedAt, &p.UpdatedAt)
		return &p, err
	}
	profile, err := readEligible()
	if err == sql.ErrNoRows {
		// Reuse account-provisioning defaults exactly; no browser criteria.
		if err := insertDefaultDiabetesAwareProfile(tx, userID, time.Now().UTC()); err != nil {
			return nil, err
		}
		profile, err = readEligible()
	}
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return profile, nil
}

func (s *Server) restoreDiabetesAwareProfileHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	profile, err := s.store.RestoreDiabetesAwareProfile(getUserFromContext(r).ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to restore dietary starter profile")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: profile})
}
