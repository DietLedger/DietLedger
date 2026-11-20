-- Single-row instance-wide metadata. Owns first-run onboarding state and the
-- admin-controlled registration toggle. The CHECK constraint guarantees there
-- is ever only one row (id = 1), making this a single source of truth for the
-- whole instance (see docs/ARCHITECTURE.md ownership model).
CREATE TABLE IF NOT EXISTS instance_meta (
    id                     INT PRIMARY KEY DEFAULT 1,
    onboarding_completed_at TIMESTAMPTZ,
    registration_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
    onboarding_version     INT NOT NULL DEFAULT 1,
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT instance_meta_single_row CHECK (id = 1)
);

INSERT INTO instance_meta (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
