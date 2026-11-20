package main

import (
	"context"
	"database/sql"
	"net"
	"net/url"
	"os"
	"strings"
	"testing"
)

func securitySeedTestStore(t *testing.T) *PostgresStore {
	t.Helper()
	connection := os.Getenv("TEST_DATABASE_URL")
	if connection == "" {
		t.Skip("exclusive disposable TEST_DATABASE_URL required")
	}
	parsed, err := url.Parse(connection)
	if err != nil || net.ParseIP(parsed.Hostname()) == nil || !net.ParseIP(parsed.Hostname()).IsLoopback() || !strings.HasPrefix(strings.TrimPrefix(parsed.Path, "/"), "sec_") {
		t.Fatal("security tests require a loopback disposable sec_ database")
	}
	// Verify server/database identity before testStore's destructive reset.
	db, err := sql.Open("pgx", connection)
	if err != nil {
		t.Fatal("open disposable database")
	}
	defer db.Close()
	var database string
	if err := db.QueryRow("SELECT current_database()").Scan(&database); err != nil || database != strings.TrimPrefix(parsed.Path, "/") {
		t.Fatal("disposable database identity mismatch")
	}
	return testStore(t).(*PostgresStore)
}

func TestSeedWriteCanceledBeforePersistence(t *testing.T) {
	store := securitySeedTestStore(t)
	job, err := store.CreateSeedJob("foundation", "", "synthetic")
	if err != nil {
		t.Fatal("create seed job fixture")
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := store.CreateSeedJobContext(ctx, "foundation", "", "canceled"); err == nil {
		t.Fatal("canceled seed metadata create succeeded")
	}
	if err := store.UpdateSeedJobContext(ctx, job.ID, "completed", 3, 100, ""); err == nil {
		t.Fatal("canceled seed metadata update succeeded")
	}
	if _, err := store.ListSeedJobsContext(ctx); err == nil {
		t.Fatal("canceled seed metadata read succeeded")
	}
	jobs, err := store.ListSeedJobs()
	if err != nil || len(jobs) != 1 || jobs[0].Status != "pending" {
		t.Fatalf("canceled job metadata changed: jobs=%v err=%v", jobs, err)
	}
	if _, err := store.CreateFoodItemsContext(ctx, []FoodItem{{FdcID: 987654321, Description: "Synthetic canceled seed", Calories: 2}}); err == nil {
		t.Fatal("canceled write succeeded")
	}
	food, err := store.GetFoodByFdcID(987654321)
	if err != nil || food != nil {
		t.Fatalf("canceled write persisted: food=%v err=%v", food, err)
	}
}
