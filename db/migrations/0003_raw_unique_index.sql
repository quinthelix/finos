-- Unique index on raw purchase_order IDs for dedupe

CREATE UNIQUE INDEX IF NOT EXISTS uq_raw_erp_po_id_idx
ON raw_erp_data (company_id, record_type, (payload->>'id'))
WHERE record_type = 'purchase_order';
