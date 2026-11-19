// Vercel serverless entrypoint.
//
// Vercel menjalankan file ini sebagai function dan meneruskan (req, res)
// ke Express app. Kode aplikasi tetap di src/ dan di-build ke dist/
// melalui `npm run build` (lihat buildCommand di vercel.json) SEBELUM
// function ini di-bundle, sehingga require('../dist/app.js') selalu
// mengarah ke hasil build terbaru.
//
// Tidak ada app.listen() di sini — listener diatur oleh Vercel.
const { createApp } = require('../dist/app.js');

const app = createApp();

module.exports = app;
