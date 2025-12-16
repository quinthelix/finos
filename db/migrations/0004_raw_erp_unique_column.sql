-- Add generated erp_record_id column and unique constraint

ALTER TABLE raw_erp_data
ADD COLUMN IF NOT EXISTS erp_record_id text GENERATED ALWAYS AS ((payload->>'id')) STORED;

ALTER TABLE raw_erp_data
ADD CONSTRAINT uq_raw_erp_po_id UNIQUE (company_id, record_type, erp_record_id);
