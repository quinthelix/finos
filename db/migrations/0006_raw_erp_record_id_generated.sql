-- Ensures raw_erp_data.erp_record_id is a GENERATED column.
-- Some early DBs may have created it as a plain text NOT NULL column, which breaks
-- inserts that only supply (company_id, record_type, payload) while using ON CONFLICT
-- on (company_id, record_type, erp_record_id).
--
-- This migration is idempotent and safe: it drops and recreates erp_record_id if it
-- exists but is not generated (value is derivable from payload->>'id').

DO $$
DECLARE
  gen_status text;
BEGIN
  SELECT is_generated
  INTO gen_status
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'raw_erp_data'
    AND column_name = 'erp_record_id';

  -- If the column doesn't exist, nothing to do here (handled by 0001/0004).
  IF gen_status IS NULL THEN
    RETURN;
  END IF;

  -- If it's already generated, we're good.
  IF gen_status <> 'NEVER' THEN
    RETURN;
  END IF;

  -- Drop constraint if it depends on the column.
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_raw_erp_po_id') THEN
    ALTER TABLE raw_erp_data DROP CONSTRAINT uq_raw_erp_po_id;
  END IF;

  -- Replace the plain column with a GENERATED column.
  ALTER TABLE raw_erp_data DROP COLUMN erp_record_id;
  ALTER TABLE raw_erp_data
    ADD COLUMN erp_record_id text GENERATED ALWAYS AS ((payload->>'id')) STORED;

  -- Recreate the unique constraint if missing.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_raw_erp_po_id') THEN
    ALTER TABLE raw_erp_data
      ADD CONSTRAINT uq_raw_erp_po_id UNIQUE (company_id, record_type, erp_record_id);
  END IF;
END
$$;


