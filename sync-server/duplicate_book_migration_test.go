package main

import "testing"

func TestDuplicateBookMigrationDownAndReapply(t *testing.T) {
	s := testStore(t).(*PostgresStore)
	down, err := migrationFS.ReadFile("migrations/000035_import_book_decisions.down.sql")
	if err != nil {
		t.Fatal(err)
	}
	up, err := migrationFS.ReadFile("migrations/000035_import_book_decisions.up.sql")
	if err != nil {
		t.Fatal(err)
	}
	check := func(want int) {
		t.Helper()
		var triggers, functions, columns int
		if err := s.db.QueryRow(`SELECT count(*) FROM pg_trigger WHERE tgname='book_import_owner_lock' AND NOT tgisinternal`).Scan(&triggers); err != nil {
			t.Fatal(err)
		}
		if err := s.db.QueryRow(`SELECT count(*) FROM pg_proc WHERE oid=to_regprocedure('lock_book_structure_owner()')`).Scan(&functions); err != nil {
			t.Fatal(err)
		}
		if err := s.db.QueryRow(`SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND table_name='recipe_import_batches' AND column_name='book_state'`).Scan(&columns); err != nil {
			t.Fatal(err)
		}
		if triggers != 5*want || functions != want || columns != want {
			t.Fatalf("migration objects: triggers=%d function=%d column=%d", triggers, functions, columns)
		}
	}
	check(1)
	if _, err := s.db.Exec(string(down)); err != nil {
		t.Fatalf("down: %v", err)
	}
	check(0)
	if _, err := s.db.Exec(string(up)); err != nil {
		t.Fatalf("reapply up: %v", err)
	}
	check(1)
}
