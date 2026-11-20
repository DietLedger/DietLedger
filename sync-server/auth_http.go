package main

import (
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"
)

const refreshCookieName = "__Host-dietledger_refresh"
const loopbackRefreshCookieName = "dietledger_refresh_loopback"
const legacyRefreshCookieName = "dietledger_refresh"

func (s *Server) browserAuthRequest(w http.ResponseWriter, r *http.Request, csrf bool) bool {
	w.Header().Set("Cache-Control", "no-store")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return false
	}
	origin := r.Header.Get("Origin")
	allowed := false
	for _, candidate := range strings.Split(s.corsOrigin, ",") {
		if origin != "" && origin == strings.TrimSpace(candidate) {
			allowed = true
		}
	}
	u, err := url.Parse(origin)
	if !allowed || err != nil || u.User != nil || u.Host == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
		writeError(w, http.StatusForbidden, "origin not allowed")
		return false
	}
	if u.Scheme != "https" {
		host := u.Hostname()
		ip := net.ParseIP(host)
		loopback := host == "localhost" || (ip != nil && ip.IsLoopback())
		if u.Scheme != "http" || os.Getenv("AUTH_ALLOW_INSECURE_LOOPBACK") != "true" || !loopback {
			writeError(w, http.StatusForbidden, "HTTPS required")
			return false
		}
	}
	// A non-simple header cannot be sent by cross-origin forms; disallowed
	// origins are rejected above even when browser CORS is not enforced.
	if csrf && r.Header.Get("X-CSRF-Token") != "dietledger" {
		writeError(w, http.StatusForbidden, "CSRF header required")
		return false
	}
	return true
}

// Called only after browserAuthRequest validates the exact public origin and
// rejects HTTP except explicitly enabled loopback development.
func refreshCookieProtocol(r *http.Request) (name, path string, secure bool) {
	if strings.HasPrefix(r.Header.Get("Origin"), "http://") {
		return loopbackRefreshCookieName, "/api/auth", false
	}
	return refreshCookieName, "/", true
}

func selectedRefreshCookie(r *http.Request) (*http.Cookie, error) {
	name, _, _ := refreshCookieProtocol(r)
	var selected *http.Cookie
	for _, cookie := range r.Cookies() {
		if cookie.Name != name {
			continue
		}
		if selected != nil {
			return nil, ErrInvalidSession
		}
		selected = cookie
	}
	if selected == nil {
		return nil, http.ErrNoCookie
	}
	return selected, nil
}

func refreshCookie(r *http.Request, value string, expiry time.Time) *http.Cookie {
	name, path, secure := refreshCookieProtocol(r)
	return &http.Cookie{Name: name, Value: value, Path: path, Expires: expiry, MaxAge: int(time.Until(expiry).Seconds()), HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode}
}

func clearLegacyRefreshCookies(w http.ResponseWriter, r *http.Request) {
	_, _, secure := refreshCookieProtocol(r)
	// No legacy value is read and no parent Domain is guessed. A foreign-domain
	// cookie may remain in the browser, but its name is never accepted for auth.
	for _, path := range []string{"/", "/api/auth", "/api/auth/refresh", "/api/auth/logout"} {
		http.SetCookie(w, &http.Cookie{Name: legacyRefreshCookieName, Path: path, MaxAge: -1, Expires: time.Unix(1, 0), HttpOnly: true, Secure: secure, SameSite: http.SameSiteStrictMode})
	}
}
func (s *Server) clearRefreshCookie(w http.ResponseWriter, r *http.Request) {
	c := refreshCookie(r, "", time.Unix(1, 0))
	c.MaxAge = -1
	http.SetCookie(w, c)
	clearLegacyRefreshCookies(w, r)
}
func (s *Server) writeAuthResponse(w http.ResponseWriter, r *http.Request, status int, resp *AuthResponse) {
	http.SetCookie(w, refreshCookie(r, resp.RefreshToken, resp.RefreshExpiresAt))
	clearLegacyRefreshCookies(w, r)
	writeJSON(w, status, resp)
}
func (s *Server) logoutHandler(w http.ResponseWriter, r *http.Request) {
	if !s.browserAuthRequest(w, r, true) {
		return
	}
	cookie, err := selectedRefreshCookie(r)
	if err != nil && err != http.ErrNoCookie {
		s.clearRefreshCookie(w, r)
		writeError(w, http.StatusUnauthorized, "invalid session")
		return
	}
	if err == nil {
		if err := s.store.RevokeSession(tokenHash(cookie.Value)); err != nil {
			writeError(w, http.StatusServiceUnavailable, "logout unavailable")
			return
		}
	}
	s.clearRefreshCookie(w, r)
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}
