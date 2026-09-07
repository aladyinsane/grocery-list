-- Initial schema. See ADR-0005 for why the columns are shaped this way.

CREATE TABLE households (
  id                       TEXT    PRIMARY KEY,
  -- SHA-256 of the secret link token. The plaintext is returned once, at creation,
  -- and never stored (ADR-0004).
  token_hash               TEXT    NOT NULL UNIQUE,
  -- Monotonic write counter. Bumped once per mutation batch and stamped onto every
  -- item that batch touches; this is the sync cursor (ADR-0005 section 5).
  revision                 INTEGER NOT NULL DEFAULT 0,
  -- High-water mark of revisions whose tombstones have been purged. A client whose
  -- cursor is at or below this can no longer learn about those deletes by catching
  -- up, so it is told to resync from scratch instead (ADR-0005 section 6).
  purged_through_revision  INTEGER NOT NULL DEFAULT 0,
  created_at               INTEGER NOT NULL
);

CREATE TABLE items (
  -- Generated on the client before the item is ever sent, which is what makes every
  -- mutation idempotent under retry (ADR-0005 section 1).
  id                  TEXT    PRIMARY KEY,
  household_id        TEXT    NOT NULL REFERENCES households(id),
  name                TEXT    NOT NULL,
  -- name and checked carry independent clocks so they merge separately: renaming an
  -- item must never resurrect its old checked state (ADR-0005 section 4).
  name_updated_at     INTEGER NOT NULL,
  checked             INTEGER NOT NULL DEFAULT 0,
  checked_updated_at  INTEGER NOT NULL,
  -- Tombstone. Non-null means deleted; retained 30 days so the delete still reaches
  -- a phone that was offline (ADR-0005 section 6).
  deleted_at          INTEGER,
  created_at          INTEGER NOT NULL,
  revision            INTEGER NOT NULL
);

-- The only query shape the sync endpoint uses: "what changed after revision N?"
CREATE INDEX idx_items_household_revision ON items (household_id, revision);
