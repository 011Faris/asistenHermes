// Vercel serverless entrypoint.
//
// Vercel menjalankan file ini sebagai function dan meneruskan (req, res)
// ke Express app. Import langsung dari src/ agar tidak bergantung pada
// hasil `tsc` (dist/ tidak di-push ke git karena di-.gitignore).
// @vercel/node meng-compile TypeScript ini otomatis saat deploy.
//
// Tidak ada app.listen() di sini — listener diatur oleh Vercel.
import { createApp } from '../src/app.js';

const app = createApp();

export default app;
