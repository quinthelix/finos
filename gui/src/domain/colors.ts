const FORBIDDEN_COLORS = new Set(['#ef4444', '#00d4aa', '#ffffff', '#10b981', '#84cc16']);

// GUI-only palette: stable, non-semantic colors (30 entries) assigned dynamically to commodities.
// Avoids "quality colors" (red/white/green) by design.
export const COMMODITY_PALETTE: string[] = [
  '#3b82f6', // blue
  '#a855f7', // purple
  '#0ea5e9', // sky
  '#f97316', // orange
  '#eab308', // amber
  '#ec4899', // pink
  '#14b8a6', // teal
  '#6366f1', // indigo
  '#f59e0b', // orange/amber
  '#38bdf8', // light blue
  '#d946ef', // fuchsia
  '#f43f5e', // rose
  '#06b6d4', // cyan
  '#8b5cf6', // violet
  '#fb7185', // rose light
  '#22c55e', // green (not the same as quality green)
  '#84cc16', // lime (note: forbidden list includes #84cc16; will be skipped)
  '#c026d3', // fuchsia deep
  '#9333ea', // purple deep
  '#2563eb', // blue deep
  '#0891b2', // cyan deep
  '#0d9488', // teal deep
  '#b45309', // amber/brown
  '#ea580c', // orange deep
  '#be185d', // pink deep
  '#7c3aed', // violet deep
  '#4f46e5', // indigo deep
  '#0284c7', // sky deep
  '#db2777', // pink medium
  '#1d4ed8', // blue darker
].filter((c) => !FORBIDDEN_COLORS.has(c.toLowerCase()));

function hashColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  let hue = Math.abs(hash) % 360;
  let color = `hsl(${hue}, 65%, 55%)`;
  let attempts = 0;
  while (FORBIDDEN_COLORS.has(color.toLowerCase()) && attempts < 5) {
    hue = (hue + 37) % 360;
    color = `hsl(${hue}, 65%, 55%)`;
    attempts++;
  }
  return color;
}

export function buildCommodityColorMap(ids: string[]): Map<string, string> {
  const colors = new Map<string, string>();
  const used = new Set<string>();

  // Stable assignment: sort IDs so color assignment doesn't depend on fetch order.
  const sorted = [...ids].map((s) => s.toLowerCase()).sort();

  sorted.forEach((key, idx) => {
    let color = COMMODITY_PALETTE[idx % COMMODITY_PALETTE.length];
    if (!color || used.has(color) || FORBIDDEN_COLORS.has(color.toLowerCase())) {
      // Find next unused palette color, else fall back to hash.
      const paletteColor = COMMODITY_PALETTE.find(
        (col) => !used.has(col) && !FORBIDDEN_COLORS.has(col.toLowerCase())
      );
      color = paletteColor || hashColor(key);
    }
    used.add(color);
    colors.set(key, color);
  });

  return colors;
}

export const qualityStroke = {
  overpay: '#ef4444',
  fair: '#ffffff',
  value: '#10b981',
};
