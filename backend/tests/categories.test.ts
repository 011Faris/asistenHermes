import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test hasil audit 42703: modul categories wajib sesuai
 * struktur aktual (id, name, category_type, description, created_at) —
 * tanpa is_active, tanpa kolom "type", tanpa updated_at.
 * Seluruh Supabase di-mock; tidak menyentuh database.
 */

type Call = [table: string, op: string, args: unknown[]];

const state = vi.hoisted(() => ({
  calls: [] as Call[],
  single: { data: null as unknown, error: null as unknown } as { data: unknown; error: unknown },
  list: { data: [] as unknown[], error: null as unknown, count: 0 } as {
    data: unknown[];
    error: unknown;
    count: number;
  },
}));

function makeQb(table: string): Record<string, unknown> {
  const qb: Record<string, unknown> = {
    select: (...args: unknown[]) => {
      state.calls.push([table, 'select', args]);
      return qb;
    },
    eq: (col: string, val: unknown) => {
      state.calls.push([table, 'eq', [col, val]]);
      return qb;
    },
    order: (...args: unknown[]) => {
      state.calls.push([table, 'order', args]);
      return qb;
    },
    limit: (n: number) => {
      state.calls.push([table, 'limit', [n]]);
      return qb;
    },
    insert: (payload: unknown) => {
      state.calls.push([table, 'insert', [payload]]);
      return qb;
    },
    update: (payload: unknown) => {
      state.calls.push([table, 'update', [payload]]);
      return qb;
    },
    delete: () => {
      state.calls.push([table, 'delete', []]);
      return qb;
    },
    maybeSingle: () => {
      state.calls.push([table, 'maybeSingle', []]);
      return Promise.resolve(state.single);
    },
    single: () => {
      state.calls.push([table, 'single', []]);
      return Promise.resolve(state.single);
    },
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(state.list).then(resolve),
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
import { AppError } from '../src/utils/errors.js';

const headers = { 'x-api-key': 'test-api-key' };
const UUID = '00000000-0000-0000-0000-000000000001';

function eqCalls(table: string): Array<[string, unknown]> {
  return state.calls
    .filter(([t, op]) => t === table && op === 'eq')
    .map(([, , args]) => args as [string, unknown]);
}

describe('categories selaras skema aktual', () => {
  beforeEach(() => {
    state.calls = [];
    state.single = {
      data: { id: UUID, name: 'Makan', category_type: 'expense', description: null, created_at: '2026-01-01T00:00:00Z' },
      error: null,
    };
    state.list = {
      data: [{ id: UUID, name: 'Makan', category_type: 'expense', description: null, created_at: '2026-01-01T00:00:00Z' }],
      error: null,
      count: 1,
    };
  });

  it('GET list memfilter kolom category_type dan tidak pernah menyentuh is_active', async () => {
    const res = await request(createApp()).get('/api/categories?category_type=expense').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(eqCalls('categories')).toContainEqual(['category_type', 'expense']);
    expect(JSON.stringify(state.calls)).not.toContain('is_active');
  });

  it('parameter include_inactive yang usang diabaikan tanpa error', async () => {
    const res = await request(createApp()).get('/api/categories?include_inactive=true').set(headers);
    expect(res.status).toBe(200);
    expect(JSON.stringify(state.calls)).not.toContain('is_active');
  });

  it('POST mengabaikan is_active dan menyimpan category_type', async () => {
    const res = await request(createApp())
      .post('/api/categories')
      .set(headers)
      .send({ name: 'Jajan', category_type: 'expense', is_active: false });
    expect(res.status).toBe(201);
    const inserts = state.calls.filter(([t, op]) => t === 'categories' && op === 'insert');
    expect(inserts).toHaveLength(1);
    expect(inserts[0][2][0]).toEqual({ name: 'Jajan', category_type: 'expense' });
  });

  it('POST menolak category_type di luar income|expense', async () => {
    const res = await request(createApp())
      .post('/api/categories')
      .set(headers)
      .send({ name: 'Aneh', category_type: 'transfer' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('PATCH tidak mengirim updated_at maupun is_active', async () => {
    const res = await request(createApp())
      .patch(`/api/categories/${UUID}`)
      .set(headers)
      .send({ name: 'Makan Siang' });
    expect(res.status).toBe(200);
    const updates = state.calls.filter(([t, op]) => t === 'categories' && op === 'update');
    expect(updates).toHaveLength(1);
    expect(updates[0][2][0]).toEqual({ name: 'Makan Siang' });
  });

  it('assertCategoryType memakai category_type dan menolak tipe salah', async () => {
    const { assertCategoryType } = await import('../src/modules/categories/categories.service.js');
    const db = { from: (t: string) => makeQb(t) } as never;
    await expect(assertCategoryType(db, UUID, 'expense')).resolves.toMatchObject({ category_type: 'expense' });
    try {
      await assertCategoryType(db, UUID, 'income');
      expect.unreachable('seharusnya melempar BAD_REQUEST');
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('BAD_REQUEST');
    }
  });
});
