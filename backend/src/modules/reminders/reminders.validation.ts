import { z } from 'zod';

export const reminderStatusEnum = z.enum(['pending', 'sent', 'cancelled', 'failed']);

export const idParamSchema = z.object({
  id: z.string().uuid('ID harus berupa UUID'),
});

export const listRemindersQuerySchema = z.object({
  status: reminderStatusEnum.optional(),
  pending_only: z.enum(['true', 'false', '1', '0']).optional(),
  schedule_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createReminderSchema = z.object({
  schedule_id: z.string().uuid('schedule_id tidak valid').nullish(),
  title: z.string().trim().min(1, 'Judul pengingat wajib diisi').max(200),
  message: z.string().trim().max(1000).nullish(),
  remind_at: z.string().datetime({ offset: true }),
});

export const updateReminderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  message: z.string().trim().max(1000).nullable().optional(),
  remind_at: z.string().datetime({ offset: true }).optional(),
  status: reminderStatusEnum.optional(),
});

export type CreateReminderInput = z.infer<typeof createReminderSchema>;
export type UpdateReminderInput = z.infer<typeof updateReminderSchema>;
export type ListRemindersQuery = z.infer<typeof listRemindersQuerySchema>;
