/**
 * Helper timezone aplikasi (default Asia/Jakarta).
 * Database menyimpan waktu sebagai TIMESTAMPTZ; backend hanya meneruskan
 * string ISO dan menghitung rentang hari/bulan dalam timezone aplikasi.
 */

export const DEFAULT_TIMEZONE = process.env.TIMEZONE || 'Asia/Jakarta';

/** Ambil bagian tanggal YYYY-MM-DD dari sebuah Date dalam timezone tertentu. */
export function toDateKey(date: Date, timeZone = DEFAULT_TIMEZONE): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/** Awal hari (00:00) dalam timezone aplikasi, dikembalikan sebagai Date (UTC instant). */
export function startOfDayInZone(date: Date, timeZone = DEFAULT_TIMEZONE): Date {
  const key = toDateKey(date, timeZone);
  return zonedMidnightToUtc(key, timeZone, 0);
}

/** Akhir hari berikutnya (eksklusif) = start hari + 1 hari. */
export function endOfDayExclusiveInZone(date: Date, timeZone = DEFAULT_TIMEZONE): Date {
  const start = startOfDayInZone(date, timeZone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000);
}

/** Rentang [awalBulan, awalBulanBerikutnya) untuk bulan berjalan dalam timezone aplikasi. */
export function currentMonthRangeInZone(now = new Date(), timeZone = DEFAULT_TIMEZONE): { start: Date; end: Date } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(now);
  const year = Number(parts.find((p) => p.type === 'year')?.value);
  const month = Number(parts.find((p) => p.type === 'month')?.value);
  const key = `${year}-${String(month).padStart(2, '0')}-01`;
  const start = zonedMidnightToUtc(key, timeZone, 0);
  const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  const end = zonedMidnightToUtc(next, timeZone, 0);
  return { start, end };
}

/**
 * Konversi tengah malam lokal (YYYY-MM-DD) pada timezone tertentu menjadi UTC instant.
 * Pendekatan: cari offset timezone pada tanggal tersebut via Intl, lalu kurangi.
 */
function zonedMidnightToUtc(dateKey: string, timeZone: string, hour: number): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  // Tebakan awal: perlakukan sebagai UTC, lalu koreksi dengan offset aktual.
  const guessUtc = Date.UTC(y, m - 1, d, hour, 0, 0);
  const offsetMs = zoneOffsetMs(new Date(guessUtc), timeZone);
  return new Date(guessUtc - offsetMs);
}

/** Offset (local - UTC) dalam ms untuk sebuah instant pada timezone tertentu. */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = dtf.formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant.getTime();
}
