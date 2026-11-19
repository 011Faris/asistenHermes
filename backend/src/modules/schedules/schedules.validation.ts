import { z } from 'zod';

export const scheduleStatusEnum = z.enum(['scheduled', 'completed', 'cancelled']);
export const schedulePriorityEnum = z.enum(['low', 'normal', 'high']);

export const idParamSchema = z.object({
  id: z.string().uuid('ID harus berupa UUID'),
});

export const listSchedulesQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Gunakan format YYYY-MM-DD').optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: scheduleStatusEnum.optional(),
  upcoming: z.enum(['true', 'false', '1', '0']).optional(),
  today: z.enum(['true', 'false', '1', '0']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const createScheduleSchema = z.object({
  title: z.string().trim().min(1, 'Judul jadwal wajib diisi').max(200),
  description: z.string().trim().max(1000).nullish(),
  location: z.string().trim().max(200).nullish(),
  start_time: z.string().datetime({ offset: true }),
  end_time: z.string().datetime({ offset: true }).nullish(),
  priority: schedulePriorityEnum.default('normal'),
});

export const updateScheduleSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).nullable().optional(),
  location: z.string().trim().max(200).nullable().optional(),
  start_time: z.string().datetime({ offset: true }).optional(),
  end_time: z.string().datetime({ offset: true }).nullable().optional(),
  priority: schedulePriorityEnum.optional(),
});

export const updateScheduleStatusSchema = z.object({
  status: scheduleStatusEnum,
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
