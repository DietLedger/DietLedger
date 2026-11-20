package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const (
	defaultVisitorCapacity = 10000
	defaultVisitorIdle     = 10 * time.Minute
)

type RateLimiter struct {
	visitors map[string]*visitorLimiter
	mu       sync.Mutex
	global   *rate.Limiter
	now      func() time.Time
	capacity int
	idleFor  time.Duration
}

type visitorLimiter struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func NewRateLimiter() *RateLimiter {
	return newRateLimiterWithClock(time.Now, defaultVisitorCapacity, defaultVisitorIdle)
}

func newRateLimiterWithClock(now func() time.Time, capacity int, idleFor time.Duration) *RateLimiter {
	if now == nil {
		now = time.Now
	}
	if capacity < 1 {
		capacity = defaultVisitorCapacity
	}
	if idleFor <= 0 {
		idleFor = defaultVisitorIdle
	}
	return &RateLimiter{
		visitors: make(map[string]*visitorLimiter),
		global:   rate.NewLimiter(100, 200),
		now:      now,
		capacity: capacity,
		idleFor:  idleFor,
	}
}

func normalizeRemoteAddr(remoteAddr string) string {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err == nil {
		return strings.Trim(host, "[]")
	}
	return strings.Trim(remoteAddr, "[]")
}

func (rl *RateLimiter) getVisitor(key string, rps float64, burst int) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.now()
	if v, exists := rl.visitors[key]; exists && now.Sub(v.lastSeen) < rl.idleFor {
		v.lastSeen = now
		return v.limiter
	}
	for visitorKey, visitor := range rl.visitors {
		if now.Sub(visitor.lastSeen) >= rl.idleFor {
			delete(rl.visitors, visitorKey)
		}
	}
	if len(rl.visitors) >= rl.capacity {
		// Fail closed rather than allowing identity churn to reset active buckets.
		return nil
	}
	limiter := rate.NewLimiter(rate.Limit(rps), burst)
	rl.visitors[key] = &visitorLimiter{limiter: limiter, lastSeen: now}
	return limiter
}

func writeRateLimit(w http.ResponseWriter) {
	w.Header().Set("Retry-After", "60")
	writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
}

// Run AFTER resourceAdmission: inspect only an already-bounded auth body and
// restore it byte-for-byte. The map retains only a hash, never email/password.
func (rl *RateLimiter) AccountMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost && (r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/register") {
			body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, ordinaryBodyBytes))
			if err != nil {
				writeError(w, http.StatusRequestEntityTooLarge, "invalid authentication body")
				return
			}
			r.Body = io.NopCloser(bytes.NewReader(body))
			var target struct {
				Email string `json:"email"`
			}
			if json.Unmarshal(body, &target) == nil && strings.TrimSpace(target.Email) != "" {
				digest := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(target.Email))))
				key := "account:" + r.URL.Path + "|" + hex.EncodeToString(digest[:])
				limiter := rl.getVisitor(key, 0.1, 5)
				if limiter == nil || !limiter.AllowN(rl.now(), 1) {
					writeRateLimit(w)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.global.AllowN(rl.now(), 1) {
			writeRateLimit(w)
			return
		}
		peer := normalizeRemoteAddr(r.RemoteAddr)
		bucket := "api"
		rps := 30.0
		burst := 60
		if strings.HasPrefix(r.URL.Path, "/api/auth/") {
			// Never retain a caller-controlled path in a visitor key. Unknown
			// auth paths share one bucket, regardless of their length/uniqueness.
			bucket = "auth:unknown"
			switch r.URL.Path {
			case "/api/auth/login":
				bucket = "auth:login"
			case "/api/auth/register":
				bucket = "auth:register"
			case "/api/auth/refresh":
				bucket = "auth:refresh"
			case "/api/auth/logout":
				bucket = "auth:logout"
			}
			rps = 1.0
			burst = 10
		}
		key := bucket + "|" + peer
		if uid, ok := r.Context().Value(userContextKey).(*User); ok && uid != nil {
			key = bucket + "|user|" + uid.ID
		}
		limiter := rl.getVisitor(key, rps, burst)
		if limiter == nil || !limiter.AllowN(rl.now(), 1) {
			writeRateLimit(w)
			return
		}
		next.ServeHTTP(w, r)
	})
}
