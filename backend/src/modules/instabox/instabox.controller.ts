import type { NextFunction, Request, Response } from 'express';
import { sendSuccess } from '../../utils/response.js';
import { getOperationStatus, listMachines, wakeMachine } from './instabox.service.js';
import { CONSOLE_HTML, CONSOLE_JS } from './instabox.console.js';

export async function listMachinesHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const data = await listMachines();
    return sendSuccess(res, data, 'Daftar mesin InstaBox berhasil diambil');
  } catch (err) {
    return next(err);
  }
}

export async function wakeMachineHandler(_req: Request, res: Response, next: NextFunction) {
  try {
    const result = await wakeMachine();
    // 200: tidak ada tindakan (sudah running). 202: operasi diterima, pantau via status.
    const status = result.action === 'none' ? 200 : 202;
    return sendSuccess(
      res,
      { machine: result.machine, action: result.action, operation: result.operation },
      result.message,
      status,
    );
  } catch (err) {
    return next(err);
  }
}

export async function operationStatusHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await getOperationStatus(req.params.id);
    return sendSuccess(
      res,
      {
        operation: result.operation,
        done: result.done,
        machine: result.machine,
        error: result.error,
      },
      result.message,
    );
  } catch (err) {
    return next(err);
  }
}

/** Halaman kontrol publik — tidak memuat secret apa pun. */
export function consoleHandler(_req: Request, res: Response): void {
  res.type('html').send(CONSOLE_HTML);
}

/** JavaScript halaman kontrol — same-origin agar lolos CSP backend. */
export function consoleJsHandler(_req: Request, res: Response): void {
  res.type('js').send(CONSOLE_JS);
}
