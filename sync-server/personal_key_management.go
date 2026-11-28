package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"slices"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
)

const personalKeyLifetime = 90 * 24 * time.Hour
const personalKeyLimit = 10

var errPersonalKeyLimit = errors.New("personal key limit reached")

type personalKeyMetadata struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	Scopes    []string  `json:"scopes"`
	CreatedAt time.Time `json:"createdAt"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type createPersonalKeyRequest struct {
	Name     string   `json:"name"`
	Scopes   []string `json:"scopes"`
	Password string   `json:"password"`
}

type issuedPersonalKey struct {
	personalKeyMetadata
	Key string `json:"key"`
}

func (s *Server) personalKeyMutationAllowed(r *http.Request) bool {
	origins := r.Header.Values("Origin")
	csrf := r.Header.Values("X-CSRF-Token")
	if len(origins) != 1 || len(csrf) != 1 || csrf[0] != "dietledger" || !slices.Contains(parseAllowedOrigins(s.corsOrigin), origins[0]) {
		return false
	}
	u, err := url.Parse(origins[0])
	return err == nil && u.Scheme == "https" && u.Hostname() != "" && u.User == nil && u.Path == "" && u.RawQuery == "" && !u.ForceQuery && u.Fragment == ""
}

func (s *Server) personalKeysRouter(w http.ResponseWriter, r *http.Request) {
	owner := getUserFromContext(r).ID
	switch r.Method {
	case http.MethodGet:
		keys, err := s.store.ListPersonalKeys(r.Context(), owner)
		if err != nil {
			writeError(w, 503, "personal key management unavailable")
			return
		}
		writeJSON(w, 200, APIResponse{OK: true, Data: keys})
	case http.MethodPost:
		if !s.personalKeyMutationAllowed(r) {
			writeError(w, 403, "HTTPS origin and CSRF header required")
			return
		}
		var req createPersonalKeyRequest
		dec := json.NewDecoder(r.Body)
		dec.DisallowUnknownFields()
		if err := dec.Decode(&req); err != nil || dec.Decode(new(any)) != io.EOF {
			writeError(w, 400, "invalid personal key request")
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || utf8.RuneCountInString(req.Name) > 80 || strings.ContainsRune(req.Name, 0) || !validPersonalKeyScopes(req.Scopes) {
			writeError(w, 400, "provide a name and distinct supported scopes")
			return
		}
		if rl := s.rateLimiter; rl != nil {
			// Fixed account bucket bounds password checks even across different peers.
			limiter := rl.getVisitor("personal-key-issue|"+owner, 0.1, 5)
			if limiter == nil || !limiter.AllowN(rl.now(), 1) {
				writeRateLimit(w)
				return
			}
		}
		if len(req.Password) > 72 || !s.auth.VerifyUserPassword(owner, req.Password) {
			writeError(w, 403, "incorrect password")
			return
		}
		var raw [32]byte
		if _, err := rand.Read(raw[:]); err != nil {
			writeError(w, 503, "personal key management unavailable")
			return
		}
		token := personalKeyPrefix + base64.RawURLEncoding.EncodeToString(raw[:])
		digest := sha256.Sum256([]byte(token))
		key, err := s.store.CreatePersonalKey(r.Context(), owner, req.Name, req.Scopes, digest)
		if errors.Is(err, errPersonalKeyLimit) {
			writeError(w, 409, "personal key limit reached; remove an old key")
			return
		}
		if err != nil {
			writeError(w, 503, "personal key management unavailable")
			return
		}
		writeJSON(w, 201, APIResponse{OK: true, Data: issuedPersonalKey{personalKeyMetadata: *key, Key: token}})
	default:
		writeError(w, 405, "method not allowed")
	}
}

func (s *Server) revokePersonalKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		writeError(w, 405, "method not allowed")
		return
	}
	if !s.personalKeyMutationAllowed(r) {
		writeError(w, 403, "HTTPS origin and CSRF header required")
		return
	}
	id := r.PathValue("keyId")
	parsed, err := uuid.Parse(id)
	if err != nil || parsed.String() != id {
		writeError(w, 404, "personal key not found")
		return
	}
	removed, err := s.store.DeletePersonalKey(r.Context(), getUserFromContext(r).ID, id)
	if err != nil {
		writeError(w, 503, "personal key management unavailable")
		return
	}
	if !removed {
		writeError(w, 404, "personal key not found")
		return
	}
	writeJSON(w, 200, APIResponse{OK: true})
}

func (s *PostgresStore) CreatePersonalKey(ctx context.Context, owner, name string, scopes []string, digest [32]byte) (*personalKeyMetadata, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if err := lockImportOwner(tx, owner); err != nil {
		return nil, err
	}
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM personal_api_keys WHERE user_id=$1`, owner).Scan(&count); err != nil {
		return nil, err
	}
	if count >= personalKeyLimit {
		return nil, errPersonalKeyLimit
	}
	encoded, err := json.Marshal(scopes)
	if err != nil {
		return nil, err
	}
	now := time.Now().UTC().Truncate(time.Microsecond)
	key := &personalKeyMetadata{ID: uuid.NewString(), Name: name, Scopes: scopes, CreatedAt: now, ExpiresAt: now.Add(personalKeyLifetime)}
	if _, err := tx.ExecContext(ctx, `INSERT INTO personal_api_keys (id,user_id,name,scopes,secret_digest,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)`, key.ID, owner, key.Name, encoded, digest[:], key.CreatedAt, key.ExpiresAt); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return key, nil
}

func (s *PostgresStore) ListPersonalKeys(ctx context.Context, owner string) ([]personalKeyMetadata, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id,name,scopes,created_at,expires_at FROM personal_api_keys WHERE user_id=$1 ORDER BY created_at DESC,id`, owner)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []personalKeyMetadata{}
	for rows.Next() {
		var key personalKeyMetadata
		var scopes []byte
		if err := rows.Scan(&key.ID, &key.Name, &scopes, &key.CreatedAt, &key.ExpiresAt); err != nil {
			return nil, err
		}
		if err := json.Unmarshal(scopes, &key.Scopes); err != nil {
			key.Scopes = []string{}
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

func (s *PostgresStore) DeletePersonalKey(ctx context.Context, owner, id string) (bool, error) {
	result, err := s.db.ExecContext(ctx, `DELETE FROM personal_api_keys WHERE user_id=$1 AND id=$2`, owner, id)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	return n == 1, err
}
