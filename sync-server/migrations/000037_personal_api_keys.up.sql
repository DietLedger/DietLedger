CREATE TABLE personal_api_keys (
    id UUID PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 80 AND length(btrim(name)) > 0),
    scopes JSONB NOT NULL CHECK (jsonb_typeof(scopes) = 'array'),
    secret_digest BYTEA NOT NULL UNIQUE CHECK (octet_length(secret_digest) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL CHECK (expires_at > created_at)
);

CREATE INDEX idx_personal_api_keys_user_id ON personal_api_keys(user_id);
