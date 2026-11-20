package main

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

type recoverySeedStore struct {
	Store
	mu             sync.Mutex
	cleanupLive    bool
	cleanupBounded bool
	status         string
	cleanupFails   bool
	cleanupBlocks  bool
	cleanupStarted chan struct{}
	checkpoint     string
}

func (s *recoverySeedStore) ClaimSeedJobContext(ctx context.Context, id int, checkpoint string) (bool, error) {
	s.checkpoint = checkpoint
	return true, nil
}
func (s *recoverySeedStore) UpdateSeedJobContext(ctx context.Context, _ int, status string, _ int, _ float64, _ string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	s.status = status
	return nil
}
func (s *recoverySeedStore) FinishSeedJobContext(ctx context.Context, _ int, checkpoint, status string, _ int, _ string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cleanupLive = ctx.Err() == nil
	deadline, ok := ctx.Deadline()
	s.cleanupBounded = ok && time.Until(deadline) > 0 && time.Until(deadline) <= seedCleanupTimeout
	if checkpoint != s.checkpoint {
		return errors.New("wrong attempt")
	}
	if s.cleanupBlocks {
		close(s.cleanupStarted)
		<-ctx.Done()
		return ctx.Err()
	}
	if s.cleanupFails {
		return errors.New("synthetic database outage")
	}
	s.status = status
	return nil
}

func TestSeedDeadlineUsesFreshTerminalCleanupAndReleasesWorker(t *testing.T) {
	for _, fail := range []bool{false, true} {
		store := &recoverySeedStore{cleanupFails: fail}
		ctx, cancel := context.WithCancel(context.Background())
		client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) { cancel(); return nil, r.Context().Err() })}
		server := &Server{store: store}
		if !server.runSeedJobWorker(ctx, client, 1, "foundation") {
			t.Fatal("worker was not admitted")
		}
		if !store.cleanupLive || !store.cleanupBounded {
			t.Fatalf("cleanup reused expired/unbounded context: live=%v bounded=%v", store.cleanupLive, store.cleanupBounded)
		}
		if !fail && store.status != "failed" {
			t.Fatalf("canceled job status %q", store.status)
		}
		if !acquireSeedWorker() {
			t.Fatal("failed/canceled cleanup retained worker")
		}
		releaseSeedWorker()
		cancel()
	}
}

func TestSeedInvalidArchiveFailureReleasesWorker(t *testing.T) {
	store := &recoverySeedStore{}
	client := &http.Client{Transport: syntheticRoundTripper(func(*http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 200, Body: io.NopCloser(strings.NewReader("synthetic-invalid-archive"))}, nil
	})}
	if !(&Server{store: store}).runSeedJobWorker(context.Background(), client, 1, "foundation") {
		t.Fatal("worker refused")
	}
	if store.status != "failed" || !store.cleanupLive || !store.cleanupBounded {
		t.Fatalf("failure cleanup status=%s live=%v bounded=%v", store.status, store.cleanupLive, store.cleanupBounded)
	}
	if !acquireSeedWorker() {
		t.Fatal("invalid dataset retained worker")
	}
	releaseSeedWorker()
}

func TestSeedCleanupTimeoutReleasesWorker(t *testing.T) {
	store := &recoverySeedStore{cleanupBlocks: true, cleanupStarted: make(chan struct{})}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	client := &http.Client{Transport: syntheticRoundTripper(func(r *http.Request) (*http.Response, error) { cancel(); return nil, r.Context().Err() })}
	done := make(chan struct{})
	go func() { defer close(done); (&Server{store: store}).runSeedJobWorker(ctx, client, 1, "foundation") }()
	<-store.cleanupStarted
	if acquireSeedWorker() {
		releaseSeedWorker()
		t.Fatal("worker released while bounded cleanup is still active")
	}
	select {
	case <-done:
	case <-time.After(seedCleanupTimeout + time.Second):
		t.Fatal("cleanup retained worker beyond its budget")
	}
	if !acquireSeedWorker() {
		t.Fatal("timed-out cleanup retained worker")
	}
	releaseSeedWorker()
}

func TestSeedRecoveryMarkerRequiresVersionedExpiredAttempt(t *testing.T) {
	now := time.Now()
	for _, tc := range []struct {
		checkpoint string
		expired    bool
	}{
		{newSeedCheckpoint(now.Add(-time.Second)), true},
		{newSeedCheckpoint(now.Add(time.Minute)), false},
		{"", false}, {"legacy-checkpoint", false}, {"dietledger-resource-v1/not-a-uuid/not-a-time", false},
	} {
		if got := expiredSeedCheckpoint(tc.checkpoint, now); got != tc.expired {
			t.Fatalf("checkpoint %q expiry=%v want %v", tc.checkpoint, got, tc.expired)
		}
	}
}

func TestSeedUploadFailureUsesFreshTerminalCleanupAndReleasesWorker(t *testing.T) {
	store := &recoverySeedStore{}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	store.Store = &uploadRecoveryStore{owner: store, cancel: cancel}
	body := "--synthetic\r\nContent-Disposition: form-data; name=\"file\"; filename=\"foods.json\"\r\n\r\n[{\"fdcId\":1,\"calories\":2}]\r\n--synthetic--\r\n"
	r := httptest.NewRequest("POST", "/api/foods/seed/upload", strings.NewReader(body)).WithContext(ctx)
	r.Header.Set("Content-Type", "multipart/form-data; boundary=synthetic")
	w := httptest.NewRecorder()
	(&Server{store: store}).foodSeedUploadHandler(w, r)
	if w.Code != 500 || store.status != "failed" || !store.cleanupLive {
		t.Fatalf("status=%d job=%s liveCleanup=%v", w.Code, store.status, store.cleanupLive)
	}
	if !acquireSeedWorker() {
		t.Fatal("upload cancellation retained worker")
	}
	releaseSeedWorker()
}

type uploadRecoveryStore struct {
	Store
	owner  *recoverySeedStore
	cancel context.CancelFunc
}

func (s *uploadRecoveryStore) CreateSeedJob(string, string, string) (*SeedJob, error) {
	return &SeedJob{ID: 2}, nil
}
func (s *uploadRecoveryStore) CreateFoodItems([]FoodItem) (int, error) {
	s.cancel()
	return 0, context.Canceled
}
