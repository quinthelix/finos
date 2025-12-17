-- Add generated erp_record_id column and unique constraint (idempotent)

DO $$
BEGIN
  -- Add generated column for ERP record id to support ON CONFLICT
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'raw_erp_data'
      AND column_name = 'erp_record_id'
  ) THEN
    ALTER TABLE raw_erp_data
      ADD COLUMN erp_record_id text GENERATED ALWAYS AS ((payload->>'id')) STORED;
  END IF;

  -- Unique constraint on company + record_type + erp_record_id
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'uq_raw_erp_po_id'
  ) THEN
    ALTER TABLE raw_erp_data
      ADD CONSTRAINT uq_raw_erp_po_id UNIQUE (company_id, record_type, erp_record_id);
  END IF;
END
$$;
