import { afterAll, beforeAll, describe, expect, it, jest } from '@jest/globals';
import pino from 'pino';
import fetch, { Response } from 'node-fetch';
import http from 'http';
import { AddressInfo } from 'net';
import { createSimServer, PurchaseOrder } from './index.js';

// Simple webhook receiver for testing subscription callbacks (plain http)
async function createWebhookSink(port: number) {
  const received: PurchaseOrder[] = [];
  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 200;
      res.end('ok');
      return;
    }
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as PurchaseOrder;
        received.push(parsed);
      } catch (err) {
        // ignore parse errors in test sink
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ status: 'ok' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(port, resolve));
  const address = server.address() as AddressInfo;
  const actualPort = address.port;

  return { received, port: actualPort, stop: () => server.close() };
}

describe('erp-sim', () => {
  const logger = pino({ level: 'silent' });
  let sim: ReturnType<typeof createSimServer> | null = null;

  beforeAll(async () => {
    jest.setTimeout(10_000);
  });

  afterEach(async () => {
    if (sim) {
      await sim.stop();
      sim = null;
    }
  });

  it('generates purchase orders with expected shape and supports history queries', async () => {
    sim = createSimServer({
      companyId: 'test-co',
      port: 0,
      host: '127.0.0.1',
      disableGenerator: false,
      disableHistory: false,
      tickMs: 200,
      logger,
    });
    const address = await sim.start();
    const baseUrl = typeof address === 'string' ? address : 'http://127.0.0.1:0';

    // Wait for at least one tick to generate data
    await new Promise((r) => setTimeout(r, 400));

    const res = await fetch(`${baseUrl}/erp/test-co/purchase-orders`);
    expect(res.ok).toBe(true);
    const body = (await res.json()) as { data: PurchaseOrder[] };
    expect(body.data.length).toBeGreaterThan(0);
    const po = body.data[0];
    expect(po).toHaveProperty('id');
    expect(po.companyId).toBe('test-co');
    expect(['in_approval', 'executed', 'supplied']).toContain(po.status);
  });

  it('registers webhook subscribers and delivers newly generated POs', async () => {
    const sink = await createWebhookSink(0);
    sim = createSimServer({
      companyId: 'test-co',
      port: 0,
      host: '127.0.0.1',
      disableHistory: true,
      tickMs: 200,
      logger,
    });
    const address = await sim.start();
    const baseUrl = typeof address === 'string' ? address : 'http://127.0.0.1:0';

    // Register subscription
    const subRes = await fetch(`${baseUrl}/erp/test-co/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callbackUrl: `http://127.0.0.1:${sink.port}` }),
    });
    expect(subRes.ok).toBe(true);

    // Wait for a tick to deliver webhook
    const start = Date.now();
    while (Date.now() - start < 2000 && sink.received.length === 0) {
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(sink.received.length).toBeGreaterThan(0);
    const po = sink.received[0];
    expect(po.companyId).toBe('test-co');
    sink.stop();
  });
});
