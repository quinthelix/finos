-- Initial schema for commodity hedging PoC
-- Includes core multi-tenant tables and supporting data stores

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  full_name text,
  password_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS company_users (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, user_id)
);

CREATE TABLE IF NOT EXISTS market_prices (
  id bigserial PRIMARY KEY,
  commodity_id text NOT NULL,
  price numeric(18,6) NOT NULL,
  currency text NOT NULL,
  unit text NOT NULL,
  source text,
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_market_prices_commodity_asof ON market_prices (commodity_id, as_of DESC);

CREATE TABLE IF NOT EXISTS raw_erp_data (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  record_type text NOT NULL,
  payload jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_raw_erp_data_company_type ON raw_erp_data (company_id, record_type);

CREATE TABLE IF NOT EXISTS exposures (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  commodity_id text NOT NULL,
  exposure_amount numeric(18,6) NOT NULL,
  currency text NOT NULL,
  as_of timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exposures_company_asof ON exposures (company_id, as_of DESC);

CREATE TABLE IF NOT EXISTS trades (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  commodity_id text NOT NULL,
  side text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  price numeric(18,6),
  currency text NOT NULL DEFAULT 'USD',
  status text NOT NULL,
  provider text NOT NULL DEFAULT 'sim',
  external_ref text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_company_date ON trades (company_id, placed_at DESC);

CREATE TABLE IF NOT EXISTS positions (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  commodity_id text NOT NULL,
  quantity numeric(18,6) NOT NULL,
  avg_price numeric(18,6),
  currency text NOT NULL DEFAULT 'USD',
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, commodity_id)
);
