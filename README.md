# Photo Prompt Analyzer

Tool personal untuk menganalisa foto secara detail (pose, ekspresi, pakaian,
lokasi, mood, pencahayaan, angle kamera, jenis kamera, color grade, gaya
rambut, penataan rambut, shot kamera) dan menghasilkan satu prompt siap pakai
untuk **Higgsfield Soul 2**. Model analisis yang bisa dipilih: Claude Opus 5 &
Sonnet 5 (lewat LLMsRelay), dan Gemini 3.8 / 3.7 / 3.6 Flash (Google AI Studio).

## Fitur

- Upload foto utama, dianalisa otomatis untuk semua elemen.
- Toggle "ikuti dari foto utama" untuk pakaian & lokasi — kalau dimatikan,
  upload foto referensi terpisah.
- Toggle serupa untuk gaya rambut — kalau dimatikan, pilih dari daftar preset
  (Gerai Panjang / Ikatan Panjang), tanpa perlu upload foto.
- Tekstur kulit & rambut natural (anti-"kelihatan AI") otomatis disisipkan ke
  setiap hasil, dengan aturan supaya tidak bentrok dengan gaya rambut yang
  dipilih.
- Pencahayaan dianalisa & di-enrich otomatis dari foto, tidak perlu pilih
  manual.
- Kompresi foto otomatis di browser (resize ke maks 1568px, lalu kompres ke
  bawah 500kb) sebelum dikirim — upload lebih cepat & hemat token.
- Login sekali, sesi tersimpan di cookie selama 30 hari.

## Setup Lokal

1. Install dependency:
   ```bash
   npm install
   ```
2. Duplikat `.env.example` jadi `.env.local`, isi tiga variabel:
   - `APP_PASSWORD` — password login pilihan kamu
   - `SESSION_SECRET` — string acak panjang (`openssl rand -hex 32`)
   - `LLMSRELAY_API_KEY` — API key dari dashboard LLMsRelay (`sk-cs4-*`)
3. Jalankan:
   ```bash
   npm run dev
   ```
4. Buka `http://localhost:3000`, login pakai `APP_PASSWORD`.

## Deploy ke Vercel

1. Push repo ini ke GitHub (repo ini privat).
2. Buka [vercel.com](https://vercel.com) → New Project → import repo GitHub
   ini.
3. Di tab **Environment Variables**, isi tiga variabel yang sama seperti di
   `.env.local` (`APP_PASSWORD`, `SESSION_SECRET`, `LLMSRELAY_API_KEY`).
   **Jangan pernah commit nilai asli ini ke GitHub** — `.env.local` sudah
   di-ignore lewat `.gitignore`.
4. Deploy. Setelah selesai, buka domain Vercel-nya, login dengan
   `APP_PASSWORD`.

## Kenapa perlu login?

Karena API key ada di server (aman dari pencurian lewat browser), tapi
endpoint `/api/analyze` tetap bisa dipanggil siapa saja yang tahu URL
domainnya kalau tidak dikunci. Login sekali + cookie 30 hari adalah proteksi
minimal supaya budget API kamu tidak habis dipakai orang lain.

## Catatan biaya

Setiap generate memanggil model analisis yang dipilih (Claude lewat LLMsRelay atau Gemini) dengan 1-3 foto
+ instruksi analisa. Estimasi biaya per generate sekitar $0.01–$0.02
(tergantung jumlah foto & panjang hasil). Cek saldo & rincian pemakaian di
dashboard LLMsRelay.

## Struktur proyek

```
app/
  page.tsx              → halaman utama (upload + generate)
  login/page.tsx         → halaman login
  UploadField.tsx        → komponen upload + kompresi foto
  api/analyze/route.ts   → panggil LLMsRelay (Claude Sonnet 5)
  api/login/route.ts     → set cookie sesi
lib/
  promptInstructions.ts  → instruksi 12 elemen + semua aturan (rambut, kulit, cahaya)
  imageCompress.ts        → resize & kompres foto di browser
  session.ts              → sign & verify cookie sesi (Web Crypto)
proxy.ts                   → lindungi semua route kecuali /login
```
