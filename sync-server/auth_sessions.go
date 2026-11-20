package main

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"time"
)

var ErrInvalidSession = errors.New("invalid session")
var ErrSetupClaim = errors.New("valid unused setup claim required")
var ErrLastAdmin = errors.New("select a different existing successor before removing the last administrator")

func tokenHash(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

func sessionSecret() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// All admission and membership writers take this stable row lock first.
func lockMembership(tx *sql.Tx) error {
	var id int
	return tx.QueryRow(`SELECT id FROM instance_meta WHERE id=1 FOR UPDATE`).Scan(&id)
}

func (s *PostgresStore) CreateSession(userID, sessionID, refreshHash string) (time.Time, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return time.Time{}, err
	}
	defer tx.Rollback()
	var expiry time.Time
	err = tx.QueryRow(`INSERT INTO auth_sessions(id,user_id,expires_at) VALUES ($1,$2,NOW()+INTERVAL '30 days') RETURNING expires_at`, sessionID, userID).Scan(&expiry)
	if err != nil {
		return time.Time{}, err
	}
	if _, err = tx.Exec(`INSERT INTO auth_refresh_tokens(token_hash,session_id) VALUES ($1,$2)`, refreshHash, sessionID); err != nil {
		return time.Time{}, err
	}
	return expiry, tx.Commit()
}

func (s *PostgresStore) SessionActive(sessionID, userID string) (bool, error) {
	var active bool
	err := s.db.QueryRow(`SELECT EXISTS(SELECT 1 FROM auth_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>NOW())`, sessionID, userID).Scan(&active)
	return active, err
}

func (s *PostgresStore) RotateSession(refreshHash, nextHash string) (string, string, time.Time, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return "", "", time.Time{}, err
	}
	defer tx.Rollback()
	var sid, uid string
	var expiry time.Time
	var revoked sql.NullTime
	// Acquire the family lock BEFORE rereading used_at. Concurrent rotation of
	// the same credential cannot observe a stale pre-lock token state.
	err = tx.QueryRow(`SELECT s.id,s.user_id,s.expires_at,s.revoked_at FROM auth_sessions s JOIN auth_refresh_tokens t ON t.session_id=s.id WHERE t.token_hash=$1 FOR UPDATE OF s`, refreshHash).Scan(&sid, &uid, &expiry, &revoked)
	if err == sql.ErrNoRows {
		return "", "", time.Time{}, ErrInvalidSession
	}
	if err != nil {
		return "", "", time.Time{}, err
	}
	var used sql.NullTime
	if err = tx.QueryRow(`SELECT used_at FROM auth_refresh_tokens WHERE token_hash=$1`, refreshHash).Scan(&used); err != nil {
		return "", "", time.Time{}, err
	}
	if revoked.Valid || !expiry.After(time.Now()) || used.Valid {
		if _, err = tx.Exec(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=$1`, sid); err != nil {
			return "", "", time.Time{}, err
		}
		if err = tx.Commit(); err != nil {
			return "", "", time.Time{}, err
		}
		return "", "", time.Time{}, ErrInvalidSession
	}
	if _, err = tx.Exec(`UPDATE auth_refresh_tokens SET used_at=NOW() WHERE token_hash=$1`, refreshHash); err != nil {
		return "", "", time.Time{}, err
	}
	if _, err = tx.Exec(`INSERT INTO auth_refresh_tokens(token_hash,session_id) VALUES ($1,$2)`, nextHash, sid); err != nil {
		return "", "", time.Time{}, err
	}
	return uid, sid, expiry, tx.Commit()
}

func (s *PostgresStore) RevokeSession(refreshHash string) error {
	_, err := s.db.Exec(`UPDATE auth_sessions SET revoked_at=COALESCE(revoked_at,NOW()) WHERE id=(SELECT session_id FROM auth_refresh_tokens WHERE token_hash=$1)`, refreshHash)
	return err
}
