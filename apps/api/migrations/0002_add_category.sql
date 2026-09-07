-- Automatic categorization (ADR-0008).
--
-- Additive: existing items keep a null category and render under "Other" until they are
-- moved. We are deliberately not backfilling -- a grocery list turns over completely every
-- week, so the problem disposes of itself within one shop.

ALTER TABLE items ADD COLUMN category TEXT;

-- Its own clock, so the category merges independently of the name and checked state
-- exactly as ADR-0005 requires: moving an item to another aisle must not resurrect a stale
-- name or un-check it.
ALTER TABLE items ADD COLUMN category_updated_at INTEGER NOT NULL DEFAULT 0;
