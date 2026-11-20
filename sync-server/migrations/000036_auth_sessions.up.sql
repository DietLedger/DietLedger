-- No user content is deleted. Legacy bearer keys/stateless tokens are retired.
ALTER TABLE users ALTER COLUMN api_key DROP NOT NULL;
UPDATE users SET api_key = NULL;
CREATE TABLE IF NOT EXISTS bootstrap_claim_consumptions (
    claim_hash TEXT PRIMARY KEY,
    consumed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE auth_sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_sessions_user_id ON auth_sessions(user_id);
CREATE TABLE auth_refresh_tokens (
    token_hash TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES auth_sessions(id) ON DELETE CASCADE,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX auth_refresh_tokens_session_id ON auth_refresh_tokens(session_id);
-- The former refresh_tokens table was not used by the stateless implementation.
-- It is retained for rollback/schema compatibility, never accepted for auth.
