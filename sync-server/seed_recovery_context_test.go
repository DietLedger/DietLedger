package main

import (
	"context"
	"errors"
	"net/http"
	"testing"
	"time"
)

func TestSeedFreshCleanupPersistsAfterWorkCancellation(t *testing.T) {
	store := securitySeedTestStore(t)
	job, err := store.CreateSeedJob("foundation", "", "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) { cancel(); return nil, r.Context().Err() })}
	if !(&Server{store: store}).runSeedJobWorker(ctx, client, job.ID, "foundation") {
		t.Fatal("worker refused")
	}
	jobs, err := store.ListSeedJobs()
	if err != nil || len(jobs) != 1 || jobs[0].Status != "failed" || jobs[0].CompletedAt == nil {
		t.Fatalf("canceled work did not persist terminal state: %+v err=%v", jobs, err)
	}
	if !acquireSeedWorker() {
		t.Fatal("canceled database job retained worker")
	}
	releaseSeedWorker()
}

func TestSeedFreshCleanupPersistsAfterWorkDeadline(t *testing.T) {
	store := securitySeedTestStore(t)
	job, err := store.CreateSeedJob("foundation", "", "synthetic")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) { <-r.Context().Done(); return nil, r.Context().Err() })}
	if !(&Server{store: store}).runSeedJobWorker(ctx, client, job.ID, "foundation") {
		t.Fatal("worker refused")
	}
	if !errors.Is(ctx.Err(), context.DeadlineExceeded) {
		t.Fatal("fixture did not expire work deadline")
	}
	jobs, err := store.ListSeedJobs()
	if err != nil || len(jobs) != 1 || jobs[0].Status != "failed" || jobs[0].CompletedAt == nil {
		t.Fatalf("deadline did not persist failed state: %+v err=%v", jobs, err)
	}
	if !acquireSeedWorker() {
		t.Fatal("expired database job retained worker")
	}
	releaseSeedWorker()
}

func TestSeedScopedRecoveryRetriesAfterDatabaseFailure(t *testing.T) {
	store := securitySeedTestStore(t)
	server := &Server{store: store}
	ctx := context.Background()
	now := time.Now()
	newJob := func(deadline time.Time) (int, string) {
		t.Helper()
		job, err := store.CreateSeedJob("foundation", "", "synthetic")
		if err != nil {
			t.Fatal(err)
		}
		checkpoint := newSeedCheckpoint(deadline)
		ok, err := store.ClaimSeedJobContext(ctx, job.ID, checkpoint)
		if err != nil || !ok {
			t.Fatalf("claim: %v %v", ok, err)
		}
		return job.ID, checkpoint
	}
	expiredID, expiredMarker := newJob(now.Add(-time.Minute))
	if err := store.UpdateSeedJobContext(ctx, expiredID, "importing", 17, 50, ""); err != nil {
		t.Fatal(err)
	}
	futureID, _ := newJob(now.Add(time.Hour))
	completedID, completedMarker := newJob(now.Add(-time.Minute))
	if err := store.FinishSeedJobContext(ctx, completedID, completedMarker, "completed", 3, ""); err != nil {
		t.Fatal(err)
	}
	legacy, err := store.CreateSeedJob("foundation", "", "legacy")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.UpdateSeedJobContext(ctx, legacy.ID, "running", 4, 0, ""); err != nil {
		t.Fatal(err)
	}
	changedID, staleMarker := newJob(now.Add(-time.Minute))
	changedMarker := newSeedCheckpoint(now.Add(time.Hour))
	if _, err := store.db.ExecContext(ctx, `UPDATE seed_jobs SET checkpoint=$2 WHERE id=$1`, changedID, changedMarker); err != nil {
		t.Fatal(err)
	}
	if err := store.FinishSeedJobContext(ctx, changedID, staleMarker, "failed", 0, ""); !errors.Is(err, errSeedAttemptInactive) {
		t.Fatalf("stale cleanup was not rejected: %v", err)
	}

	// A row lock models transient metadata unavailability without stopping a
	// database/service. The bounded poll must fail, then succeed after recovery.
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `SELECT id FROM seed_jobs WHERE id=$1 FOR UPDATE`, expiredID); err != nil {
		t.Fatal(err)
	}
	blocked, cancel := context.WithTimeout(ctx, 25*time.Millisecond)
	err = server.reconcileSeedJobs(blocked, now)
	cancel()
	if err == nil {
		t.Fatal("locked metadata poll unexpectedly succeeded")
	}
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	// A fresh Server has no in-memory record of the interrupted attempt.
	if err := (&Server{store: store}).reconcileSeedJobs(ctx, now); err != nil {
		t.Fatal(err)
	}
	jobs, err := store.ListSeedJobs()
	if err != nil {
		t.Fatal(err)
	}
	byID := map[int]SeedJob{}
	for _, job := range jobs {
		byID[job.ID] = job
	}
	if byID[expiredID].Status != "failed" || byID[expiredID].RecordCount != 17 || byID[expiredID].CompletedAt == nil || *byID[expiredID].Checkpoint != expiredMarker {
		t.Fatalf("expired attempt was not reconciled: %+v", byID[expiredID])
	}
	for id, want := range map[int]string{futureID: "running", completedID: "completed", legacy.ID: "running", changedID: "running"} {
		if byID[id].Status != want {
			t.Fatalf("unrelated job %d changed: %s want %s", id, byID[id].Status, want)
		}
	}
	if *byID[changedID].Checkpoint != changedMarker {
		t.Fatal("recovery overwrote another attempt marker")
	}
	if claimed, err := store.ClaimSeedJobContext(ctx, expiredID, newSeedCheckpoint(now.Add(time.Hour))); err != nil || claimed {
		t.Fatalf("failed attempt silently restarted: %v %v", claimed, err)
	}
}
