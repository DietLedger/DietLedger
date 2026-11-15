package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/stdlib"
)

// Pause a real PostgreSQL read after its rows have been consumed. Channels, not
// sleeps, place the concurrent commit between two backup reads.
type ownerBackupReadBarrier struct {
	match   string
	reached chan struct{}
	resume  chan struct{}
	once    sync.Once
}

type ownerBackupReadQueryKey struct{}

func (b *ownerBackupReadBarrier) TraceQueryStart(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	return context.WithValue(ctx, ownerBackupReadQueryKey{}, data.SQL)
}

func (b *ownerBackupReadBarrier) TraceQueryEnd(ctx context.Context, _ *pgx.Conn, data pgx.TraceQueryEndData) {
	query, _ := ctx.Value(ownerBackupReadQueryKey{}).(string)
	if data.Err == nil && strings.Contains(query, b.match) {
		b.once.Do(func() {
			close(b.reached)
			<-b.resume
		})
	}
}

func ownerBackupTracedStore(t *testing.T, tracer pgx.QueryTracer) *PostgresStore {
	t.Helper()
	config, err := pgx.ParseConfig(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	config.Tracer = tracer
	db := sql.OpenDB(stdlib.GetConnector(*config))
	t.Cleanup(func() { db.Close() })
	return &PostgresStore{db: db}
}

func TestOwnerRecipeBookBackupConsistentSnapshot(t *testing.T) {
	for _, pause := range []struct {
		name, query string
		revoke      bool
	}{
		{"after owner recipe enumeration", "SELECT id FROM recipes WHERE user_id=$1 ORDER BY created_at, id", false},
		{"between recipe metadata and ingredients", "FROM recipes WHERE user_id = $1 AND id = $2", false},
		{"dependency access changes", "SELECT id FROM recipes WHERE user_id=$1 ORDER BY created_at, id", true},
	} {
		t.Run(pause.name, func(t *testing.T) {
			f := newExportBookFixture(t)
			other := createUser(t, f.s, "snapshot-public-dependency")
			food, err := f.s.CreateCustomFood(other.ID, &CreateCustomFoodRequest{Name: "Shared sauce", Calories: 120})
			if err != nil {
				t.Fatal(err)
			}
			if err := f.s.ShareCustomFood(other.ID, food.ID); err != nil {
				t.Fatal(err)
			}
			if _, err := f.s.db.Exec(`INSERT INTO food_items (fdc_id, description, data_type, calories) VALUES (987654, 'USDA staple', 'Foundation', 50)`); err != nil {
				t.Fatal(err)
			}
			leaf := exportTestRecipe(t, f.s, other.ID, "Public leaf",
				CreateIngredientReq{Name: "Sauce", Amount: 100, Unit: "g", SourceType: "custom_food", SourceKey: &food.ID, Calories: 120},
				CreateIngredientReq{Name: "Staple", Amount: 50, Unit: "g", SourceType: "usda", FdcID: 987654, Calories: 25})
			if _, err := f.s.CreateSharedRecipe(other.ID, leaf.ID, "Public leaf", "", "", "[]", "{}", "public"); err != nil {
				t.Fatal(err)
			}
			if _, err := f.s.CreateIngredient(f.recipe.ID, &CreateIngredientReq{Name: "Leaf", Amount: 1, Unit: "recipe", SourceType: "recipe", LinkedRecipeID: &leaf.ID, SourceKey: &leaf.ID, Calories: 145}); err != nil {
				t.Fatal(err)
			}
			before, err := f.s.ExportOwnerRecipeBookBackup(f.user.ID)
			if err != nil {
				t.Fatal(err)
			}

			barrier := &ownerBackupReadBarrier{match: pause.query, reached: make(chan struct{}), resume: make(chan struct{})}
			snapshotStore := ownerBackupTracedStore(t, barrier)
			var release sync.Once
			resume := func() { release.Do(func() { close(barrier.resume) }) }
			defer resume()
			type result struct {
				bundle *RecipeBundle
				err    error
			}
			done := make(chan result, 1)
			go func() {
				bundle, err := snapshotStore.ExportOwnerRecipeBookBackup(f.user.ID)
				done <- result{bundle, err}
			}()
			select {
			case <-barrier.reached:
			case res := <-done:
				t.Fatalf("backup finished before concurrent-edit barrier: %v", res.err)
			case <-time.After(10 * time.Second):
				t.Fatal("backup did not reach concurrent-edit barrier")
			}

			// Commit metadata, ingredients, authorization, dependencies and book
			// structure together. No successful bundle can mix the two versions.
			tx, err := f.s.db.Begin()
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback()
			for _, query := range []string{
				`UPDATE recipes SET name=name || ' after'`,
				`UPDATE ingredients SET name=name || ' after', calories=calories+1`,
				`UPDATE custom_foods SET name=name || ' after'`,
				`UPDATE food_items SET description=description || ' after', calories=calories+1`,
				`UPDATE categories SET name=name || ' after'`,
				`DELETE FROM recipe_categories`,
				`UPDATE recipe_books SET title=title || ' after'`,
				`UPDATE chapters SET title=title || ' after', position=position+1`,
				`UPDATE templates SET name=name || ' after', layout_json='{"blocks":[],"after":true}'`,
				`UPDATE book_pages SET content=content || ' after', position=position+1`,
				`UPDATE chapter_pages SET content=content || ' after', position=position+1`,
				`UPDATE chapter_recipes SET position=position+1`,
			} {
				if _, err := tx.Exec(query); err != nil {
					t.Fatal(err)
				}
			}
			if _, err := tx.Exec(`INSERT INTO recipe_books (id, user_id, title) VALUES ($1,$2,'Later book')`, uuid.New().String(), f.user.ID); err != nil {
				t.Fatal(err)
			}
			if _, err := tx.Exec(`INSERT INTO recipes (id, user_id, name, servings, serving_name) VALUES ($1,$2,'Later recipe',1,'serving')`, uuid.New().String(), f.user.ID); err != nil {
				t.Fatal(err)
			}
			if pause.revoke {
				if _, err := tx.Exec(`UPDATE custom_foods SET shared_with_community=FALSE; UPDATE shared_recipes SET visibility='private'`); err != nil {
					t.Fatal(err)
				}
			}
			if err := tx.Commit(); err != nil {
				t.Fatal(err)
			}
			resume()
			var res result
			select {
			case res = <-done:
			case <-time.After(10 * time.Second):
				t.Fatal("backup did not finish after concurrent edit committed")
			}
			if res.err != nil {
				t.Fatalf("concurrent edit broke the earlier backup snapshot: %v", res.err)
			}
			before.ExportedAt, res.bundle.ExportedAt = "", ""
			if !reflect.DeepEqual(before, res.bundle) {
				beforeJSON, _ := json.Marshal(before)
				afterJSON, _ := json.Marshal(res.bundle)
				t.Fatalf("backup mixed versions across a concurrent commit:\nwant %s\ngot  %s", beforeJSON, afterJSON)
			}
			// The next backup must see the commit, not retain the earlier
			// transaction or snapshot on the shared store after completion.
			next, err := snapshotStore.ExportOwnerRecipeBookBackup(f.user.ID)
			if pause.revoke {
				if !errors.Is(err, ErrExportForbidden) || next != nil {
					t.Fatalf("next backup did not see committed dependency access change: bundle=%+v err=%v", next, err)
				}
			} else if err != nil || len(next.Recipes) != len(before.Recipes)+1 || len(next.Books) != len(before.Books)+1 || exportTestRecipeBySource(t, next, f.recipe.ID).Name != f.recipe.Name+" after" {
				t.Fatalf("next backup did not see newly committed content: bundle=%+v err=%v", next, err)
			}
		})
	}
}

// Disconnect exactly when a completed bundle would be committed. Even though
// every serialization read succeeded, the caller must not receive that bundle.
type ownerBackupCommitFailureTracer struct{}

func (ownerBackupCommitFailureTracer) TraceQueryStart(ctx context.Context, conn *pgx.Conn, data pgx.TraceQueryStartData) context.Context {
	if data.SQL == "commit" {
		_ = conn.PgConn().Close(ctx)
	}
	return ctx
}

func (ownerBackupCommitFailureTracer) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {
}

func TestOwnerRecipeBookBackupSnapshotErrorsReleaseConnection(t *testing.T) {
	for _, failure := range []string{"enumeration", "serialization", "validation", "commit"} {
		t.Run(failure, func(t *testing.T) {
			s := testStore(t).(*PostgresStore)
			u := createUser(t, s, "snapshot-error")
			r := exportTestRecipe(t, s, u.ID, "Recipe", CreateIngredientReq{Name: "Ingredient", Amount: 1, Unit: "g"})
			switch failure {
			case "enumeration":
				if _, err := s.db.Exec(`ALTER TABLE recipe_books RENAME TO unavailable_snapshot_books`); err != nil {
					t.Fatal(err)
				}
			case "serialization":
				if _, err := s.db.Exec(`UPDATE ingredients SET unresolved_source_ref='{"type":123}' WHERE recipe_id=$1`, r.ID); err != nil {
					t.Fatal(err)
				}
			case "validation":
				if _, err := s.db.Exec(`UPDATE ingredients SET name='' WHERE recipe_id=$1`, r.ID); err != nil {
					t.Fatal(err)
				}
			case "commit":
				s = ownerBackupTracedStore(t, ownerBackupCommitFailureTracer{})
			}
			db := s.DB()
			if bundle, err := s.ExportOwnerRecipeBookBackup(u.ID); err == nil || bundle != nil {
				t.Fatalf("%s failure returned a backup: bundle=%+v err=%v", failure, bundle, err)
			}
			if s.DB() != db {
				t.Fatal("backup changed the shared store's database lifecycle")
			}
			if inUse := db.Stats().InUse; inUse != 0 {
				t.Fatalf("%s failure leaked %d active connections", failure, inUse)
			}
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			if err := db.PingContext(ctx); err != nil {
				t.Fatalf("pool unavailable after %s failure: %v", failure, err)
			}
		})
	}
}

func TestOwnerRecipeBookBackupSnapshotBeginFailure(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	u := createUser(t, s, "snapshot-begin-error")
	if err := s.db.Close(); err != nil {
		t.Fatal(err)
	}
	if bundle, err := s.ExportOwnerRecipeBookBackup(u.ID); err == nil || bundle != nil {
		t.Fatalf("begin failure returned a backup: bundle=%+v err=%v", bundle, err)
	}
}
