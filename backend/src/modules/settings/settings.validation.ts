import { z } from 'zod';

export const updateSettingsSchema = z.object({
  timezone: z.string().trim().min(1).max(50).optional(),
  currency: z.string().trim().min(1).max(10).optional(),
  morning_briefing_enabled: z.boolean().optional(),
  morning_briefing_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Gunakan format HH:MM (mis. 06:00)')
    .optional(),
  whatsapp_enabled: z.boolean().optional(),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
