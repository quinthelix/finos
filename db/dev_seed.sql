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

-- Example market data (sugar price)
INSERT INTO market_prices (commodity_id, price, currency, unit, source, as_of)
VALUES ('sugar', 19.450000, 'USD', 'lb', 'seed', now())
ON CONFLICT DO NOTHING;

-- Commodities reference (for structured ERP POs and future market mapping)
INSERT INTO commodities (id, name, unit)
VALUES
  ('sugar', 'Sugar', 'lb'),
  ('flour', 'Flour', 'lb'),
  ('butter', 'Butter', 'lb'),
  ('eggs', 'Eggs', 'dozen'),
  ('vanilla', 'Vanilla Extract', 'oz'),
  ('baking_soda', 'Baking Soda', 'lb'),
  ('salt', 'Salt', 'lb'),
  ('chocolate', 'Chocolate Chips', 'lb'),
  ('milk', 'Milk', 'gal'),
  ('yeast', 'Yeast', 'oz'),
  ('oil', 'Vegetable Oil', 'gal'),
  ('oats', 'Oats', 'lb')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, unit = EXCLUDED.unit;

-- Initial inventory (weekly readout snapshot) for demo visibility.
-- Uses the current week boundary so reruns are idempotent within the same week.
INSERT INTO erp_inventory_snapshots (company_id, commodity_id, on_hand, unit, as_of)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'sugar',       42000.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'flour',       38000.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'butter',       9000.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'eggs',         1800.000000, 'dozen', date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'vanilla',       650.000000, 'oz',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'baking_soda',   4200.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'salt',         5200.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'chocolate',     7200.000000, 'lb',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'milk',          1200.000000, 'gal',   date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'yeast',          420.000000, 'oz',    date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'oil',            980.000000, 'gal',   date_trunc('week', now())),
  ('00000000-0000-0000-0000-000000000001', 'oats',         11000.000000, 'lb',    date_trunc('week', now()))
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

-- Initial inventory snapshot seed (baseline for demo)
-- The ERP sim/extractor will backfill richer history; this ensures the table isn't empty.
INSERT INTO erp_inventory_snapshots (company_id, commodity_id, on_hand, unit, as_of)
VALUES
  ('00000000-0000-0000-0000-000000000001', 'sugar', 8000.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'flour', 12000.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'butter', 2500.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'eggs', 1500.000000, 'dozen', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'vanilla', 400.000000, 'oz', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'baking_soda', 900.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'salt', 1200.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'chocolate', 3200.000000, 'lb', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'milk', 700.000000, 'gal', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'yeast', 250.000000, 'oz', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'oil', 500.000000, 'gal', now() - interval '7 days'),
  ('00000000-0000-0000-0000-000000000001', 'oats', 6000.000000, 'lb', now() - interval '7 days')
ON CONFLICT (company_id, commodity_id, as_of) DO NOTHING;
