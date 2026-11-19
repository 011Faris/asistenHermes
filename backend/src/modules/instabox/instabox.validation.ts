import { z } from 'zod';

// POST /api/instabox/wake tidak menerima field apa pun: mesin target selalu
// berasal dari INSTABOX_MACHINE_NAME di server, bukan dari browser.
export const wakeMachineSchema = z.object({}).strict().default({});

// ID operasi InstaBox disisipkan ke path URL upstream — batasi ketat agar
// tidak bisa dipakai injeksi path (huruf, angka, - dan _ saja).
export const operationIdParamSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/, 'ID operasi tidak valid'),
});
