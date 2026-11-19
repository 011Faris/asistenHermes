import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  selectImpl: vi.fn(),
}));

vi.mock('../src/config/supabase.js', () => ({
  getSupabase: () => ({
    from: () => ({
      select: (...args: unknown[]) => mocks.selectImpl(...args),
    }),
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

const API_KEY = 'test-api-key';

function mockHealthUp() {
  mocks.selectImpl.mockResolvedValue({ data: null, error: null });
}

function mockHealthDown() {
  mocks.selectImpl.mockResolvedValue({ data: null, error: { message: 'db down' } });
}

describe('health', () => {
  beforeEach(() => {
    mocks.selectImpl.mockReset();
  });

  it('GET /api/health tanpa API key tetap bisa diakses', async () => {
    mockHealthUp();
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.supabase).toBe('up');
    expect(res.body.data).not.toHaveProperty('apiKey');
  });

  it('GET /api/health melaporkan 503 saat Supabase down', async () => {
    mockHealthDown();
    const res = await request(createApp()).get('/api/health');
    expect(res.status).toBe(503);
    expect(res.body.data.supabase).toBe('down');
  });

  it('endpoint proteksi menolak tanpa API key', async () => {
    const res = await request(createApp()).get('/api/wallets');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('endpoint proteksi menolak API key salah', async () => {
    mockHealthUp();
    const res = await request(createApp()).get('/api/wallets').set('x-api-key', 'salah');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('tidak pernah mengembalikan API key dalam response', async () => {
    mockHealthUp();
    const res = await request(createApp()).get('/api/health').set('x-api-key', API_KEY);
    expect(JSON.stringify(res.body)).not.toContain('test-api-key');
  });
});
