package main

import (
	"encoding/json"
	"testing"
	"time"
)

func TestUpsertSettingsConcurrentPartialUpdates(t *testing.T) {
	for _, existing := range []bool{false, true} {
		name := "first insert"
		if existing {
			name = "existing row"
		}
		t.Run(name, func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			u := createUser(t, s, "settings-race")
			want := map[string]interface{}{}
			if existing {
				if _, err := s.UpsertSettings(u.ID, `{"retained":"keep","defaultMealSlotTimes":{"morning":"07:00"}}`); err != nil {
					t.Fatal(err)
				}
				want["retained"] = "keep"
				want["defaultMealSlotTimes"] = map[string]interface{}{"morning": "07:00"}
			}

			// SHARE permits the old implementation's reads but blocks every
			// INSERT/UPSERT. Release only after all writers reach PostgreSQL:
			// their old read/merge snapshots then deterministically conflict.
			s.db.SetMaxOpenConns(8)
			lock, err := s.db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			defer lock.Rollback()
			if _, err := lock.Exec(`LOCK TABLE user_settings IN SHARE MODE`); err != nil {
				t.Fatal(err)
			}
			patches := []string{
				`{"theme":"olive-botanical"}`,
				`{"appearanceMode":"dark"}`,
				`{"unitSystem":"metric"}`,
				`{"onboardingComplete":true}`,
			}
			done := make(chan error, len(patches))
			for _, patch := range patches {
				var fields map[string]interface{}
				if err := json.Unmarshal([]byte(patch), &fields); err != nil {
					t.Fatal(err)
				}
				for key, value := range fields {
					want[key] = value
				}
				go func(patch string) {
					_, err := s.UpsertSettings(u.ID, patch)
					done <- err
				}(patch)
			}
			deadline := time.Now().Add(10 * time.Second)
			for {
				var blocked int
				err := s.db.QueryRow(`SELECT count(*) FROM pg_stat_activity
					WHERE datname = current_database() AND pid <> pg_backend_pid()
					AND wait_event_type = 'Lock' AND query LIKE '%INSERT INTO user_settings%'`).Scan(&blocked)
				if err != nil {
					t.Fatal(err)
				}
				if blocked == len(patches) {
					break
				}
				if time.Now().After(deadline) {
					t.Fatalf("only %d/%d settings writers reached lock barrier", blocked, len(patches))
				}
				time.Sleep(5 * time.Millisecond)
			}
			if err := lock.Commit(); err != nil {
				t.Fatal(err)
			}
			for range patches {
				select {
				case err := <-done:
					if err != nil {
						t.Fatal(err)
					}
				case <-time.After(10 * time.Second):
					t.Fatal("settings writer did not finish")
				}
			}
			got, err := s.GetSettings(u.ID)
			if err != nil || got == nil {
				t.Fatalf("get merged settings: %v, %v", got, err)
			}
			wantJSON, _ := json.Marshal(want)
			assertJSONEqual(t, string(wantJSON), got.SettingsJSON)
		})
	}
}

func TestUpsertSettingsPartialMergeContract(t *testing.T) {
	s := testStore(t)
	u := createUser(t, s, "settings-contract")
	other := createUser(t, s, "settings-other")
	first, err := s.UpsertSettings(u.ID, `{"theme":"slate-ink","unitSystem":"metric","nested":{"old":true}}`)
	if err != nil {
		t.Fatal(err)
	}
	updated, err := s.UpsertSettings(u.ID, `{"theme":"olive-botanical","nested":{"new":true},"nullable":null}`)
	if err != nil {
		t.Fatal(err)
	}
	if updated.ID != first.ID || updated.UserID != u.ID || updated.UpdatedAt.Before(first.UpdatedAt) {
		t.Fatalf("upsert changed row identity or regressed timestamp: %+v", updated)
	}
	want := `{"theme":"olive-botanical","unitSystem":"metric","nested":{"new":true},"nullable":null}`
	assertJSONEqual(t, want, updated.SettingsJSON)
	for _, noop := range []string{"", "{}", "null"} {
		got, err := s.UpsertSettings(u.ID, noop)
		if err != nil {
			t.Fatalf("no-op %q: %v", noop, err)
		}
		assertJSONEqual(t, want, got.SettingsJSON)
	}
	for _, invalid := range []string{`{`, `[]`, `"dark"`, `true`, `42`} {
		if _, err := s.UpsertSettings(u.ID, invalid); err == nil {
			t.Fatalf("accepted invalid settings object %q", invalid)
		}
	}
	got, err := s.GetSettings(u.ID)
	if err != nil {
		t.Fatal(err)
	}
	assertJSONEqual(t, want, got.SettingsJSON)
	if got, err := s.GetSettings(other.ID); err != nil || got != nil {
		t.Fatalf("other user's settings changed: %v, %v", got, err)
	}
}
