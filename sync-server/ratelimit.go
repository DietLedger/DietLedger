package main

import (
	"net/http"
	"sync"

	"golang.org/x/time/rate"
)

type RateLimiter struct {
	visitors map[string]*visitorLimiter
	mu       sync.RWMutex
	global   *rate.Limiter
}

type visitorLimiter struct {
	limiter  *rate.Limiter
	lastSeen int64
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		visitors: make(map[string]*visitorLimiter),
		global:   rate.NewLimiter(100, 200),
	}
}

func (rl *RateLimiter) getVisitor(key string, rps float64, burst int) *rate.Limiter {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	if v, exists := rl.visitors[key]; exists {
		v.lastSeen = 0
		return v.limiter
	}
	limiter := rate.NewLimiter(rate.Limit(rps), burst)
	rl.visitors[key] = &visitorLimiter{limiter: limiter}
	return limiter
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !rl.global.Allow() {
			http.Error(w, `{"ok":false,"error":"rate limit exceeded"}`, http.StatusTooManyRequests)
			w.Header().Set("Retry-After", "60")
			return
		}
		key := r.RemoteAddr
		if uid, ok := r.Context().Value(userContextKey).(*User); ok && uid != nil {
			key = uid.ID
		}
		rps := 30.0
		burst := 60
		if r.URL.Path == "/api/auth/login" || r.URL.Path == "/api/auth/register" {
			rps = 10.0
			burst = 20
		}
		limiter := rl.getVisitor(key, rps, burst)
		if !limiter.Allow() {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Retry-After", "60")
			w.WriteHeader(http.StatusTooManyRequests)
			w.Write([]byte(`{"ok":false,"error":"rate limit exceeded"}`))
			return
		}
		next.ServeHTTP(w, r)
	})
}
