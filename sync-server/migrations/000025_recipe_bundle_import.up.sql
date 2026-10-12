ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS source_key TEXT;

CREATE TABLE IF NOT EXISTS import_object_mappings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_format TEXT NOT NULL,
    source_object_type TEXT NOT NULL,
    source_object_key TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, source_format, source_object_type, source_object_key)
);

CREATE INDEX IF NOT EXISTS idx_import_mappings_user_type_hash ON import_object_mappings(user_id, source_format, source_object_type, content_hash);
CREATE INDEX IF NOT EXISTS idx_import_mappings_target ON import_object_mappings(target_table, target_id);
