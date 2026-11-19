import { randomUUID } from 'node:crypto';
import { AppError, Errors } from '../../utils/errors.js';
import { getEnv } from '../../config/env.js';

// Batas keamanan agar function serverless tidak menggantung:
// - tiap request HTTP ke InstaBox dibatasi 30 detik,
// - penantian operation dibatasi total ~55 detik (long-poll wait=25s per docs).
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_LIST_PAGES = 10;

interface InstaboxErrorBody {
  code?: string;
  message?: string;
  retryable?: boolean;
  operationId?: string | null;
  retryAfterSeconds?: number;
}

interface InstaboxMachine {
  id: string;
  name: string;
  state: string;
  operationId?: string | null;
  runtime?: { ready?: boolean } | null;
  [key: string]: unknown;
}

interface InstaboxOperation {
  id: string;
  state: string;
  type?: string | null;
  machineId?: string | null;
  error?: InstaboxErrorBody | null;
  [key: string]: unknown;
}

interface InstaboxConfig {
  baseUrl: string;
  apiKey: string;
  machineName: string;
}

function getInstaboxConfig(): InstaboxConfig {
  const env = getEnv();
  return {
    baseUrl: env.INSTABOX_API_URL,
    apiKey: env.INSTABOX_API_KEY,
    machineName: env.INSTABOX_MACHINE_NAME,
  };
}

/**
 * Terjemahkan error InstaBox ({error:{code,...}}) menjadi error backend.
 * 401/403 berarti kunci/scope milik SERVER yang salah — jangan teruskan 401
 * ke client seolah API key mereka yang salah.
 */
function readError(body: unknown): InstaboxErrorBody {
  if (!body || typeof body !== 'object') return {};
  const e = (body as { error?: unknown }).error;
  if (!e || typeof e !== 'object') return {};
  const o = e as Record<string, unknown>;
  return {
    code: typeof o.code === 'string' ? o.code : undefined,
    message: typeof o.message === 'string' ? o.message : undefined,
    retryable: typeof o.retryable === 'boolean' ? o.retryable : undefined,
    operationId: typeof o.operationId === 'string' ? o.operationId : o.operationId === null ? null : undefined,
    retryAfterSeconds: typeof o.retryAfterSeconds === 'number' ? o.retryAfterSeconds : undefined,
  };
}

function toAppError(status: number, body: unknown, action: string): AppError {
  const err = readError(body);
  const code = err.code ?? 'unknown';
  if (status === 401 || status === 403) {
    return new AppError('Konfigurasi InstaBox di server bermasalah. Periksa API key dan scope-nya.', 500, 'INTERNAL_ERROR', {
      code,
    });
  }
  if (status === 404) {
    return Errors.upstream(`Sumber daya InstaBox tidak ditemukan (${action}).`, { code });
  }
  if (status === 409) {
    const details: Record<string, unknown> = { code };
    if (err.operationId) details.operationId = err.operationId;
    if (typeof err.retryAfterSeconds === 'number') details.retryAfterSeconds = err.retryAfterSeconds;
    if (code === 'machine_cooldown') {
      return new AppError('Mesin sedang dalam masa cooldown dan menolak dibangunkan. Coba lagi setelah jeda yang diminta.', 409, 'CONFLICT', details);
    }
    if (code === 'operation_conflict') {
      return new AppError('Mesin sedang menjalankan operasi lain. Coba lagi setelah operasi tersebut selesai.', 409, 'CONFLICT', details);
    }
    return Errors.conflict(`InstaBox menolak aksi ${action}: ${code}.`, details);
  }
  if (status === 429 || status === 503) {
    const details: Record<string, unknown> = { code, retryable: err.retryable ?? true };
    if (typeof err.retryAfterSeconds === 'number') details.retryAfterSeconds = err.retryAfterSeconds;
    return new AppError('Layanan InstaBox sedang tidak tersedia. Coba lagi nanti.', 503, 'UPSTREAM_UNAVAILABLE', details);
  }
  return Errors.upstream(`InstaBox mengembalikan error (${action}): ${code}.`, {
    code,
    retryable: err.retryable ?? false,
  });
}

async function instaboxFetch<T>(
  config: InstaboxConfig,
  path: string,
  opts: { method?: string; body?: unknown; idempotencyKey?: string } = {},
): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {
    'X-API-Key': config.apiKey,
    'Content-Type': 'application/json',
  };
  if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl}${path}`, {
      method: opts.method ?? 'GET',
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // Kegagalan jaringan/timeout: API key tidak pernah disertakan di pesan.
    throw Errors.upstream('Tidak dapat menghubungi InstaBox (timeout atau jaringan).', {
      name: err instanceof Error ? err.name : 'unknown',
    });
  }
  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = {} as T;
  }
  return { status: res.status, data };
}

function slimMachine(m: InstaboxMachine) {
  return {
    id: m.id,
    name: m.name,
    state: m.state,
    ready: m.runtime?.ready ?? null,
    operationId: m.operationId ?? null,
  };
}

async function fetchAllMachines(config: InstaboxConfig): Promise<InstaboxMachine[]> {
  const machines: InstaboxMachine[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const qs: string = cursor ? `?limit=100&cursor=${encodeURIComponent(cursor)}` : '?limit=100';
    const result: { status: number; data: { machines?: InstaboxMachine[]; nextCursor?: string | null } } =
      await instaboxFetch(config, `/v1/machines${qs}`);
    const { status, data } = result;
    if (status !== 200) throw toAppError(status, data, 'list machines');
    for (const m of data.machines ?? []) machines.push(m);
    cursor = data.nextCursor ?? null;
    if (!cursor) break;
  }
  return machines;
}

/** Daftar mesin versi ringkas untuk Hermes. */
export async function listMachines() {
  const machines = await fetchAllMachines(getInstaboxConfig());
  return machines.map(slimMachine);
}

async function getMachine(config: InstaboxConfig, machineId: string): Promise<InstaboxMachine> {
  const { status, data } = await instaboxFetch<InstaboxMachine>(config, `/v1/machines/${machineId}`);
  if (status !== 200) throw toAppError(status, data, 'get machine');
  return data;
}

/** Kirim aksi lifecycle (resume/start). 202 = operation; lifecycle lain ditangani pemanggil. */
async function requestLifecycle(
  config: InstaboxConfig,
  machineId: string,
  action: 'resume' | 'start',
): Promise<InstaboxOperation> {
  const { status, data } = await instaboxFetch<InstaboxOperation>(config, `/v1/machines/${machineId}/${action}`, {
    method: 'POST',
    idempotencyKey: randomUUID(),
  });
  if (status === 200 || status === 202) {
    if (typeof data.id !== 'string' || !data.id) {
      throw Errors.upstream(`Respons operasi InstaBox tidak valid (${action}).`, {});
    }
    return data;
  }
  // 409 yang menyertakan operationId berarti ada operasi berjalan yang bisa
  // dipantau bersama (concurrent callers share the operation).
  if (status === 409) {
    const errBody = readError(data);
    if (typeof errBody.operationId === 'string' && errBody.operationId) {
      return { id: errBody.operationId, state: 'running' };
    }
  }
  throw toAppError(status, data, action);
}

/** Poll satu operasi tanpa long-poll; looping dilakukan pemanggil (browser). */
async function getUpstreamOperation(
  config: InstaboxConfig,
  operationId: string,
): Promise<InstaboxOperation> {
  const { status, data } = await instaboxFetch<InstaboxOperation>(
    config,
    `/v1/operations/${encodeURIComponent(operationId)}`,
  );
  if (status !== 200) throw toAppError(status, data, 'get operation');
  return data;
}

export type WakeAction = 'none' | 'resume' | 'start' | 'wait';

/**
 * Bangunkan mesin bernama INSTABOX_MACHINE_NAME — pola asynchronous.
 * POST /wake hanya menembakkan SATU operasi lalu langsung kembali (202);
 * pemantauan dilakukan via GET /operations/:id oleh pemanggil.
 * - running: tanpa tindakan.
 * - suspended/paused: resume. stopped: start.
 * - transisional dengan operationId: gabung operasi yang sama (tanpa
 *   start/resume kedua). Tanpa operationId: 409 agar pemanggil coba lagi.
 * - deleted/error/tak dikenal: 502 dengan pesan jelas.
 * Tidak ada operasi stop/delete/restart/konfigurasi di sini.
 */
export async function wakeMachine() {
  const config = getInstaboxConfig();
  const machines = await fetchAllMachines(config);
  const machine = machines.find((m) => m.name === config.machineName);
  if (!machine) {
    throw Errors.upstream(`Mesin '${config.machineName}' tidak ditemukan di InstaBox.`, { code: 'not_found' });
  }

  const state = String(machine.state ?? '').toLowerCase();
  if (state === 'running') {
    return {
      machine: slimMachine(machine),
      action: 'none' as WakeAction,
      operation: null as { id: string; state: string } | null,
      message: `Mesin '${machine.name}' sudah berjalan. Tidak ada tindakan.`,
    };
  }

  if (state === 'suspended' || state === 'paused') {
    return followLifecycle(config, machine, 'resume');
  }
  if (state === 'stopped') {
    return followLifecycle(config, machine, 'start');
  }

  if (
    state === 'creating' ||
    state === 'starting' ||
    state === 'stopping' ||
    state === 'suspending' ||
    state === 'resuming' ||
    state === 'deleting'
  ) {
    const opId = typeof machine.operationId === 'string' && machine.operationId ? machine.operationId : null;
    if (opId) {
      return {
        machine: slimMachine(machine),
        action: 'wait' as WakeAction,
        operation: { id: opId, state: 'running' as string },
        message: `Mesin '${machine.name}' sedang '${machine.state}'. Mengikuti operasi yang berjalan.`,
      };
    }
    throw Errors.conflict(
      `Mesin '${machine.name}' sedang dalam status '${machine.state}'. Tunggu hingga selesai lalu coba lagi.`,
      { state: machine.state, operationId: null },
    );
  }

  throw Errors.upstream(
    `Mesin '${machine.name}' dalam status '${machine.state ?? 'tidak diketahui'}' sehingga tidak dapat dibangunkan.`,
    { state: machine.state ?? null },
  );
}

async function followLifecycle(config: InstaboxConfig, machine: InstaboxMachine, action: 'resume' | 'start') {
  // Fire-and-return: tanpa polling di sini, pemanggil memantau via GET /operations/:id.
  const op = await requestLifecycle(config, machine.id, action);
  if (op.state === 'failed') {
    const code = op.error?.code ?? 'unknown';
    throw Errors.upstream(`Operasi ${action} mesin '${machine.name}' gagal (${code}).`, {
      code,
      retryable: op.error?.retryable ?? false,
    });
  }
  const fresh = await getMachine(config, machine.id);
  const done = op.state === 'succeeded';
  return {
    machine: slimMachine(fresh),
    action: action as WakeAction,
    operation: { id: op.id, state: op.state },
    message: done
      ? `Mesin '${machine.name}' sudah ${action === 'resume' ? 'aktif kembali' : 'dinyalakan'}.`
      : `Operasi ${action} mesin '${machine.name}' diterima dan sedang berjalan.`,
  };
}

/**
 * Baca status satu operasi (tanpa long-poll) + verifikasi mesin bila selesai.
 * Selalu 200 bila pembacaan berhasil — termasuk operasi yang failed
 * (kegagalan operasi dilaporkan di data, bukan sebagai HTTP error).
 */
export async function getOperationStatus(operationId: string) {
  const config = getInstaboxConfig();
  const op = await getUpstreamOperation(config, operationId);
  const done = op.state === 'succeeded' || op.state === 'failed';
  let machineOut: ReturnType<typeof slimMachine> | null = null;
  let errorOut: { code: string } | null = null;
  let message: string;
  if (op.state === 'succeeded') {
    if (typeof op.machineId === 'string' && op.machineId) {
      machineOut = slimMachine(await getMachine(config, op.machineId));
    }
    message = 'Operasi selesai.';
  } else if (op.state === 'failed') {
    const code = op.error?.code ?? 'unknown';
    errorOut = { code };
    message = `Operasi gagal (${code}).`;
  } else {
    message = 'Operasi masih berjalan.';
  }
  return {
    operation: { id: op.id, state: op.state, type: op.type ?? null, machineId: op.machineId ?? null },
    done,
    machine: machineOut,
    error: errorOut,
    message,
  };
}
