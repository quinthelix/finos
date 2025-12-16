# GUI Agents Guide (`gui/agents.md`)

> **Purpose:** This document describes the frontend application for the commodity hedging platform. It complements the root `agents.md` and must not contradict it.

---

## 1. Overview

The `gui` is a **React Single Page Application (SPA)** that provides the user-facing interface for the platform. It enables users to view their company's commodity purchases, exposures, positions, and execute trades.

### 1.1 Current State

- The database is populated with purchase data from a specific company.
- This document will be updated incrementally as the GUI evolves.

### 1.2 Communication

- The `gui` communicates **only** with the `api-gateway` via REST/JSON.
- The `gui` must **never** call other services directly (e.g., `erp-sim`, `erp-extractor`, `trade-gateway`).

---

## 2. Technology Stack

As defined in the root `agents.md` (section 3.2):

| Concern       | Technology     |
| ------------- | -------------- |
| Language      | TypeScript     |
| Framework     | React          |
| Bundler       | Vite           |
| Testing       | Vitest         |
| Logging       | console + loglevel |

---

## 3. Application Structure

### 3.1 Navigation

The application has a **left-hand navigation bar** with the following items (each with an icon):

| Nav Item      | Description                          | Status       |
| ------------- | ------------------------------------ | ------------ |
| Commodities   | View purchased commodities and costs | In Progress  |
| Positions     | View current hedging positions       | Planned      |
| Trade         | Execute new trades                   | Planned      |

---

## 4. Views

### 4.1 Commodities View (In Progress)

#### 4.1.1 Commodity List

When the user clicks **Commodities** in the navigation:

- Display a list of all commodities the company has ever purchased.
- Data source: `api-gateway` endpoint (e.g., `GET /api/company/{id}/commodities`).

#### 4.1.2 Commodity Detail Chart

When the user clicks on a specific commodity from the list:

- Display a **line chart** showing **date (x-axis) vs. expense (y-axis)** for that commodity over time.
- The chart must include **duration presets** for the x-axis:
  - 1 month
  - 3 months
  - 6 months
  - 1 year
  - All time
- The y-axis (cost range) must **auto-fit** to the displayed values.

### 4.2 Positions View (Planned)

- Display current hedging positions for the company.
- Data source: `api-gateway` endpoint (e.g., `GET /api/company/{id}/positions`).

### 4.3 Trade View (Planned)

- Allow users to initiate new trades.
- Data source: `api-gateway` endpoint (e.g., `POST /api/trades`).

---

## 5. Environment Variables

| Variable              | Description                        | Example                      |
| --------------------- | ---------------------------------- | ---------------------------- |
| `VITE_API_GATEWAY_URL`| Base URL for the api-gateway       | `http://localhost:8080`      |
| `VITE_COMPANY_ID`     | Default company ID (Phase 0 only)  | `DEMO_CO` or UUID            |

---

## 6. Rules for AI Coding Agents

When modifying this frontend:

1. **Follow the root `agents.md`** - this file must not contradict global rules.
2. **Use TypeScript strict mode** - no `any` types unless absolutely necessary.
3. **Communicate only via `api-gateway`** - never call backend services directly.
4. **Use Vitest for tests** - write unit tests for components and utilities.
5. **Log using loglevel** - avoid `console.log` in production code; use loglevel.
6. **Keep multi-tenancy in mind** - always pass `company_id` in API requests.
7. **Implement features incrementally** - complete one view before starting the next.
