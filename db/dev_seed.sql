-- Idempotent seed data for local development
-- Safe to re-run after resetting the database

-- Demo company and user
INSERT INTO companies (id, name)
VALUES ('00000000-0000-0000-0000-000000000001', 'Ugibisco Cookies (Dallas, TX)')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

INSERT INTO users (id, email, full_name, password_hash)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  'bert.broder@ugibisco.com',
  'Bert Broder',
  crypt('ugibisco-demo', gen_salt('bf'))
)
ON CONFLICT (email) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  password_hash = EXCLUDED.password_hash;

INSERT INTO company_users (company_id, user_id, role)
VALUES ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000a1', 'admin')
ON CONFLICT (company_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- Price providers (registry; yahoo is keyless)
INSERT INTO price_providers (id, display_name, base_url, api_key_env, notes)
VALUES
  ('yahoo', 'Yahoo Finance', 'https://query1.finance.yahoo.com', NULL, 'Public endpoints for historical and daily prices')
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  base_url = EXCLUDED.base_url,
  api_key_env = EXCLUDED.api_key_env,
  notes = EXCLUDED.notes;

-- Commodities reference (only traded instruments we can fetch)
INSERT INTO commodities (id, name, display_name, unit, ticker, provider, emoji)
VALUES
  ('sugar', 'Sugar', 'Sugar #11', 'lb', 'SB=F', 'yahoo', '🍬'),
  ('wheat', 'Wheat', 'CBOT Wheat', 'bu', 'ZW=F', 'yahoo', '🌾'),
  ('cocoa', 'Cocoa', 'ICE Cocoa', 'mt', 'CC=F', 'yahoo', '🍫'),
  ('butter', 'Butter', 'CME Butter', 'lb', 'CB=F', 'yahoo', '🧈'),
  ('milk', 'Milk', 'Class III Milk', 'cwt', 'DA=F', 'yahoo', '🥛'),
  ('soybean_oil', 'Soybean Oil', 'Soybean Oil', 'lb', 'ZL=F', 'yahoo', '🫒'),
  ('oats', 'Oats', 'CBOT Oats', 'bu', 'ZO=F', 'yahoo', '🥣'),
  ('corn', 'Corn', 'CBOT Corn', 'bu', 'ZC=F', 'yahoo', '🌽'),
  ('coffee', 'Coffee', 'ICE Coffee', 'lb', 'KC=F', 'yahoo', '☕'),
  ('cotton', 'Cotton', 'ICE Cotton', 'lb', 'CT=F', 'yahoo', '🧵')
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    display_name = EXCLUDED.display_name,
    unit = EXCLUDED.unit,
    ticker = EXCLUDED.ticker,
    provider = EXCLUDED.provider,
    emoji = EXCLUDED.emoji;

-- Example market data (seeded daily prices) so the GUI always has a visible price line,
-- even before the commodity-scraper finishes fetching external history.
-- Deterministic synthetic curve (no randomness) to keep reruns stable.
WITH bases AS (
  SELECT *
  FROM (VALUES
    ('sugar'::text,        0.45::numeric, 'USD'::text),
    ('wheat'::text,        6.50::numeric, 'USD'::text),
    ('cocoa'::text,     4200.00::numeric, 'USD'::text),
    ('butter'::text,       2.80::numeric, 'USD'::text),
    ('milk'::text,        17.50::numeric, 'USD'::text),
    ('soybean_oil'::text,  0.60::numeric, 'USD'::text),
    ('oats'::text,         3.90::numeric, 'USD'::text),
    ('corn'::text,         4.80::numeric, 'USD'::text),
    ('coffee'::text,       1.40::numeric, 'USD'::text),
    ('cotton'::text,       0.80::numeric, 'USD'::text)
  ) AS t(commodity_id, base_price, currency)
),
days AS (
  SELECT generate_series(0, 365) AS d
),
series AS (
  SELECT
    b.commodity_id,
    -- Smooth-ish deterministic variation around base price.
    (b.base_price * (1
      + 0.06 * sin(d.d / 11.0)
      + 0.03 * cos(d.d / 23.0)
      + 0.02 * sin(d.d / 5.0)
    ))::numeric(18,6) AS price,
    b.currency,
    c.unit,
    'seed'::text AS source,
    (date_trunc('day', now()) - (d.d || ' days')::interval)::timestamptz AS as_of
  FROM bases b
  JOIN commodities c ON c.id = b.commodity_id
  JOIN days d ON true
)
INSERT INTO market_prices (commodity_id, price, currency, unit, source, as_of)
SELECT commodity_id, price, currency, unit, source, as_of
FROM series
ON CONFLICT (commodity_id, as_of, source) DO UPDATE
SET price = EXCLUDED.price,
    currency = EXCLUDED.currency,
    unit = EXCLUDED.unit;

-- Initial inventory (weekly readout snapshot) for demo visibility.
-- Uses the current week boundary so reruns are idempotent within the same week.
INSERT INTO erp_inventory_snapshots (company_id, commodity_id, on_hand, unit, as_of)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'sugar',        42000.000000, 'lb',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'wheat',        32000.000000, 'bu',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'cocoa',         5200.000000, 'mt',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'butter',        9000.000000, 'lb',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'milk',          1200.000000, 'cwt',         date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'soybean_oil',   5200.000000, 'lb',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'oats',         11000.000000, 'bu',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'corn',         16000.000000, 'bu',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'coffee',        2600.000000, 'lb',          date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'cotton',        3100.000000, 'lb',          date_trunc('week', now()))
ON CONFLICT (company_id, commodity_id, as_of) DO UPDATE
SET on_hand = EXCLUDED.on_hand,
    unit = EXCLUDED.unit;

-- Example exposure stub
INSERT INTO exposures (company_id, commodity_id, exposure_amount, currency, as_of)
VALUES ('00000000-0000-0000-0000-000000000001', 'sugar', 5000.000000, 'USD', now())
ON CONFLICT DO NOTHING;

-- Example trade/position for visibility
INSERT INTO trades (company_id, commodity_id, side, quantity, price, currency, status, provider, external_ref)
VALUES ('00000000-0000-0000-0000-000000000001', 'sugar', 'buy', 100.000000, 19.450000, 'USD', 'filled', 'sim', 'seed-order-1')
ON CONFLICT DO NOTHING;

INSERT INTO positions (company_id, commodity_id, quantity, avg_price, currency)
VALUES ('00000000-0000-0000-0000-000000000001', 'sugar', 100.000000, 19.450000, 'USD')
ON CONFLICT (company_id, commodity_id) DO NOTHING;
