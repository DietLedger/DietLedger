-- Local row keys remain installation-specific. Portable identities are assigned
-- once and retained across package transfers, independently of editable content.
ALTER TABLE recipes ADD COLUMN portable_id TEXT NOT NULL
    DEFAULT ('dietledger:recipe:' || gen_random_uuid()::text);
ALTER TABLE custom_foods ADD COLUMN portable_id TEXT NOT NULL
    DEFAULT ('dietledger:food:' || gen_random_uuid()::text);

ALTER TABLE recipes ADD CONSTRAINT recipes_portable_id_format
    CHECK (portable_id ~ '^dietledger:recipe:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
ALTER TABLE custom_foods ADD CONSTRAINT custom_foods_portable_id_format
    CHECK (portable_id ~ '^dietledger:food:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$');
CREATE UNIQUE INDEX recipes_owner_portable_id ON recipes(user_id, portable_id);
CREATE UNIQUE INDEX custom_foods_owner_portable_id ON custom_foods(user_id, portable_id);

CREATE FUNCTION protect_portable_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.portable_id IS DISTINCT FROM OLD.portable_id THEN
        RAISE EXCEPTION 'portable identity is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER recipes_protect_portable_identity BEFORE UPDATE OF portable_id ON recipes
    FOR EACH ROW EXECUTE FUNCTION protect_portable_identity();
CREATE TRIGGER custom_foods_protect_portable_identity BEFORE UPDATE OF portable_id ON custom_foods
    FOR EACH ROW EXECUTE FUNCTION protect_portable_identity();
