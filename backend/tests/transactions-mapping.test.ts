import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test hasil audit modul transaksi:
 * - kontrak API memakai `type` / `amount`, kolom DB `transaction_type` / `amount_signed`
 * - saldo memakai view wallet_balances via `id` / `current_balance` langsung
 * Seluruh Supabase di-mock; tidak menyentuh database.
 */

type Call = [table: string, op: string, args: unknown[]];

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  lists: {} as Record<string, Array<{ data: unknown; error: unknown; count?: number }>>,
  singles: {} as Record<string, { data: unknown; error: unknown }>,
}));

function makeQb(table: string): Record<string, unknown> {
  const qb: Record<string, unknown> = {};
  const rec = (op: string) => (...args: unknown[]) => {
    state.calls.push([table, op, args]);
    return qb;
  };
  qb.select = rec('select');
  qb.eq = rec('eq');
  qb.in = rec('in');
  qb.gte = rec('gte');
  qb.lte = rec('lte');
  qb.lt = rec('lt');
  qb.ilike = rec('ilike');
  qb.order = rec('order');
  qb.range = rec('range');
  qb.limit = rec('limit');
  qb.maybeSingle = () => {
    state.calls.push([table, 'maybeSingle', []]);
    return Promise.resolve(state.singles[table] ?? { data: null, error: null });
  };
  qb.single = () => {
    state.calls.push([table, 'single', []]);
    return Promise.resolve(state.singles[table] ?? { data: null, error: null });
  };
  qb.then = (resolve: (v: unknown) => unknown) => {
    const q = state.lists[table];
    const r = q && q.length > 0 ? (q.shift() as { data: unknown; error: unknown }) : { data: [], error: null, count: 0 };
    return Promise.resolve(r).then(resolve);
  };
  return qb;
}

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => ({
    from: (table: string) => makeQb(table),
    rpc: vi.fn(() => Promise.resolve({ data: null, error: null })),
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
const UUID = '00000000-0000-0000-0000-000000000001';

function eqCols(table: string): string[] {
  return state.calls.filter(([t, op]) => t === table && op === 'eq').map(([, , args]) => args[0] as string);
}

function selectArgs(table: string): unknown[][] {
  return state.calls.filter(([t, op]) => t === table && op === 'select').map(([, , args]) => args);
}

describe('translasi kontrak API <-> kolom DB aktual', () => {
  beforeEach(() => {
    state.calls = [];
    state.lists = {};
    state.singles = {};
  });

  it('list menerjemahkan ?type= menjadi filter transaction_type dan response memakai type', async () => {
    state.lists.transactions = [
      {
        data: [{ id: UUID, transaction_type: 'income', status: 'confirmed', transaction_date: '2026-11-01T00:00:00Z' }],
        error: null,
        count: 1,
      },
    ];
    const res = await request(createApp()).get('/api/transactions?type=income').set(headers);
    expect(res.status).toBe(200);
    expect(eqCols('transactions')).toContain('transaction_type');
    expect(eqCols('transactions')).not.toContain('type');
    expect(res.body.data.items[0].type).toBe('income');
  });

  it('detail menerjemahkan transaction_type->type dan amount_signed->amount', async () => {
    state.singles.transactions = {
      data: { id: UUID, transaction_type: 'expense', status: 'confirmed', transaction_date: '2026-11-02T00:00:00Z' },
      error: null,
    };
    state.lists.transaction_entries = [
      {
        data: [{ id: 'e1', transaction_id: UUID, wallet_id: UUID, amount_signed: -25000 }],
        error: null,
      },
    ];
    const res = await request(createApp()).get(`/api/transactions/${UUID}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.type).toBe('expense');
    expect(res.body.data.entries[0].amount).toBe(-25000);
  });

  it('dashboard memakai transaction_type dan amount_signed aktual', async () => {
    state.lists.wallets = [{ data: [{ id: UUID, name: 'Tunai', is_active: true }], error: null }];
    state.lists.wallet_balances = [{ data: [{ id: UUID, current_balance: 500000 }], error: null }];
    state.lists.transactions = [
      {
        data: [
          { id: 'tx1', transaction_type: 'income', status: 'confirmed' },
          { id: 'tx2', transaction_type: 'expense', status: 'confirmed' },
        ],
        error: null,
      },
      { data: [{ id: 'tx9', transaction_type: 'transfer', status: 'confirmed' }], error: null },
    ];
    state.lists.transaction_entries = [
      {
        data: [
          { transaction_id: 'tx1', amount_signed: 100000 },
          { transaction_id: 'tx2', amount_signed: -40000 },
        ],
        error: null,
      },
    ];
    state.lists.schedules = [
      { data: [], error: null },
      { data: [], error: null },
    ];
    const res = await request(createApp()).get('/api/dashboard/summary').set(headers);
    expect(res.status).toBe(200);
    expect(JSON.stringify(selectArgs('transactions'))).toContain('transaction_type');
    expect(JSON.stringify(selectArgs('transaction_entries'))).toContain('amount_signed');
    expect(eqCols('transactions')).not.toContain('type');
    expect(res.body.data.month.total_income).toBe(100000);
    expect(res.body.data.month.total_expense).toBe(40000);
    expect(res.body.data.recent_transactions[0].type).toBe('transfer');
  });

  it('saldo dompet query view langsung via id tanpa percobaan wallet_id', async () => {
    state.singles.wallets = { data: { id: UUID, name: 'Tunai', is_active: true }, error: null };
    state.singles.wallet_balances = { data: { id: UUID, current_balance: '150000' }, error: null };
    const res = await request(createApp()).get(`/api/wallets/${UUID}/balance`).set(headers);
    expect(res.status).toBe(200);
    expect(eqCols('wallet_balances')).toEqual(['id']);
    expect(res.body.data.current_balance).toBe(150000);
  });
});
