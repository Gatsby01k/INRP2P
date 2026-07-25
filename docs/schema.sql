-- Production reference schema. Do not use the in-memory demo ledger for real money.

CREATE TABLE app_user (
  id BIGSERIAL PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE wallet_account (
  id UUID PRIMARY KEY,
  user_id BIGINT REFERENCES app_user(id),
  currency TEXT NOT NULL,
  account_type TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, currency, account_type)
);

CREATE TABLE wallet_journal (
  id UUID PRIMARY KEY,
  operation_id UUID NOT NULL,
  account_id UUID NOT NULL REFERENCES wallet_account(id),
  amount_minor BIGINT NOT NULL CHECK (amount_minor <> 0),
  entry_type TEXT NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(operation_id, account_id, entry_type)
);

CREATE TABLE game_round (
  id UUID PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES app_user(id),
  bet_minor BIGINT NOT NULL CHECK (bet_minor > 0),
  status TEXT NOT NULL,
  seed_commitment TEXT NOT NULL,
  encrypted_seed BYTEA NOT NULL,
  bust_impact INTEGER NOT NULL,
  overdrive_impact INTEGER,
  survived_impacts INTEGER NOT NULL DEFAULT 0,
  multiplier NUMERIC(12,4) NOT NULL DEFAULT 1,
  payout_minor BIGINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  settled_at TIMESTAMPTZ,
  version INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE game_round_event (
  id BIGSERIAL PRIMARY KEY,
  round_id UUID NOT NULL REFERENCES game_round(id),
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  multiplier NUMERIC(12,4),
  server_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL DEFAULT '{}',
  UNIQUE(round_id, sequence)
);

CREATE TABLE idempotency_key (
  user_id BIGINT NOT NULL REFERENCES app_user(id),
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, key)
);

CREATE TABLE responsible_limit (
  user_id BIGINT PRIMARY KEY REFERENCES app_user(id),
  deposit_daily_minor BIGINT,
  loss_daily_minor BIGINT,
  wager_daily_minor BIGINT,
  session_minutes INTEGER,
  self_excluded_until TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
