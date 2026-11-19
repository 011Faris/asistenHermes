import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  wallets: [
    { id: 'w-tunai', name: 'Tunai', wallet_type: 'cash', is_active: true },
    { id: 'w-bri', name: 'BRI', wallet_type: 'bank', is_active: true },
    { id: 'w-off', name: 'Lama', wallet_type: 'other', is_active: false },
  ] as Array<Record<string, unknown>>,
  balances: [
    { wallet_id: 'w-tunai', balance: 150000 },
    { wallet_id: 'w-bri', balance: 2500000 },
  ],
  categories: [
    { id: 'c-in', name: 'Gaji', type: 'income', is_active: true },
    { id: 'c-out', name: 'Makan', type: 'expense', is_active: true },
  ] as Array<Record<string, unknown>>,
  txUsingCategory: 0,
  rpcImpl: vi.fn(),
}));

function makeQuery(result: { data?: unknown; error?: unknown; count?: number | null }) {
  const q: Record<string, unknown> = {};
  const terminal = () => Promise.resolve({ data: result.data ?? null, error: result.error ?? null, count: result.count ?? null });
  q.select = vi.fn(() => q);
  q.eq = vi.fn(() => q);
  q.in = vi.fn(() => q);
  q.gte = vi.fn(() => q);
  q.lte = vi.fn(() => q);
  q.lt = vi.fn(() => q);
  q.ilike = vi.fn(() => q);
  q.order = vi.fn(() => q);
  q.range = vi.fn(() => terminal());
  q.limit = vi.fn(() => terminal());
  q.maybeSingle = vi.fn(() => terminal());
  q.single = vi.fn(() => terminal());
  (q as { then: unknown }).then = (resolve: (v: unknown) => unknown) => terminal().then(resolve);
  return q;
}

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => ({
    rpc: (...args: unknown[]) => state.rpcImpl(...args),
    from: (table: string) => {
      if (table === 'wallets') return makeQuery({ data: state.wallets });
      if (table === 'wallet_balances') return makeQuery({ data: state.balances });
      if (table === 'categories') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => Promise.resolve({ data: state.categories, error: null }),
            }),
          }),
        };
      }
      return makeQuery({ data: [] });
    },
  }),
  resetSupabaseCache: vi.fn(),
}));

vi.mock('../src/config/env.js', () => ({
  getEnv: () => ({
    NODE_ENV: 'test',
    PORT: 3000,
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-key',
    ASSISTANT_API_KEY: 'test-api-key',
    FRONTEND_URL: 'http://localhost:5173',
    TIMEZONE: 'Asia/Jakarta',
    APP_VERSION: '0.1.0',
  }),
  resetEnvCache: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../src/app.js';

const headers = { 'x-api-key': 'test-api-key' };

describe('aturan bisnis (mock Supabase)', () => {
  beforeEach(() => {
    state.rpcImpl.mockReset();
    state.rpcImpl.mockResolvedValue({ data: { id: 'tx-1' }, error: null });
  });

  it('menolak transfer saat dompet asal dan tujuan sama (tanpa menyentuh DB function)', async () => {
    const res = await request(createApp())
      .post('/api/transactions/transfer')
      .set(headers)
      .send({
        source_wallet_id: '00000000-0000-0000-0000-000000000001',
        destination_wallet_id: '00000000-0000-0000-0000-000000000001',
        amount: 50000,
        description: 'Pindah dana',
        transaction_date: '2026-01-02',
      });
    expect(res.status).toBe(400);
    expect(state.rpcImpl).not.toHaveBeenCalled();
  });

  it('menolak nominal negatif via validasi Zod', async () => {
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .send({
        wallet_id: '00000000-0000-0000-0000-000000000001',
        category_id: '00000000-0000-0000-0000-000000000002',
        amount: -1000,
        description: 'Jajan',
        transaction_date: '2026-01-02',
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
