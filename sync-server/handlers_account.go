package main

import (
	"encoding/json"
	"errors"
	"net/http"
)

// ── Account self-service (password-gated) ────────────────────────────
//
// These are distinct from the instance-wide admin resets: each is scoped to
// the calling user and requires their own password (a fresh challenge, not
// the bearer token). Wrong password returns 403 (not 401) so the client
// doesn't treat it as token expiry and log the user out.

func (s *Server) deleteDataHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	var req resetRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !s.auth.VerifyUserPassword(user.ID, req.Password) {
		writeError(w, http.StatusForbidden, "incorrect password")
		return
	}
	if err := s.store.DeleteUserData(user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete data")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

func (s *Server) deleteAccountHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	user := getUserFromContext(r)
	var req struct {
		Password       string `json:"password"`
		NewAdminUserID string `json:"newAdminUserId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if !s.auth.VerifyUserPassword(user.ID, req.Password) {
		writeError(w, http.StatusForbidden, "incorrect password")
		return
	}

	// Membership validation, successor promotion and deletion commit together.
	if err := s.store.DeleteAccount(user.ID, req.NewAdminUserID); err != nil {
		if errors.Is(err, ErrLastAdmin) {
			writeError(w, http.StatusBadRequest, ErrLastAdmin.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete account")
		return
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true})
}

// ── Admin: user list (e.g. successor dropdown) ───────────────────────

func (s *Server) listUsersHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	users, err := s.store.ListUsers()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list users")
		return
	}
	if users == nil {
		users = []UserListEntry{}
	}
	writeJSON(w, http.StatusOK, APIResponse{OK: true, Data: users})
}
