# GUI (`gui/`)

The GUI is a **React SPA** (TypeScript + Vite) that acts as the user-facing dashboard for the commodity hedging platform.

### Architectural rules

- The GUI must talk **only** to the `api-gateway` over REST/JSON.
- No direct calls to internal services (e.g., `erp-extractor`, `commodity-scraper`) and no direct DB access.

### Running locally

With Docker (recommended for consistency):

```bash
docker compose up -d --build gui
```

Or in dev mode (hot reload):

```bash
cd gui
npm install
npm run dev
```

### Environment variables

- `VITE_API_GATEWAY_URL`: API gateway base URL (default `http://localhost:8080`)
- `VITE_COMPANY_ID`: demo company UUID (Phase 0)

### Key modules and responsibilities

#### API layer

- `src/api.ts`
  - Fetches REST data from `api-gateway`:
    - purchase orders
    - current inventory
    - inventory snapshots (history)
    - market prices (commodity price chart)

#### Domain types and utilities

- `src/domain/types.ts`: shared domain shapes used by `src/api.ts`
- `src/domain/colors.ts`: stable commodity color palette + quality colors
- `src/domain/formatters.ts`: formatting helpers (used where applicable)

Note: `src/types.ts` also exists and is currently used in parts of `src/App.tsx`. Long-term we should consolidate types to `src/domain/types.ts`.

#### Charts and visualization

- `src/components/LineChart.tsx`
  - Renders line and bar series in SVG.
  - Supports:
    - multiple series (overlay mode)
    - dual Y-axis (cost left, inventory right)
    - straight-line segments (no smoothing)
    - hover crosshair with interpolated values
    - `pinnedX` to keep the crosshair pinned when selecting a purchase from the table
    - `xDomain` to force multiple charts to share the same X span

- `src/components/SplitChart.tsx`
  - Composes two `LineChart` instances **plus a right-side panel**:
    - top: purchases (bars) + inventory (dashed)
    - bottom: commodity unit price (line)
    - right: **purchase quality spend pie** (good/fair/bad, weighted by dollars spent)
  - Overlays **dashed connector arrows** from quality-colored price dots to the purchase bar baseline.
  - Price dots are **downsampled to weekly points** to avoid clutter; arrows and quality matching are also done per-week.

- `src/components/QualitySpendPie.tsx`
  - Pure SVG “donut” pie for **purchase quality spend breakdown**.
  - Shows slice % labels (using the same font/color style as chart axis ticks) and omits labels for very small slices to avoid clutter.

#### Application composition

- `src/App.tsx`
  - Implements navigation (Commodities / Positions / Trade).
  - Commodities view:
    - loads orders + inventory + market prices
    - computes purchase “quality” using a rolling median window and a ±10% band (good/fair/bad)
    - computes **quality spend buckets** (good/fair/bad weighted by dollars spent)
    - renders `SplitChart` (including the pie panel) and the purchase table; clicking a row pins the crosshair

### Design diagram (Mermaid)

```mermaid
flowchart TB
  subgraph GUI[gui (React SPA)]
    App[src/App.tsx]
    API[src/api.ts]
    Types[src/domain/types.ts]
    Colors[src/domain/colors.ts]
    LineChart[src/components/LineChart.tsx]
    SplitChart[src/components/SplitChart.tsx]
    Pie[src/components/QualitySpendPie.tsx]
  end

  App -->|fetches| API
  API --> Types
  App --> Colors
  App --> SplitChart
  SplitChart --> LineChart
  SplitChart -->|top panel| LineChart
  SplitChart -->|bottom panel| LineChart
  SplitChart -->|right panel| Pie

  subgraph Gateway[services/api-gateway]
    GW[REST endpoints]
  end

  App -->|REST/JSON| GW

  GW -->|purchase orders| App
  GW -->|inventory snapshots| App
  GW -->|market prices| App
```

### Testing

- Framework: **Vitest**
- Entry: `src/App.test.tsx` (and future unit tests for pure helpers / components)
