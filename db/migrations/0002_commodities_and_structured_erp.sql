-- Adds commodities reference and structured ERP purchase orders

CREATE TABLE IF NOT EXISTS commodities (
  id text PRIMARY KEY,
  name text NOT NULL,
  unit text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS erp_purchase_orders (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  commodity_id text NOT NULL REFERENCES commodities(id),
  quantity numeric(18,6) NOT NULL,
  unit text NOT NULL,
  price_per_unit numeric(18,6) NOT NULL,
  currency text NOT NULL,
  delivery_date timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'confirmed',
  raw_erp_data_id bigint REFERENCES raw_erp_data(id) ON DELETE SET NULL,
  inserted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_company_created ON erp_purchase_orders (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_erp_purchase_orders_commodity ON erp_purchase_orders (commodity_id);
