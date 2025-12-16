#!/usr/bin/env node
/**
 * Lightweight end-to-end smoke test:
 * 1) Pull purchase orders from the ERP simulator.
 * 2) Pull purchase orders from the API gateway (which reads via erp-extractor + DB).
 * 3) Assert ERP orders are present in the gateway response.
 *
 * Usage: node scripts/system-check.js
 * Env: API_GATEWAY (default http://localhost:8080), ERP_SIM (default http://localhost:4001),
 *      COMPANY_ID (default 00000000-0000-0000-0000-000000000001)
 */

const API_GATEWAY = process.env.API_GATEWAY || 'http://localhost:8080';
const ERP_SIM = process.env.ERP_SIM || 'http://localhost:4001';
const COMPANY_ID = process.env.COMPANY_ID || '00000000-0000-0000-0000-000000000001';

async function waitFor(url, label, tries = 20, delayMs = 500) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) {
      // ignore and retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Request failed ${res.status} ${url}: ${body}`);
  }
  return res.json();
}

async function main() {
  console.log('Waiting for services...');
  await waitFor(`${API_GATEWAY}/health`, 'api-gateway');
  await waitFor(`${ERP_SIM}/health`, 'erp-sim');

  console.log('Fetching purchase orders from ERP simulator...');
  const simResp = await fetchJson(`${ERP_SIM}/erp/${COMPANY_ID}/purchase-orders`);
  const simOrders = simResp.data || [];
  if (simOrders.length === 0) {
    throw new Error('Simulator returned no purchase orders');
  }

  // Allow a short delay for extractor to persist new events
  await new Promise((r) => setTimeout(r, 1000));

  console.log('Fetching purchase orders from API gateway (via extractor)...');
  const gwResp = await fetchJson(`${API_GATEWAY}/api/company/${COMPANY_ID}/purchase-orders`);
  const gwOrders = gwResp.data || [];

  const simIds = new Set(simOrders.map((o) => o.id));
  const gwIds = new Set(gwOrders.map((o) => o.id));
  const missing = [...simIds].filter((id) => !gwIds.has(id));

  if (gwOrders.length < simOrders.length) {
    throw new Error(
      `Gateway returned fewer orders than simulator (gw=${gwOrders.length}, sim=${simOrders.length})`
    );
  }
  if (missing.length > 0) {
    throw new Error(`Gateway missing ${missing.length} simulator orders: ${missing.slice(0, 5).join(', ')}`);
  }

  console.log('✅ System check passed');
  console.log(`Simulator orders: ${simOrders.length}, Gateway orders: ${gwOrders.length}`);
}

main().catch((err) => {
  console.error('❌ System check failed:', err.message);
  process.exit(1);
});
