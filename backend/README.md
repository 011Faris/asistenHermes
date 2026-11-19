# Personal AI Assistant — Backend

Backend REST API untuk aplikasi **Personal AI Assistant**: pusat pengelolaan keuangan, jadwal, pengingat, dan dashboard. Dirancang single-user (tanpa `user_id`), diamankan dengan API key, dan terhubung ke database Supabase yang sudah tersedia.

## 1. Teknologi

- Node.js ≥ 22, TypeScript (strict)
- Express.js 4
- Supabase JS v2 (`SUPABASE_SERVICE_ROLE_KEY` hanya di backend)
- Zod (validasi request + env), dotenv
- Helmet, CORS, express-rate-limit
- Pino + pino-http (logging terstruktur, secret di-redact)
- Vitest + Supertest (pengujian)

## 2. Struktur folder

```text
backend/
├── src/
│   ├── config/         # env.ts (validasi Zod), supabase.ts (service role client)
│   ├── middlewares/    # auth, validate (Zod), error + notFound
│   ├── modules/
│   │   ├── health/     # GET /api/health (tanpa auth)
│   │   ├── wallets/    # CRUD + status + balance (view wallet_balances)
│   │   ├── categories/ # income/expense, guard hapus bila dipakai
│   │   ├── transactions/ # income/expense via create_simple_transaction, transfer via create_transfer
│   │   ├── schedules/  # jadwal + filter today/upcoming, timezone Asia/Jakarta
│   │   ├── reminders/  # data pengingat saja (tanpa kirim WhatsApp)
│   │   ├── settings/   # singleton user_settings
│   │   └── dashboard/  # GET /api/dashboard/summary
│   ├── routes/index.ts # pendaftaran seluruh router /api/*
│   ├── utils/          # logger, response envelope, errors, timezone
│   ├── app.ts          # factory Express (dipakai server + test)
│   └── server.ts       # boot + graceful shutdown
├── tests/              # health, validation, rules (mock Supabase)
├── .env.example
├── package.json
└── tsconfig.json
```

Setiap modul memisahkan `validation` (Zod) → `service` (akses Supabase) → `controller` (HTTP) → `routes` (wiring).

## 3. Instalasi

```bash
cd backend
npm install
cp .env.example .env   # lalu isi nilainya (lihat bagian 4)
```

## 4. Konfigurasi `.env`

| Variabel | Wajib | Cara memperoleh |
|---|---|---|
| `SUPABASE_URL` | Ya | Dashboard Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Ya | Dashboard Supabase → Project Settings → API → `service_role` (secret). **Jangan taruh di frontend.** |
| `ASSISTANT_API_KEY` | Ya | Buat string acak panjang, mis. `openssl rand -hex 32`. Kirim sebagai header `x-api-key` (atau `Authorization: Bearer …`). |
| `FRONTEND_URL` | Ya (prod) | Origin dashboard web, mis. `https://asisten.example.com`. Production hanya mengizinkan origin ini (tanpa `*`). |
| `PORT` / `NODE_ENV` / `TIMEZONE` | Opsional | Default `3000` / `development` / `Asia/Jakarta`. |

## 5. Menjalankan

```bash
npm run dev     # development (tsx watch)
npm run build   # kompilasi ke dist/
npm start       # jalankan hasil build
npm run typecheck
npm test
```

## 6. Daftar endpoint

Semua endpoint `/api/*` (kecuali `GET /api/health` dan `GET /`) wajib header `x-api-key: <ASSISTANT_API_KEY>`.

| Method | Endpoint | Keterangan |
|---|---|---|
| GET | `/api/health` | Status backend + Supabase, waktu server, versi (publik) |
| GET | `/api/wallets` | Daftar dompet + saldo (`wallet_balances`) |
| GET | `/api/wallets/:id` | Detail dompet |
| GET | `/api/wallets/:id/balance` | Saldo dari view `wallet_balances` |
| POST | `/api/wallets` | Buat dompet (`initial_balance` ≥ 0) |
| PATCH | `/api/wallets/:id` | Ubah dompet, termasuk `initial_balance` (≥ 0; ditolak 409 bila dompet sudah punya jurnal; field tak dikenal ditolak 400) |
| PATCH | `/api/wallets/:id/status` | Aktif/nonaktif (`{ is_active }`) |
| GET | `/api/categories?category_type=income\|expense` | Daftar kategori |
| GET | `/api/categories/:id` | Detail |
| POST | `/api/categories` | Buat (`category_type: income\|expense`) |
| PATCH | `/api/categories/:id` | Ubah |
| DELETE | `/api/categories/:id` | Ditolak bila sudah dipakai transaksi |
| GET | `/api/transactions?...` | Filter `start_date,end_date,type,status,wallet_id,category_id,search,page,limit` |
| GET | `/api/transactions/:id` | Detail + entries |
| POST | `/api/transactions/income` | Via RPC `create_simple_transaction` (`p_type=income`) |
| POST | `/api/transactions/expense` | Via RPC yang sama (`p_type=expense`) |
| POST | `/api/transactions/transfer` | Via RPC `create_transfer` (atomik) |
| GET | `/api/schedules?today=1&upcoming=1&date=YYYY-MM-DD&status=` | Daftar jadwal |
| GET/POST | `/api/schedules…` | Detail, buat, ubah |
| PATCH | `/api/schedules/:id/status` | `scheduled\|completed\|cancelled` |
| DELETE | `/api/schedules/:id` | Hapus jadwal |
| GET/POST | `/api/reminders…` | Daftar (`status,pending_only,schedule_id`), buat |
| PATCH/DELETE | `/api/reminders/:id` | Ubah, hapus (tanpa kirim WA) |
| GET/PATCH | `/api/settings` | Singleton `user_settings` |
| GET | `/api/dashboard/summary` | Saldo, arus kas bulan berjalan (confirmed), jadwal, transaksi terbaru |

### Contoh request

```bash
# Health (publik)
curl http://localhost:3000/api/health

# Buat pengeluaran
curl -X POST http://localhost:3000/api/transactions/expense \
  -H 'Content-Type: application/json' -H 'x-api-key: <KEY>' \
  -d '{"wallet_id":"<UUID>","category_id":"<UUID>","amount":25000,
       "description":"Makan siang","transaction_date":"2026-11-19"}'

# Transfer antar-dompet
curl -X POST http://localhost:3000/api/transactions/transfer \
  -H 'Content-Type: application/json' -H 'x-api-key: <KEY>' \
  -d '{"source_wallet_id":"<UUID>","destination_wallet_id":"<UUID>",
       "amount":100000,"description":"Top up","transaction_date":"2026-11-19"}'

# Ringkasan dashboard
curl http://localhost:3000/api/dashboard/summary -H 'x-api-key: <KEY>'
```

Response sukses selalu `{ "success": true, "message", "data" }`; gagal `{ "success": false, "message", "error": { "code", "details?" } }`.

## 7. Menghubungkan frontend

- Set `FRONTEND_URL` di backend ke origin dashboard (production).
- Dari frontend, panggil `GET /api/dashboard/summary`, `/api/wallets`, `/api/transactions`, dst. dengan header `x-api-key`.
- Jangan pernah memanggil Supabase langsung dengan service role dari browser; API key asisten pun idealnya disimpan di server/proxy frontend, bukan di bundle publik bila memungkinkan.

## 8. Menguji koneksi Supabase

1. Isi `.env` dengan `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` dari dashboard Supabase.
2. `npm run dev`, lalu buka `GET /api/health` — field `supabase` harus `"up"`.
3. Bila `"down"`, cek URL/key, status project Supabase, dan koneksi jaringan.

## 9. Deploy ke Vercel

Backend ini stateless (Supabase via REST, tanpa koneksi persisten) sehingga cocok
untuk Vercel serverless. Entrypoint-nya `api/index.js`, yang me-require hasil
build `dist/` — lihat `vercel.json` (`buildCommand: npm run build` + rewrite
seluruh request ke function `/api`).

Langkah deploy:

1. Push repo ke GitHub/GitLab/Bitbucket.
2. Di dashboard Vercel → Add New Project → pilih repo.
3. **Root Directory = `asisten/backend`** (repo root berisi folder lain).
4. Framework Preset: Other. Build Command terisi otomatis dari `vercel.json`.
5. Isi Environment Variables (Production):
   - `SUPABASE_URL` — Project Settings → API → Project URL
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → `service_role`
   - `ASSISTANT_API_KEY` — string acak milikmu (mis. hasil `openssl rand -hex 32`)
   - `FRONTEND_URL` — origin dashboard production (mis. `https://asisten.example.com`)
   - `TIMEZONE=Asia/Jakarta`, `NODE_ENV=production`
6. Deploy, lalu verifikasi `GET https://<domain>/api/health` → `supabase: "up"`.

Catatan:

- Rate limit (`express-rate-limit`) memakai memori per-instance di serverless,
  sehingga bersifat per-instance, bukan global — dapat diterima untuk satu pengguna.
- `server.ts` (`app.listen`) hanya dipakai untuk `npm run dev` / VPS; di Vercel
  yang berjalan adalah `api/index.js`.

## 9. Catatan integritas data

- Saldo selalu dibaca dari view `wallet_balances` (`id` + `current_balance`); backend tidak pernah menghitung saldo dari input frontend.
- Kontrak API memakai `type`/`amount`, sedangkan kolom DB aktual adalah `transactions.transaction_type` dan `transaction_entries.amount_signed` — backend menerjemahkan di lapisan service sehingga kontrak API tidak berubah.
- Income/expense/transfer **wajib** lewat DB function (`create_simple_transaction` / `create_transfer`) agar jurnal atomik.
- Tidak ada endpoint hapus transaksi permanen; pembatalan memakai reversal jurnal (tahap berikutnya).
- Dompet nonaktif dan kategori bertipe salah ditolak saat mencatat transaksi baru.
- Verifikasi live terhadap struktur Supabase aktual belum dilakukan pada tahap ini (belum ada kredensial di lingkungan build) — lihat laporan implementasi.
