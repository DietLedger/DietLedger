DROP TRIGGER book_import_owner_lock ON chapter_recipes;
DROP TRIGGER book_import_owner_lock ON chapter_pages;
DROP TRIGGER book_import_owner_lock ON book_pages;
DROP TRIGGER book_import_owner_lock ON chapters;
DROP TRIGGER book_import_owner_lock ON recipe_books;
DROP FUNCTION lock_book_structure_owner();
ALTER TABLE recipe_import_batches DROP COLUMN book_state;
