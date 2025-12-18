import { SERIES_COLORS } from '../components/LineChart';

const FORBIDDEN_COLORS = new Set(['#ef4444', '#00d4aa', '#ffffff', '#10b981', '#84cc16']);

// Preferred palette for known commodities; ensures stable colors across app (and avoids forbidden colors)
const COMMODITY_COLORS: Record<string, string> = {
  sugar: '#ec4899',
  wheat: '#8b5cf6',
  cocoa: '#0ea5e9',
  butter: '#f59e0b',
  milk: '#60a5fa',
  soybean_oil: '#fb923c',
  oats: '#d97706',
  corn: '#6366f1',
  coffee: '#a855f7',
  cotton: '#38bdf8',
  orange_juice: '#eab308',
  lumber: '#fb7185',
};

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

  ids.forEach((id) => {
    const key = id.toLowerCase();
    let color: string | undefined = COMMODITY_COLORS[key];
    if (color && (used.has(color) || FORBIDDEN_COLORS.has(color.toLowerCase()))) {
      color = undefined;
    }
    if (!color) {
      const paletteColor = SERIES_COLORS.find(
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
