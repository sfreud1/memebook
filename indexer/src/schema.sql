-- The book is a projection of the program's event stream. Nothing here is
-- authoritative: the chain is. If this database is dropped, `--backfill-only`
-- rebuilds it from genesis.

CREATE TABLE IF NOT EXISTS cursor (
  id            INTEGER PRIMARY KEY CHECK (id = 1),
  last_slot     BIGINT      NOT NULL DEFAULT 0,
  last_signature TEXT,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO cursor (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Raw log, kept for idempotency and for replaying projections after a bug fix
-- without re-hitting the RPC.
CREATE TABLE IF NOT EXISTS events (
  signature   TEXT    NOT NULL,
  event_index INTEGER NOT NULL,
  slot        BIGINT  NOT NULL,
  block_time  BIGINT,
  kind        TEXT    NOT NULL,
  payload     JSONB   NOT NULL,
  PRIMARY KEY (signature, event_index)
);
CREATE INDEX IF NOT EXISTS events_slot_idx ON events (slot);
CREATE INDEX IF NOT EXISTS events_kind_idx ON events (kind);

CREATE TABLE IF NOT EXISTS offers (
  pubkey              TEXT PRIMARY KEY,
  lender              TEXT   NOT NULL,
  principal_mint      TEXT   NOT NULL,
  collateral_mint     TEXT   NOT NULL,
  principal_total     NUMERIC(39,0) NOT NULL,
  principal_available NUMERIC(39,0) NOT NULL,
  collateral_total    NUMERIC(39,0) NOT NULL,
  min_draw            NUMERIC(39,0) NOT NULL,
  apr_bps             INTEGER NOT NULL,
  duration_seconds    INTEGER NOT NULL,
  expiry_ts           BIGINT  NOT NULL,
  -- 'open' | 'cancelled' | 'drained'
  status              TEXT    NOT NULL DEFAULT 'open',
  loans_opened        INTEGER NOT NULL DEFAULT 0,
  created_slot        BIGINT  NOT NULL,
  created_at          BIGINT  NOT NULL,
  updated_at          BIGINT  NOT NULL
);
-- The book query: "offers against mint X, in principal Y, still fundable".
CREATE INDEX IF NOT EXISTS offers_book_idx
  ON offers (collateral_mint, principal_mint, status, apr_bps)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS offers_lender_idx ON offers (lender);
CREATE INDEX IF NOT EXISTS offers_expiry_idx ON offers (expiry_ts) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS loans (
  pubkey            TEXT PRIMARY KEY,
  offer             TEXT   NOT NULL,
  borrower          TEXT   NOT NULL,
  lender            TEXT   NOT NULL,
  principal_mint    TEXT   NOT NULL,
  collateral_mint   TEXT   NOT NULL,
  principal_amount  NUMERIC(39,0) NOT NULL,
  collateral_amount NUMERIC(39,0) NOT NULL,
  interest_amount   NUMERIC(39,0) NOT NULL,
  origination_fee   NUMERIC(39,0) NOT NULL DEFAULT 0,
  start_ts          BIGINT NOT NULL,
  maturity_ts       BIGINT NOT NULL,
  -- 'active' | 'repaid' | 'defaulted'
  status            TEXT   NOT NULL DEFAULT 'active',
  settled_ts        BIGINT,
  lender_received   NUMERIC(39,0),
  collateral_claimed NUMERIC(39,0),
  created_slot      BIGINT NOT NULL,
  updated_at        BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS loans_borrower_idx ON loans (borrower, status);
CREATE INDEX IF NOT EXISTS loans_lender_idx   ON loans (lender, status);
CREATE INDEX IF NOT EXISTS loans_collateral_idx ON loans (collateral_mint, status);
-- Drives the "claim these defaults" keeper query.
CREATE INDEX IF NOT EXISTS loans_maturity_idx ON loans (maturity_ts) WHERE status = 'active';
