import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test initial_balance dompet:
 * - PATCH meneruskan initial_balance ke Supabase dan mengembalikan nilai terbaru.
 * - Dompet tanpa jurnal boleh diubah; dompet berjurnal ditolak 409.
 * - Field tak dikenal / body kosong ditolak 400 (tanpa menyentuh DB).
 * - Jurnal transaksi tidak pernah ditulis oleh endpoint ini.
 * Seluruh Supabase di-mock; tidak menyentuh database.
 */

type Call = [table: string, op: string, args: unknown[]];

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  singles: {} as Record<string, { data: unknown; error: unknown }>,
  entryCount: 0,
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
    // Dipakai guard head-count: tanpa baris, hanya angka count.
    return Promise.resolve({ data: [], error: null, count: state.entryCount }).then(resolve);
  };
  return qb;
}

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => ({
    from: (table: string) => makeQb(table),
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

function updates(table: string): unknown[][] {
  return state.calls.filter(([t, op]) => t === table && op === 'update').map(([, , args]) => args);
}

function journalWrites(): Call[] {
  return state.calls.filter(
    ([t, op]) => (t === 'transaction_entries' || t === 'transactions') && (op === 'insert' || op === 'update' || op === 'delete'),
  );
}

describe('update initial_balance dompet', () => {
  beforeEach(() => {
    state.calls = [];
    state.singles = {};
    state.entryCount = 0;
  });

  it('mengirim initial_balance ke Supabase dan mengembalikan nilai terbaru', async () => {
    state.singles.wallets = {
      data: { id: UUID, name: 'BRI', wallet_type: 'bank', initial_balance: 1397799, is_active: true },
      error: null,
    };
    const res = await request(createApp())
      .patch(`/api/wallets/${UUID}`)
      .set(headers)
      .send({ initial_balance: 1397799 });
    expect(res.status).toBe(200);
    const ups = updates('wallets');
    expect(ups).toHaveLength(1);
    expect(ups[0][0]).toMatchObject({ initial_balance: 1397799 });
    expect(res.body.data.initial_balance).toBe(1397799);
    expect(journalWrites()).toHaveLength(0);
  });

  it('dompet dengan jurnal ditolak 409 dan update tidak dijalankan', async () => {
    state.singles.wallets = {
      data: { id: UUID, name: 'BRI', wallet_type: 'bank', initial_balance: 0, is_active: true },
      error: null,
    };
    state.entryCount = 3;
    const res = await request(createApp())
      .patch(`/api/wallets/${UUID}`)
      .set(headers)
      .send({ initial_balance: 1397799 });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(updates('wallets')).toHaveLength(0);
    expect(journalWrites()).toHaveLength(0);
  });

  it('field lain tetap dapat diperbarui tanpa menyentuh initial_balance', async () => {
    state.singles.wallets = {
      data: { id: UUID, name: 'BRI Baru', wallet_type: 'bank', initial_balance: 0, is_active: true },
      error: null,
    };
    state.entryCount = 5;
    const res = await request(createApp()).patch(`/api/wallets/${UUID}`).set(headers).send({ name: 'BRI Baru' });
    expect(res.status).toBe(200);
    const ups = updates('wallets');
    expect(ups).toHaveLength(1);
    expect(ups[0][0]).toMatchObject({ name: 'BRI Baru' });
    expect(ups[0][0]).not.toHaveProperty('initial_balance');
  });

  it('field tidak dikenal ditolak 400 tanpa menyentuh database', async () => {
    const res = await request(createApp())
      .patch(`/api/wallets/${UUID}`)
      .set(headers)
      .send({ initial_balance: 1000, foo: 'bar' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(state.calls.filter(([t]) => t === 'wallets' || t === 'transaction_entries')).toHaveLength(0);
  });

  it('body kosong ditolak 400', async () => {
    const res = await request(createApp()).patch(`/api/wallets/${UUID}`).set(headers).send({});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
