CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    parent_id TEXT REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);

CREATE TABLE IF NOT EXISTS recipe_books (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    cover_color TEXT NOT NULL DEFAULT '#059669',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_books_user_id ON recipe_books(user_id);
CREATE INDEX IF NOT EXISTS idx_books_updated_at ON recipe_books(updated_at);

CREATE TABLE IF NOT EXISTS chapters (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES recipe_books(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    position INT NOT NULL DEFAULT 0,
    page_template_id TEXT,
    recipe_template_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chapters_book_id ON chapters(book_id);
CREATE INDEX IF NOT EXISTS idx_chapters_position ON chapters(position);

CREATE TABLE IF NOT EXISTS chapter_recipes (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 0,
    UNIQUE(chapter_id, recipe_id)
);
CREATE INDEX IF NOT EXISTS idx_chapter_recipes_chapter_id ON chapter_recipes(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_recipes_recipe_id ON chapter_recipes(recipe_id);

CREATE TABLE IF NOT EXISTS chapter_pages (
    id TEXT PRIMARY KEY,
    chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chapter_pages_chapter_id ON chapter_pages(chapter_id);
CREATE INDEX IF NOT EXISTS idx_chapter_pages_position ON chapter_pages(position);

CREATE TABLE IF NOT EXISTS book_pages (
    id TEXT PRIMARY KEY,
    book_id TEXT NOT NULL REFERENCES recipe_books(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    position INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_book_pages_book_id ON book_pages(book_id);

CREATE TABLE IF NOT EXISTS recipe_categories (
    id TEXT PRIMARY KEY,
    recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(recipe_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_recipe_categories_recipe_id ON recipe_categories(recipe_id);
CREATE INDEX IF NOT EXISTS idx_recipe_categories_category_id ON recipe_categories(category_id);
