package main

import (
	"strings"
	"testing"
	"time"
)

// The importer owns the account lock before it touches any custom table.
// Resets must take the same lock first, not deadlock while holding later tables.
func TestResetDataSerializesInflightImport(t *testing.T) {
	for _, global := range []bool{true, false} {
		t.Run(map[bool]string{true: "global", false: "personal"}[global], func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			u := createUser(t, s, "serialize")
			blocker, err := s.db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback()
			if _, err := blocker.Exec(`SELECT pg_advisory_xact_lock(781236)`); err != nil {
				t.Fatal(err)
			}
			resetExec(t, s, `CREATE FUNCTION pause_reset_import() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(781236); RETURN NEW; END $$; CREATE TRIGGER pause_reset_import BEFORE INSERT ON recipe_import_batches FOR EACH ROW EXECUTE FUNCTION pause_reset_import()`)
			imported := make(chan error, 1)
			go func() { _, err := s.StageRecipeBundle(u.ID, quarantineBundle("inflight", true)); imported <- err }()
			wait := func(query string, args ...interface{}) bool {
				deadline := time.Now().Add(3 * time.Second)
				for time.Now().Before(deadline) {
					var ready bool
					if err := s.db.QueryRow(query, args...).Scan(&ready); err != nil {
						t.Error(err)
						return false
					}
					if ready {
						return true
					}
					time.Sleep(10 * time.Millisecond)
				}
				return false
			}
			if !wait(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted)`) {
				blocker.Rollback()
				t.Fatal("import did not reach barrier")
			}
			reset := make(chan error, 1)
			go func() {
				if global {
					reset <- s.ResetUserData()
				} else {
					reset <- s.DeleteUserData(u.ID)
				}
			}()
			pattern := "%SELECT id FROM users WHERE id=$1 FOR UPDATE%"
			if global {
				pattern = "%LOCK TABLE users IN EXCLUSIVE MODE%"
			}
			coordinated := wait(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1)`, pattern)
			blocker.Rollback()
			for name, ch := range map[string]<-chan error{"import": imported, "reset": reset} {
				select {
				case err := <-ch:
					if err != nil {
						t.Errorf("%s: %v", name, err)
					}
				case <-time.After(10 * time.Second):
					t.Fatalf("%s timed out", name)
				}
			}
			if !coordinated {
				t.Error("reset did not wait on account lock before custom-table locks")
			}
			for _, table := range strings.Fields("recipes recipe_import_batches recipe_import_staged import_object_mappings") {
				if n := resetCount(t, s, table); n != 0 {
					t.Errorf("%s retains %d inflight import rows", table, n)
				}
			}
		})
	}
}
