import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression test modul InstaBox (mock fetch global; tanpa jaringan, tanpa DB).
 * - Wake async: 202 + operationId, tanpa polling 55 detik dalam satu request.
 * - Transisional dengan operationId digabung (tanpa start/resume kedua).
 * - Auth lingkup-router: master ATAU UI key untuk InstaBox; UI key ditolak di finansial.
 * - Console publik tanpa secret; API key tidak pernah bocor ke respons.
 */

type Route = { method: string; match: (url: string) => boolean; status: number; body: unknown };
type Call = { method: string; url: string; headers: Record<string, string>; body: unknown };

const calls: Call[] = [];

function setFetch(routes: Route[], rejectWith?: unknown) {
  const mock = vi.fn(async (input: unknown, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    if (rejectWith) throw rejectWith;
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    let parsed: unknown;
    try {
      parsed = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsed = init?.body;
    }
    calls.push({ method, url, headers: init?.headers ?? {}, body: parsed });
    const hit = routes.find((r) => r.method === method && r.match(url));
    const status = hit?.status ?? 404;
    const body =
      hit?.body ??
      { error: { code: 'not_found', message: 'no mock', requestId: 'req_test', retryable: false, operationId: null } };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    };
  });
  vi.stubGlobal('fetch', mock);
}

const isOp = (url: string) => url.includes('/v1/operations/');
const isResume = (url: string) => url.includes('/resume');
const isStart = (url: string) => url.includes('/start') && !url.includes('/restart');
const isSingle = (url: string) => /\/v1\/machines\/m_/.test(url);
const isList = (url: string) => url.includes('/v1/machines');

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => {
    throw new Error('instabox tidak memakai Supabase');
  },
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
    INSTABOX_API_URL: 'https://api.instabox.sh',
    INSTABOX_API_KEY: 'test-instabox-key',
    INSTABOX_MACHINE_NAME: 'asisten',
    INSTABOX_UI_KEY: 'test-ui-key',
  }),
  resetEnvCache: vi.fn(),
}));

import request from 'supertest';
import { createApp } from '../src/app.js';

const headers = { 'x-api-key': 'test-api-key' };
const uiHeaders = { 'x-api-key': 'test-ui-key' };

const machineBase = {
  id: 'm_test00000000000000000001',
  name: 'asisten',
  desiredState: 'running',
  revision: 1,
  operationId: null,
  template: {},
  spec: {},
  storage: {},
  runtime: { ready: true },
  autoSuspendAfterSeconds: null,
  maxRunMinutes: -1,
  runStartedAt: null,
  cooldownUntil: null,
  metadata: {},
  vault: false,
  guestUser: 'dev',
  orgId: 'org_1',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const machine = (state: string, extra: Record<string, unknown> = {}) => ({ ...machineBase, state, ...extra });
const op = (id: string, state: string, extra: Record<string, unknown> = {}) => ({
  id,
  machineId: machineBase.id,
  type: 'resume',
  state,
  error: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...extra,
});

const listRoute = (machines: unknown[]): Route => ({
  method: 'GET',
  match: (url) => isList(url) && !isSingle(url) && !isOp(url),
  status: 200,
  body: { machines, nextCursor: null },
});

const errBody = (code: string) => ({
  error: { code, message: 'x', requestId: 'req_1', retryable: false, operationId: null },
});

function lifecyclePosts(): Call[] {
  return calls.filter((c) => c.method === 'POST' && (isResume(c.url) || isStart(c.url)));
}

function opPolls(): Call[] {
  return calls.filter((c) => c.method === 'GET' && isOp(c.url));
}

describe('instabox', () => {
  beforeEach(() => {
    calls.length = 0;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('tanpa autentikasi tetap ditolak', async () => {
    const res = await request(createApp()).get('/api/instabox/machines');
    expect(res.status).toBe(401);
    const wake = await request(createApp()).post('/api/instabox/wake').send({});
    expect(wake.status).toBe(401);
  });

  it('list machines ringkas tanpa membocorkan API key', async () => {
    setFetch([listRoute([machine('running'), machine('suspended')])]);
    const res = await request(createApp()).get('/api/instabox/machines').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([
      { id: machineBase.id, name: 'asisten', state: 'running', ready: true, operationId: null },
      { id: machineBase.id, name: 'asisten', state: 'suspended', ready: true, operationId: null },
    ]);
    expect(JSON.stringify(res.body)).not.toContain('test-instabox-key');
    expect(JSON.stringify(res.body)).not.toContain('test-ui-key');
  });

  it('kunci UI berlaku di InstaBox tetapi ditolak di finansial', async () => {
    setFetch([listRoute([machine('running')])]);
    const ok = await request(createApp()).get('/api/instabox/machines').set(uiHeaders);
    expect(ok.status).toBe(200);
    const denied = await request(createApp()).get('/api/wallets').set(uiHeaders);
    expect(denied.status).toBe(401);
    expect(denied.body.error.code).toBe('UNAUTHORIZED');
  });

  it('wake saat running: 200 tanpa tindakan', async () => {
    setFetch([listRoute([machine('running')])]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(200);
    expect(res.body.data.action).toBe('none');
    expect(res.body.data.operation).toBeNull();
    expect(lifecyclePosts()).toHaveLength(0);
  });

  it('wake saat suspended: resume + 202 tanpa polling dalam request yang sama', async () => {
    setFetch([
      { method: 'POST', match: isResume, status: 202, body: op('op_1', 'running') },
      { method: 'GET', match: isSingle, status: 200, body: machine('resuming') },
      listRoute([machine('suspended')]),
    ]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(202);
    expect(res.body.data.action).toBe('resume');
    expect(res.body.data.operation).toEqual({ id: 'op_1', state: 'running' });
    expect(opPolls()).toHaveLength(0);
    const posts = lifecyclePosts();
    expect(posts).toHaveLength(1);
    expect(posts[0].headers['Idempotency-Key']).toMatch(/^[ -~]{1,200}$/);
  });

  it('wake saat stopped: start + 202', async () => {
    setFetch([
      { method: 'POST', match: isStart, status: 202, body: { ...op('op_2', 'succeeded'), type: 'start' } },
      { method: 'GET', match: isSingle, status: 200, body: machine('running') },
      listRoute([machine('stopped')]),
    ]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(202);
    expect(res.body.data.action).toBe('start');
    expect(res.body.data.machine.state).toBe('running');
    expect(opPolls()).toHaveLength(0);
  });

  it('wake menolak machine ID dari body', async () => {
    setFetch([]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({ machineId: 'm_x' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calls).toHaveLength(0);
  });

  it('transisional dengan operationId: gabung operasi sama, tanpa start/resume baru', async () => {
    setFetch([listRoute([machine('resuming', { operationId: 'op_9' })])]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(202);
    expect(res.body.data.action).toBe('wait');
    expect(res.body.data.operation).toEqual({ id: 'op_9', state: 'running' });
    expect(lifecyclePosts()).toHaveLength(0);
  });

  it('transisional tanpa operationId: 409', async () => {
    setFetch([listRoute([machine('starting', { operationId: null })])]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(lifecyclePosts()).toHaveLength(0);
  });

  it('state tak dikenal: 502 dengan pesan jelas', async () => {
    setFetch([listRoute([machine('weird')])]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(502);
  });

  it('operasi langsung gagal: 502 dengan kode upstream', async () => {
    setFetch([
      {
        method: 'POST',
        match: isResume,
        status: 202,
        body: op('op_3', 'failed', { error: { code: 'host_unavailable', message: 'x', requestId: 'r', retryable: true, operationId: null } }),
      },
      listRoute([machine('suspended')]),
    ]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).toContain('host_unavailable');
  });

  it('resume 409 tanpa operationId menjadi 409 backend', async () => {
    setFetch([
      {
        method: 'POST',
        match: isResume,
        status: 409,
        body: { error: { code: 'operation_conflict', message: 'busy', requestId: 'r', retryable: false, operationId: null } },
      },
      listRoute([machine('suspended')]),
    ]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('wake saat mesin tidak ditemukan: 502 tanpa bocor key', async () => {
    setFetch([listRoute([{ ...machine('running'), name: 'lain' }])]);
    const res = await request(createApp()).post('/api/instabox/wake').set(headers).send({});
    expect(res.status).toBe(502);
    expect(res.body.message).toContain('asisten');
    expect(JSON.stringify(res.body)).not.toContain('test-instabox-key');
  });

  it('kredensial InstaBox salah: 500 (bukan 401) tanpa bocor key', async () => {
    setFetch([
      {
        method: 'GET',
        match: isList,
        status: 401,
        body: { error: { code: 'invalid_key', message: 'bad key', requestId: 'r1', retryable: false, operationId: null } },
      },
    ]);
    const res = await request(createApp()).get('/api/instabox/machines').set(headers);
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('test-instabox-key');
  });

  it('jaringan putus/timeout: 502', async () => {
    setFetch([], new Error('socket hang up'));
    const res = await request(createApp()).get('/api/instabox/machines').set(headers);
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe('UPSTREAM_ERROR');
  });

  it('status operasi berjalan: done false', async () => {
    setFetch([{ method: 'GET', match: isOp, status: 200, body: op('op_1', 'running') }]);
    const res = await request(createApp()).get('/api/instabox/operations/op_1').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(false);
    expect(res.body.data.operation).toMatchObject({ id: 'op_1', state: 'running' });
    expect(res.body.data.machine).toBeNull();
  });

  it('status operasi succeeded: verifikasi mesin running', async () => {
    setFetch([
      { method: 'GET', match: isOp, status: 200, body: op('op_1', 'succeeded') },
      { method: 'GET', match: isSingle, status: 200, body: machine('running') },
    ]);
    const res = await request(createApp()).get('/api/instabox/operations/op_1').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(true);
    expect(res.body.data.machine.state).toBe('running');
  });

  it('status operasi failed: done true + kode, tetap 200', async () => {
    setFetch([
      {
        method: 'GET',
        match: isOp,
        status: 200,
        body: op('op_3', 'failed', { error: { code: 'host_unavailable', message: 'x', requestId: 'r', retryable: true, operationId: null } }),
      },
    ]);
    const res = await request(createApp()).get('/api/instabox/operations/op_3').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.data.done).toBe(true);
    expect(res.body.data.error).toEqual({ code: 'host_unavailable' });
  });

  it('operation ID tidak valid: 400 tanpa menyentuh upstream', async () => {
    setFetch([]);
    const res = await request(createApp()).get('/api/instabox/operations/..%2F..').set(headers);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(calls).toHaveLength(0);
  });

  it('operasi tidak dikenal upstream: 502', async () => {
    setFetch([
      {
        method: 'GET',
        match: isOp,
        status: 404,
        body: { error: { code: 'not_found', message: 'x', requestId: 'r', retryable: false, operationId: null } },
      },
    ]);
    const res = await request(createApp()).get('/api/instabox/operations/op_lama').set(headers);
    expect(res.status).toBe(502);
  });

  it('console publik tanpa secret; console.js disajikan same-origin', async () => {
    const page = await request(createApp()).get('/api/instabox/console');
    expect(page.status).toBe(200);
    expect(page.text).toContain('Hermes Control');
    expect(page.text).not.toContain('test-instabox-key');
    expect(page.text).not.toContain('test-ui-key');
    expect(page.text).not.toContain('test-api-key');
    const js = await request(createApp()).get('/api/instabox/console.js');
    expect(js.status).toBe(200);
    expect(js.text).toContain('localStorage');
    expect(js.text).not.toContain('test-instabox-key');
    expect(js.text).not.toContain('test-ui-key');
    expect(js.text).not.toContain('test-api-key');
  });
});
