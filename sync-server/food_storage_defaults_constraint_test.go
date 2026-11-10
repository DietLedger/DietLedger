package main

import "testing"

func TestCustomStorageDefaultRequiresFoodReference(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	user := createUser(t, s, "storage_constraint")
	_, err := s.db.Exec(`INSERT INTO food_storage_defaults (user_id, source_type, source_key, location)
		VALUES ($1, 'custom_food', 'unmatched', 'Pantry')`, user.ID)
	if err == nil {
		t.Fatal("custom-food default without a food reference was accepted")
	}
}
