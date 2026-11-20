-- Deferred choices and explicit supersession survive staging and owner backup.
ALTER TABLE recipe_import_batches ADD COLUMN book_state JSONB NOT NULL DEFAULT '{}';

-- The existing import transaction locks its owner row. Ordinary book-structure
-- writes must share that boundary so an import can validate a complete title
-- candidate set without global table locks (including concurrent book inserts).
CREATE FUNCTION lock_book_structure_owner() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    before_row JSONB;
    after_row JSONB;
BEGIN
    IF TG_OP <> 'INSERT' THEN before_row := to_jsonb(OLD); END IF;
    IF TG_OP <> 'DELETE' THEN after_row := to_jsonb(NEW); END IF;
    IF TG_TABLE_NAME = 'recipe_books' THEN
        PERFORM id FROM users
        WHERE id IN (before_row->>'user_id', after_row->>'user_id')
        ORDER BY id FOR UPDATE;
    ELSIF TG_TABLE_NAME IN ('chapters', 'book_pages') THEN
        PERFORM u.id FROM users u
        WHERE u.id IN (SELECT b.user_id FROM recipe_books b
            WHERE b.id IN (before_row->>'book_id', after_row->>'book_id'))
        ORDER BY u.id FOR UPDATE;
    ELSE
        PERFORM u.id FROM users u
        WHERE u.id IN (SELECT b.user_id FROM chapters c
            JOIN recipe_books b ON b.id=c.book_id
            WHERE c.id IN (before_row->>'chapter_id', after_row->>'chapter_id'))
        ORDER BY u.id FOR UPDATE;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;
CREATE TRIGGER book_import_owner_lock BEFORE INSERT OR UPDATE OR DELETE ON recipe_books
    FOR EACH ROW EXECUTE FUNCTION lock_book_structure_owner();
CREATE TRIGGER book_import_owner_lock BEFORE INSERT OR UPDATE OR DELETE ON chapters
    FOR EACH ROW EXECUTE FUNCTION lock_book_structure_owner();
CREATE TRIGGER book_import_owner_lock BEFORE INSERT OR UPDATE OR DELETE ON book_pages
    FOR EACH ROW EXECUTE FUNCTION lock_book_structure_owner();
CREATE TRIGGER book_import_owner_lock BEFORE INSERT OR UPDATE OR DELETE ON chapter_pages
    FOR EACH ROW EXECUTE FUNCTION lock_book_structure_owner();
CREATE TRIGGER book_import_owner_lock BEFORE INSERT OR UPDATE OR DELETE ON chapter_recipes
    FOR EACH ROW EXECUTE FUNCTION lock_book_structure_owner();
