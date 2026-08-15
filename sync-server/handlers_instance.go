package main

import (
	"encoding/json"
	"net/http"
)

// ── Instance metadata ────────────────────────────────────────────────
//
// GET /api/instance/state is intentionally public (no requireAuth) so the
// frontend can route to the setup wizard before any user is authenticated.
// The mutation endpoints are administrator-only.

func (s *Server) instanceStateHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	state, err := s.store.GetInstanceState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get instance state")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: state})
}

func (s *Server) completeOnboardingHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := s.store.CompleteOnboarding(1); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to complete onboarding")
		return
	}
	s.writeCurrentInstanceState(w)
}

func (s *Server) registrationHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPut && r.Method != http.MethodPatch {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	var req UpdateRegistrationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := s.store.SetRegistrationEnabled(req.RegistrationEnabled); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update registration setting")
		return
	}
	s.writeCurrentInstanceState(w)
}

func (s *Server) writeCurrentInstanceState(w http.ResponseWriter) {
	state, err := s.store.GetInstanceState()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get instance state")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: state})
}

// resetRequest carries the admin password that gates destructive resets.
type resetRequest struct {
	Password string `json:"password"`
}

// verifyResetPassword confirms the supplied password belongs to the requesting
// admin. Returns false (writing a 401) on any mismatch.
func (s *Server) verifyResetPassword(w http.ResponseWriter, r *http.Request) (string, bool) {
	user := getUserFromContext(r)
	if user == nil {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return "", false
	}
	var req resetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return "", false
	}
	if !s.auth.VerifyUserPassword(user.ID, req.Password) {
		// 403 (not 401): the client treats 401 as token expiry and would log out.
		writeError(w, http.StatusForbidden, "incorrect password")
		return "", false
	}
	return user.ID, true
}

// ResetUserData: wipe all user-generated content; keep accounts, settings,
// instance config, and USDA data.
func (s *Server) resetUserDataHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, ok := s.verifyResetPassword(w, r); !ok {
		return
	}
	if err := s.store.ResetUserData(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reset user data")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// FactoryReset: wipe everything (content + accounts + sessions) and clear
// onboarding so setup re-runs. USDA data is preserved.
func (s *Server) factoryResetHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if _, ok := s.verifyResetPassword(w, r); !ok {
		return
	}
	if err := s.store.FactoryReset(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to factory reset")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}
