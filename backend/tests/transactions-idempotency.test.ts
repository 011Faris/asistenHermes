import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test idempotensi tulis transaksi:
 * - header Idempotency-Key wajib (UUID) untuk POST income/expense/transfer
 * - backend menghitung SHA-256 sendiri atas payload ternormalisasi
 * - RPC idempotent dipanggil dengan p_idempotency_key + p_request_hash
 * - konflik kunci (23505 + idempotency) -> 409, DB error lain -> 502
 * Seluruh Supabase di-mock; tidak menyentuh database.
 */

type Call = [table: string, op: string, args: unknown[]];

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  singles: {} as Record<string, { data: unknown; error: unknown }>,
  rpcImpl: vi.fn(),
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
  qb.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
  return qb;
}

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => ({
    from: (table: string) => makeQb(table),
    rpc: (...args: unknown[]) => state.rpcImpl(...args),
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
const WALLET = '00000000-0000-0000-0000-000000000001';
const CATEGORY = '00000000-0000-0000-0000-000000000002';
const WALLET2 = '00000000-0000-0000-0000-000000000003';
const KEY1 = '11111111-2222-4333-8555-666666666666';
const KEY2 = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const HEX64 = /^[0-9a-f]{64}$/;

function rpcParams(): Array<{ name: string; args: Record<string, unknown> }> {
  return state.rpcImpl.mock.calls.map((c: unknown[]) => ({ name: c[0] as string, args: c[1] as Record<string, unknown> }));
}

describe('idempotensi tulis transaksi', () => {
  beforeEach(() => {
    state.calls = [];
    state.singles = {};
    state.rpcImpl.mockReset();
    state.rpcImpl.mockResolvedValue({ data: { id: 'tx-1' }, error: null });
    state.singles.wallets = { data: { id: WALLET, name: 'Tunai', is_active: true }, error: null };
  });

  it('menolak POST income tanpa Idempotency-Key (400)', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'income' }, error: null };
    const res = await request(createApp())
      .post('/api/transactions/income')
      .set(headers)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 25000, description: 'Gaji', transaction_date: '2026-01-02' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(state.rpcImpl).not.toHaveBeenCalled();
  });

  it('menolak Idempotency-Key bukan UUID (400)', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'expense' }, error: null };
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .set('Idempotency-Key', 'bukan-uuid')
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 10000, description: 'Jajan', transaction_date: '2026-01-02' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(state.rpcImpl).not.toHaveBeenCalled();
  });

  it('income memakai RPC idempotent + kunci + hash 64-heks', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'income' }, error: null };
    const res = await request(createApp())
      .post('/api/transactions/income')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 25000, description: 'Gaji', transaction_date: '2026-01-02' });
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ id: 'tx-1' });
    const calls = rpcParams();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('create_simple_transaction_idempotent');
    expect(calls[0].args.p_idempotency_key).toBe(KEY1);
    expect(calls[0].args.p_request_hash).toMatch(HEX64);
    expect(calls[0].args.p_type).toBe('income');
  });

  it('hash konsisten lintas format tanggal dan kapitalisasi UUID', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'income' }, error: null };
    const bodyA = { wallet_id: WALLET, category_id: CATEGORY, amount: 25000, description: 'Gaji', transaction_date: '2026-01-02' };
    const bodyB = {
      wallet_id: WALLET.toUpperCase(),
      category_id: CATEGORY.toUpperCase(),
      amount: 25000,
      description: 'Gaji',
      transaction_date: '2026-01-01T17:00:00Z',
    };
    await request(createApp()).post('/api/transactions/income').set(headers).set('Idempotency-Key', KEY1).send(bodyA);
    await request(createApp()).post('/api/transactions/income').set(headers).set('Idempotency-Key', KEY2).send(bodyB);
    const calls = rpcParams();
    expect(calls).toHaveLength(2);
    expect(calls[0].args.p_idempotency_key).toBe(KEY1);
    expect(calls[1].args.p_idempotency_key).toBe(KEY2);
    expect(calls[1].args.p_request_hash).toBe(calls[0].args.p_request_hash);
  });

  it('transfer memakai RPC transfer idempotent + kedua dompet', async () => {
    const res = await request(createApp())
      .post('/api/transactions/transfer')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({
        source_wallet_id: WALLET,
        destination_wallet_id: WALLET2,
        amount: 50000,
        description: 'Top up',
        transaction_date: '2026-01-02',
      });
    expect(res.status).toBe(201);
    const calls = rpcParams();
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('create_transfer_idempotent');
    expect(calls[0].args.p_source_wallet_id).toBe(WALLET);
    expect(calls[0].args.p_destination_wallet_id).toBe(WALLET2);
    expect(calls[0].args.p_idempotency_key).toBe(KEY1);
    expect(calls[0].args.p_request_hash).toMatch(HEX64);
  });

  it('konflik P0001 dengan pesan persis menjadi 409', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'expense' }, error: null };
    state.rpcImpl.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Idempotency key sudah digunakan untuk permintaan berbeda',
        details: '',
        hint: '',
      },
    });
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 10000, description: 'Jajan', transaction_date: '2026-01-02' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('P0001 dengan pesan lain tetap 502 (tidak semua P0001 adalah konflik)', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'expense' }, error: null };
    state.rpcImpl.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'kegagalan internal lain', details: '', hint: '' },
    });
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 10000, description: 'Jajan', transaction_date: '2026-01-02' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('23505 tanpa pesan konflik spesifik tetap 502 (tidak otomatis 409)', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'expense' }, error: null };
    state.rpcImpl.mockResolvedValue({
      data: null,
      error: {
        code: '23505',
        message: 'duplicate key value violates unique constraint "transactions_pkey"',
        details: 'Key (id)=(1) already exists.',
        hint: '',
      },
    });
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 10000, description: 'Jajan', transaction_date: '2026-01-02' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('replay key dan payload sama mengembalikan transaction ID lama', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'income' }, error: null };
    const body = { wallet_id: WALLET, category_id: CATEGORY, amount: 25000, description: 'Gaji', transaction_date: '2026-01-02' };
    const first = await request(createApp()).post('/api/transactions/income').set(headers).set('Idempotency-Key', KEY1).send(body);
    const second = await request(createApp()).post('/api/transactions/income').set(headers).set('Idempotency-Key', KEY1).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.data).toEqual(first.body.data);
    expect(second.body.data).toEqual({ id: 'tx-1' });
    const calls = rpcParams();
    expect(calls).toHaveLength(2);
    expect(calls[1].args.p_idempotency_key).toBe(calls[0].args.p_idempotency_key);
    expect(calls[1].args.p_request_hash).toBe(calls[0].args.p_request_hash);
  });

  it('error database lain tetap 502', async () => {
    state.singles.categories = { data: { id: CATEGORY, category_type: 'expense' }, error: null };
    state.rpcImpl.mockResolvedValue({ data: null, error: { code: 'XX000', message: 'boom', details: '', hint: '' } });
    const res = await request(createApp())
      .post('/api/transactions/expense')
      .set(headers)
      .set('Idempotency-Key', KEY1)
      .send({ wallet_id: WALLET, category_id: CATEGORY, amount: 10000, description: 'Jajan', transaction_date: '2026-01-02' });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });
});
