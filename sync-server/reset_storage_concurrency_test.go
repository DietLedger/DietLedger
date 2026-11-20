package main

import (
	"testing"
	"time"
)

func TestResetDataSerializesStorageDefaultWrites(t *testing.T) {
	for _, writer := range []string{"first-save", "explicit-custom-default"} {
		for _, global := range []bool{true, false} {
			scope := "personal"
			if global {
				scope = "global"
			}
			t.Run(writer+"/"+scope, func(t *testing.T) {
				env := newTestEnv(t)
				s := env.store.(*PostgresStore)
				var write func() error
				if writer == "first-save" {
					seedStorageFood(t, env, 765432)
					recipe := storageRecipe(t, env, env.token)
					ing := storageIngredient(t, env, env.token, recipe, map[string]interface{}{"sourceType": "usda", "sourceKey": "765432", "fdcId": 765432})
					write = func() error {
						_, err := s.UpdateIngredient(env.userID, recipe, ing, &CreateIngredientReq{Name: "Food", FdcID: 765432, SourceType: "usda", SourceKey: strPtr("765432"), Amount: 100, Unit: "g", StorageLocation: "Pantry"})
						return err
					}
				} else {
					resetExec(t, s, `INSERT INTO custom_foods(id,user_id,name) VALUES ('custom',$1,'Custom')`, env.userID)
					write = func() error {
						_, err := s.UpsertFoodStorageDefault(env.userID, "custom_food", "custom", "Pantry")
						return err
					}
				}
				blocker, err := s.db.Begin()
				if err != nil {
					t.Fatal(err)
				}
				defer blocker.Rollback()
				if _, err := blocker.Exec(`SELECT pg_advisory_xact_lock(781237)`); err != nil {
					t.Fatal(err)
				}
				resetExec(t, s, `CREATE FUNCTION pause_default_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_advisory_xact_lock(781237); RETURN NEW; END $$; CREATE TRIGGER pause_default_write BEFORE INSERT ON food_storage_defaults FOR EACH ROW EXECUTE FUNCTION pause_default_write()`)
				wait := func(q string, args ...interface{}) bool {
					deadline := time.Now().Add(3 * time.Second)
					for time.Now().Before(deadline) {
						var ok bool
						if err := s.db.QueryRow(q, args...).Scan(&ok); err != nil {
							t.Error(err)
							return false
						}
						if ok {
							return true
						}
						time.Sleep(10 * time.Millisecond)
					}
					return false
				}
				written := make(chan error, 1)
				go func() { written <- write() }()
				if !wait(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted)`) {
					blocker.Rollback()
					t.Fatal("write never reached storage-default barrier")
				}
				reset := make(chan error, 1)
				go func() {
					if global {
						reset <- s.ResetUserData()
					} else {
						reset <- s.DeleteUserData(env.userID)
					}
				}()
				pattern := "%SELECT id FROM users WHERE id=$1 FOR UPDATE%"
				if global {
					pattern = "%LOCK TABLE users IN EXCLUSIVE MODE%"
				}
				coordinated := wait(`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND state='active' AND wait_event_type='Lock' AND query LIKE $1)`, pattern)
				blocker.Rollback()
				for name, ch := range map[string]<-chan error{"write": written, "reset": reset} {
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
				if n := resetCount(t, s, "food_storage_defaults"); n != 0 {
					t.Errorf("%d defaults survived reset", n)
				}
			})
		}
	}
}
