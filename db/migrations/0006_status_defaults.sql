-- Normalize purchase order statuses and set a sensible default

ALTER TABLE erp_purchase_orders
  ALTER COLUMN status SET DEFAULT 'in_approval';

UPDATE erp_purchase_orders
SET status = 'executed'
WHERE status = 'confirmed';

UPDATE erp_purchase_orders
SET status = 'in_approval'
WHERE status = 'draft';


