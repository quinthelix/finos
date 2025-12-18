-- Add emoji metadata to commodities for GUI rendering.
-- Stored in DB so the GUI can discover it (no hardcoded emoji map).

ALTER TABLE commodities
  ADD COLUMN IF NOT EXISTS emoji text;

-- Default to a generic box if missing.
UPDATE commodities
SET emoji = COALESCE(emoji, '📦')
WHERE emoji IS NULL;

ALTER TABLE commodities
  ALTER COLUMN emoji SET NOT NULL;


