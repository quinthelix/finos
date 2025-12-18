-- Adds provider metadata for commodities and a provider registry

CREATE TABLE IF NOT EXISTS price_providers (
  id text PRIMARY KEY,
  display_name text NOT NULL,
  base_url text,
  api_key_env text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE commodities ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE commodities ADD COLUMN IF NOT EXISTS ticker text;
ALTER TABLE commodities ADD COLUMN IF NOT EXISTS provider text;

UPDATE commodities
SET
  display_name = COALESCE(display_name, name),
  ticker = COALESCE(ticker, id),
  provider = COALESCE(provider, 'yahoo')
WHERE display_name IS NULL OR ticker IS NULL OR provider IS NULL;

ALTER TABLE commodities ALTER COLUMN display_name SET NOT NULL;
ALTER TABLE commodities ALTER COLUMN ticker SET NOT NULL;
ALTER TABLE commodities ALTER COLUMN provider SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_commodities_provider ON commodities(provider);
CREATE UNIQUE INDEX IF NOT EXISTS uq_market_prices_unique ON market_prices (commodity_id, as_of, source);
