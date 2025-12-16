-- Adds structured ERP inventory snapshots (weekly readouts)

CREATE TABLE IF NOT EXISTS erp_inventory_snapshots (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  commodity_id text NOT NULL REFERENCES commodities(id),
  on_hand numeric(18,6) NOT NULL,
  unit text NOT NULL,
  as_of timestamptz NOT NULL,
  raw_erp_data_id bigint REFERENCES raw_erp_data(id) ON DELETE SET NULL,
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, commodity_id, as_of)
);

CREATE INDEX IF NOT EXISTS idx_erp_inventory_company_asof
  ON erp_inventory_snapshots (company_id, as_of DESC);


