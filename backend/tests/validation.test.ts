import { describe, expect, it } from 'vitest';
import {
  createExpenseSchema,
  createIncomeSchema,
  createTransferSchema,
} from '../src/modules/transactions/transactions.validation.js';
import { createWalletSchema } from '../src/modules/wallets/wallets.validation.js';
import { createScheduleSchema } from '../src/modules/schedules/schedules.validation.js';
import { createReminderSchema } from '../src/modules/reminders/reminders.validation.js';
import { updateSettingsSchema } from '../src/modules/settings/settings.validation.js';

describe('validasi input (tanpa DB)', () => {
  it('menolak saldo awal negatif', () => {
    const r = createWalletSchema.safeParse({ name: 'Tunai', wallet_type: 'cash', initial_balance: -100 });
    expect(r.success).toBe(false);
  });

  it('menerima dompet valid', () => {
    const r = createWalletSchema.safeParse({ name: 'BRI', wallet_type: 'bank', initial_balance: 0 });
    expect(r.success).toBe(true);
  });

  it('menolak nominal nol/negatif untuk income', () => {
    expect(createIncomeSchema.safeParse({
      wallet_id: '00000000-0000-0000-0000-000000000000',
      category_id: '00000000-0000-0000-0000-000000000000',
      amount: 0,
      description: 'x',
      transaction_date: '2026-01-01',
    }).success).toBe(false);
    expect(createIncomeSchema.safeParse({
      wallet_id: '00000000-0000-0000-0000-000000000000',
      category_id: '00000000-0000-0000-0000-000000000000',
      amount: -500,
      description: 'x',
      transaction_date: '2026-01-01',
    }).success).toBe(false);
  });

  it('menolak expense tanpa kategori', () => {
    const r = createExpenseSchema.safeParse({
      wallet_id: '00000000-0000-0000-0000-000000000000',
      amount: 10000,
      description: 'Jajan',
      transaction_date: '2026-01-01',
    });
    expect(r.success).toBe(false);
  });

  it('menerima UUID dompet tidak valid sebagai gagal validasi transfer', () => {
    const r = createTransferSchema.safeParse({
      source_wallet_id: 'bukan-uuid',
      destination_wallet_id: '00000000-0000-0000-0000-000000000000',
      amount: 10000,
      description: 'Pindah dana',
      transaction_date: '2026-01-01',
    });
    expect(r.success).toBe(false);
  });

  it('jadwal membutuhkan start_time ISO', () => {
    expect(createScheduleSchema.safeParse({ title: 'Rapat' }).success).toBe(false);
    expect(createScheduleSchema.safeParse({
      title: 'Rapat',
      start_time: new Date().toISOString(),
    }).success).toBe(true);
  });

  it('pengingat membutuhkan remind_at ISO', () => {
    expect(createReminderSchema.safeParse({ title: 'Minum obat' }).success).toBe(false);
    expect(createReminderSchema.safeParse({
      title: 'Minum obat',
      remind_at: new Date().toISOString(),
    }).success).toBe(true);
  });

  it('jam briefing harus HH:MM', () => {
    expect(updateSettingsSchema.safeParse({ morning_briefing_time: '06:00' }).success).toBe(true);
    expect(updateSettingsSchema.safeParse({ morning_briefing_time: '6 pagi' }).success).toBe(false);
  });
});
