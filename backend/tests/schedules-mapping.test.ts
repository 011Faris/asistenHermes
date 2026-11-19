import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test hasil audit kolom schedules:
 * - kontrak API memakai `start_time` / `end_time`, kolom DB aktual `start_at` / `end_at`
 * - query (order/filter) wajib memakai `start_at`, insert/update mengirim `start_at`/`end_at`
 * - respons API hanya mengekspos `start_time` / `end_time` (tanpa `start_at`/`end_at`)
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
  qb.insert = rec('insert');
  qb.update = rec('update');
  qb.delete = rec('delete');
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
const START_AT = '2026-11-20T02:00:00.000Z';

function callArgs(table: string, op: string): unknown[][] {
  return state.calls.filter(([t, o]) => t === table && o === op).map(([, , args]) => args);
}

function dbCallText(): string {
  // Hanya panggilan query-builder (order/filter/insert/update) — sebelum translasi respons.
  return JSON.stringify(state.calls);
}

describe('pemetaan schedules start_time/end_time <-> start_at/end_at', () => {
  beforeEach(() => {
    state.calls = [];
    state.lists = {};
    state.singles = {};
  });

  it('list memakai start_at pada order dan filter tanggal', async () => {
    state.lists.schedules = [
      {
        data: [
          { id: UUID, title: 'Rapat', start_at: START_AT, end_at: null, status: 'scheduled', priority: 'normal' },
        ],
        error: null,
      },
    ];
    const res = await request(createApp()).get('/api/schedules?date=2026-11-20').set(headers);
    expect(res.status).toBe(200);
    expect(callArgs('schedules', 'order')).toContainEqual(['start_at', { ascending: true }]);
    for (const [col] of callArgs('schedules', 'gte')) expect(col).toBe('start_at');
    for (const [col] of callArgs('schedules', 'lt')) expect(col).toBe('start_at');
    expect(dbCallText()).not.toContain('start_time');
    expect(dbCallText()).not.toContain('end_time');
    expect(res.body.data[0].start_time).toBe(START_AT);
    expect(res.body.data[0].end_time).toBeNull();
    expect(res.body.data[0]).not.toHaveProperty('start_at');
    expect(res.body.data[0]).not.toHaveProperty('end_at');
  });

  it('detail menerjemahkan start_at menjadi start_time', async () => {
    state.singles.schedules = {
      data: { id: UUID, title: 'Rapat', start_at: START_AT, end_at: null, status: 'scheduled' },
      error: null,
    };
    const res = await request(createApp()).get(`/api/schedules/${UUID}`).set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.start_time).toBe(START_AT);
    expect(res.body.data.end_time).toBeNull();
    expect(res.body.data).not.toHaveProperty('start_at');
    expect(res.body.data).not.toHaveProperty('end_at');
  });

  it('create mengirim start_at ke DB dan mengembalikan start_time', async () => {
    state.singles.schedules = {
      data: { id: UUID, title: 'Rapat', start_at: START_AT, end_at: null, status: 'scheduled' },
      error: null,
    };
    const res = await request(createApp())
      .post('/api/schedules')
      .set(headers)
      .send({ title: 'Rapat', start_time: START_AT });
    expect(res.status).toBe(201);
    const inserts = callArgs('schedules', 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0][0]).toMatchObject({ title: 'Rapat', start_at: START_AT, status: 'scheduled' });
    expect(inserts[0][0]).not.toHaveProperty('start_time');
    expect(dbCallText()).not.toContain('start_time');
    expect(res.body.data.start_time).toBe(START_AT);
    expect(res.body.data).not.toHaveProperty('start_at');
  });

  it('update menerjemahkan start_time menjadi start_at', async () => {
    state.singles.schedules = {
      data: { id: UUID, title: 'Rapat', start_at: START_AT, end_at: null, status: 'scheduled' },
      error: null,
    };
    const res = await request(createApp())
      .patch(`/api/schedules/${UUID}`)
      .set(headers)
      .send({ start_time: '2026-11-21T02:00:00.000Z' });
    expect(res.status).toBe(200);
    const updates = callArgs('schedules', 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0][0]).toMatchObject({ start_at: '2026-11-21T02:00:00.000Z' });
    expect(updates[0][0]).not.toHaveProperty('start_time');
    expect(res.body.data.start_time).toBe(START_AT);
  });

  it('dashboard memakai start_at dan memetakan respons jadwal', async () => {
    state.lists.wallets = [{ data: [{ id: UUID, name: 'Tunai', is_active: true }], error: null }];
    state.lists.wallet_balances = [{ data: [{ id: UUID, current_balance: 0 }], error: null }];
    state.lists.transactions = [
      { data: [], error: null, count: 0 },
      { data: [], error: null },
    ];
    state.lists.transaction_entries = [{ data: [], error: null }];
    state.lists.schedules = [
      { data: [{ id: UUID, title: 'Rapat', start_at: START_AT, end_at: null, status: 'scheduled' }], error: null },
      { data: [], error: null },
    ];
    const res = await request(createApp()).get('/api/dashboard/summary').set(headers);
    expect(res.status).toBe(200);
    for (const [col] of callArgs('schedules', 'gte')) expect(col).toBe('start_at');
    for (const [col] of callArgs('schedules', 'lt')) expect(col).toBe('start_at');
    expect(callArgs('schedules', 'order')).toContainEqual(['start_at', { ascending: true }]);
    expect(dbCallText()).not.toContain('start_time');
    expect(res.body.data.schedules.today[0].start_time).toBe(START_AT);
    expect(res.body.data.schedules.today[0]).not.toHaveProperty('start_at');
  });
});
