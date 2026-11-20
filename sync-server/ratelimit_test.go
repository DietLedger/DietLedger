package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestNormalizeRemoteAddrIgnoresPort(t *testing.T) {
	for _, tc := range []struct{ input, want string }{
		{"192.0.2.4:4321", "192.0.2.4"},
		{"[2001:db8::1]:4321", "2001:db8::1"},
		{"2001:db8::1", "2001:db8::1"},
		{"not-an-address", "not-an-address"},
	} {
		t.Run(tc.input, func(t *testing.T) {
			if got := normalizeRemoteAddr(tc.input); got != tc.want {
				t.Fatalf("normalizeRemoteAddr(%q) = %q, want %q", tc.input, got, tc.want)
			}
		})
	}
}

func TestRateLimiterSeparatesRouteBucketsAndBoundsIdleVisitors(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 2, time.Minute)
	first := rl.getVisitor("192.0.2.1|/api/recipes", 1, 1)
	if first != rl.getVisitor("192.0.2.1|/api/recipes", 1, 1) {
		t.Fatal("same bucket should reuse its limiter")
	}
	if first == rl.getVisitor("192.0.2.1|/api/auth/login", 1, 1) {
		t.Fatal("authentication and ordinary traffic must use separate buckets")
	}
	if got := len(rl.visitors); got != 2 {
		t.Fatalf("visitor count = %d, want 2", got)
	}

	now = now.Add(2 * time.Minute)
	_ = rl.getVisitor("192.0.2.2|/api/recipes", 1, 1)
	if got := len(rl.visitors); got > 2 {
		t.Fatalf("idle visitors were not evicted; visitor count = %d", got)
	}
}

func TestRateLimiterMiddlewareDoesNotTrustForwardedFor(t *testing.T) {
	rl := newRateLimiterWithClock(time.Now, 10, time.Minute)
	handler := rl.Middleware(httpHandlerNoop())
	for _, tc := range []struct{ remote, forwarded string }{
		{"192.0.2.8:1001", "198.51.100.1"},
		{"192.0.2.8:1002", "198.51.100.2"},
	} {
		req := httptest.NewRequest("GET", "/api/recipes", nil)
		req.RemoteAddr = tc.remote
		req.Header.Set("X-Forwarded-For", tc.forwarded)
		handler.ServeHTTP(httptest.NewRecorder(), req)
	}
	if got := len(rl.visitors); got != 1 {
		t.Fatalf("forwarded headers/port churn produced %d limiter identities, want one", got)
	}
}

func TestRateLimiterCapacityDoesNotResetActiveBuckets(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 1, time.Minute)
	first := rl.getVisitor("first", 1, 1)
	if rl.getVisitor("second", 1, 1) != nil {
		t.Fatal("full active map must reject new identities, not evict active buckets")
	}
	now = now.Add(time.Minute)
	if rl.getVisitor("second", 1, 1) == nil {
		t.Fatal("expired capacity must become available")
	}
	if rl.getVisitor("second", 1, 1) == first {
		t.Fatal("new identity reused old bucket")
	}
}

func TestRateLimiterPortChurnAndRouteOrder(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	call := func(path string, port int) int {
		r := httptest.NewRequest("POST", path, nil)
		r.RemoteAddr = fmt.Sprintf("192.0.2.1:%d", port)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if call("/api/recipes", 1) != 204 {
		t.Fatal("general request failed")
	}
	for i := 0; i < 10; i++ {
		if got := call("/api/auth/login", i+1); got != 204 {
			t.Fatalf("early auth rejection %d", got)
		}
	}
	if got := call("/api/auth/login", 999); got != 429 {
		t.Fatalf("port churn bypassed auth limit: %d", got)
	}
	if got := call("/api/recipes", 999); got != 204 {
		t.Fatalf("auth exhausted ordinary bucket: %d", got)
	}
	if got := call("/api/auth/refresh", 999); got != 204 {
		t.Fatalf("login exhausted separate refresh bucket: %d", got)
	}
}

func TestRateLimiterAuthenticatedContextKeepsAuthRouteBucket(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	call := func(path string) int {
		r := httptest.NewRequest("POST", path, nil)
		r = r.WithContext(context.WithValue(r.Context(), userContextKey, &User{ID: "synthetic-user"}))
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	if call("/api/recipes") != 204 {
		t.Fatal("ordinary fixture request failed")
	}
	for i := 0; i < 10; i++ {
		if call("/api/auth/login") != 204 {
			t.Fatal("early auth rejection")
		}
	}
	if got := call("/api/auth/login"); got != 429 {
		t.Fatalf("authenticated general bucket weakened auth: %d", got)
	}
}

func TestRateLimiterLongUnknownAuthPathsUseOneBoundedBucket(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(204) }))
	call := func(path string) int {
		r := httptest.NewRequest("POST", path, nil)
		r.RemoteAddr = "192.0.2.99:1234"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		return w.Code
	}
	large := strings.Repeat("x", (1<<20)-1024)
	for i := 0; i < 64; i++ {
		status := call(fmt.Sprintf("/api/auth/unknown-%d/%s", i, large))
		want := 204
		if i >= 10 {
			want = 429
		}
		if status != want {
			t.Errorf("unknown path %d: status %d want %d", i, status, want)
			break
		}
	}
	if got := len(rl.visitors); got != 1 {
		t.Errorf("unique unknown paths retained %d buckets, want one", got)
	}
	for key := range rl.visitors {
		if len(key) > 128 {
			t.Errorf("attacker-controlled key retained %d bytes", len(key))
		}
	}
	for _, known := range []string{"/api/auth/login", "/api/auth/register", "/api/auth/refresh", "/api/auth/logout"} {
		if got := call(known); got != 204 {
			t.Errorf("unknown auth traffic exhausted known route %s: %d", known, got)
		}
	}
	if got := call("/api/recipes"); got != 204 {
		t.Errorf("unknown auth traffic exhausted ordinary API admission: %d", got)
	}
}

func TestRateLimiterConcurrentUnknownAuthPathsShareQuota(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	var allowed atomic.Int64
	h := rl.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { allowed.Add(1); w.WriteHeader(204) }))
	var workers sync.WaitGroup
	for i := 0; i < 64; i++ {
		workers.Add(1)
		go func(i int) {
			defer workers.Done()
			r := httptest.NewRequest("POST", fmt.Sprintf("/api/auth/not-a-route-%d/%s", i, strings.Repeat("x", 32<<10)), nil)
			r.RemoteAddr = fmt.Sprintf("192.0.2.99:%d", 1000+i)
			h.ServeHTTP(httptest.NewRecorder(), r)
		}(i)
	}
	workers.Wait()
	if got := allowed.Load(); got != 10 {
		t.Fatalf("unknown route quota admitted %d, want 10", got)
	}
	if len(rl.visitors) != 1 {
		t.Fatalf("concurrent unknown paths retained %d identities", len(rl.visitors))
	}
	for key := range rl.visitors {
		if len(key) > 128 {
			t.Fatalf("unknown route key retained %d bytes", len(key))
		}
	}
}

func TestRateLimiterAccountAcrossPeerPool(t *testing.T) {
	now := time.Unix(100, 0)
	rl := newRateLimiterWithClock(func() time.Time { return now }, 100, time.Minute)
	h := rl.AccountMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(b), "email") {
			t.Fatal("account inspection consumed auth body")
		}
		w.WriteHeader(204)
	}))
	for i := 0; i < 6; i++ {
		r := httptest.NewRequest("POST", "/api/auth/login", strings.NewReader(`{"email":"  Alice@Example.COM ","password":"synthetic"}`))
		r.RemoteAddr = fmt.Sprintf("192.0.2.%d:1234", i)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		want := 204
		if i == 5 {
			want = 429
		}
		if w.Code != want {
			t.Fatalf("attempt %d: %d want %d", i, w.Code, want)
		}
	}
	for key := range rl.visitors {
		if strings.Contains(key, "Alice") || strings.Contains(key, "example") {
			t.Fatal("account identity must be hashed in limiter map")
		}
	}
}

func httpHandlerNoop() http.Handler {
	return http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
}
