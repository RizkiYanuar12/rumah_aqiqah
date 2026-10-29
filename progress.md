# Progress RAMS (Rumah Akikah Management System)

Terakhir update: 28 Okt 2026 (rencana notifikasi pengajuan cabang → pusat; belum dieksekusi). Sumber acuan: `PRD.md`. Istilah resmi: **Closing** (tabel `closing`; `leads` usang).

## 1. PRD dibaca
- MVP = alur Order inti: SEO input closing → CSO input order + VA/Cash → produksi manual via WA → laporan BM.
- Out of scope awal: integrasi WA/Qontak, analitik prediktif, migrasi historis, pengajuan stock ke pusat, Qurban.
- Gap vs PRD (per 23 Okt): VA/Cash + webhook (FR-04/05) **sudah ada** (M1 NICEPAY, §13–§14) — PRD masih sebut "Nespay", implementasi NICEPAY. Yang belum: FR-06 auto-`diproses`, FR-08 dashboard → §16.

## 2. Desain lokasi/stock (diputuskan)
- `lokasi(id_lokasi, nama, jenis PUSAT|CABANG, is_active)` — seed: PUSAT + BDG-RAYA (ejaan resmi id lokasi; nama tampil `Bandung Raya` dari DB).
- `inventory` = master (`sku, nama_barang, satuan`); angka per lokasi di `stock_lokasi(id_lokasi, sku, stock, hpp_average, min_stock)`. Ejaan resmi: **dengan `k`**.
- Lokasi user di `auth.users.app_metadata.id_lokasi` (Opsi A), set via SQL Editor; wajib re-login setelah ubah.
- Aturan: sama di semua cabang → `inventory`; beda per cabang → `stock_lokasi`.

## 3. Status DB aktual
- Ada: `lokasi(PUSAT+BDG-RAYA), inventory, stock_lokasi, paket(+jumlah_hewan, sebagian NULL), paket_items, olahan(+kategori), olahan_item, closing(+email_customer, +kota, +kode_pos, +wilayah), orders(+closing_id, +id_lokasi, +customer_email), order_lines, order_olahan, order_items, pembayaran(+va_number, +gateway_ref, +sumber, +nama_pembayar, +nama_bank), users(id+role, tanpa id_lokasi — benar), status_history, pengajuan`.
- View/function kunci M1: `v_status_pembayaran_order` (sumber hitung tunggal, `security_invoker=on`), RPC `buat_va_pending` + `catat_bayar` (hanya service role, `revoke execute` sudah dijalankan).
- Transaksional (`closing/orders/lines/history`) kosong — mulai bersih 8 Okt 2026.
- Dibuang: `orders.sumber_informasi` (selalu NULL), `orders.closer_id` (kosong), tabel `closers` (tak terpakai; pelaku = `created_by/cso_id/changed_by → users`).
- Status & jenis UPPERCASE (dikunci 13 Okt 2026, DB dimigrasi manual): `orders.status`/`closing.status` = PENDING/DIPROSES/SELESAI/BATAL/BARU (sumber: `lib/orders/status.ts`, `lib/closing.ts`); `mutasi_stock.jenis` = MASUK/KELUAR/BATAL. Trigger Bagian 6 ikut uppercase.
- Stok otomatis via TRIGGER (aktif 13 Okt 2026, `migrasi_v2_2_fungsi.sql` Bagian 6): `trg_order_items_stok` potong saat item ditulis / kembalikan saat item dihapus; `trg_orders_batal_stok` kembalikan semua saat status → `batal` (tolak dari `terkirim`/`selesai`, tolak keluar dari `batal`). App (`lib/orders/`) TIDAK panggil RPC — hanya tulis `order_items` + validasi ramah di depan (create: penuh; edit: selisih vs stok yang dipegang). `keluar_barang_cabang` NONAKTIF (pemakaian ganda = potong 2x). Desain stok simple: `paket_items` = box per varian (Sultana = box sultana + bento, qty = porsi); kambing milik vendor, di luar stok.
- Duplikat no HP tidak ditolak (repeat customer valid) — warning + riwayat di `POST /api/closing`.
- `rename_sku_sertifikat.sql` (GDB-029, guard, belum dijalankan).

## 4. Closing — halaman `/closing` (CRM, selesai)
- `lib/closing.ts`: `SUMBER[9]`, `STATUS[4]`, `NO_HP`, validator, fragmen select sentral (`ORDER_LINES_SELECT`, `CLOSING_ORDERS_SELECT` — tambah field cukup 1 tempat; hasil query di-cast ke tipe kartu), helper `tenggatLabel()` + `statusClosing()` (self-check 7/7).
- Daftar = **tabel** (ID 8-char + Customer + No. HP + Status + SEO + Sumber + Nilai; search nama/HP/ID/SEO; filter status derivasi; sort; expand rincian + link `Kelola di Pesanan`; tanpa paginasi; brand marun-emas, `max-w-7xl`).
- Status closing = derivasi order (kolom DB tidak dibaca UI): kosong/semua-pending→baru, ada yang jalan→diproses, semua-selesai→selesai, semua-batal→batal.
- Kartu statistik status (5) + seksi Ekor Terjual / Omset: CSO = agregat lokasi (nama dari DB), SEO = per-SEO (label interim email via `listUsers`); ekor = `Σ order non-batal → lines PAKET → qty × jumlah_hewan`; selalu tampil (nol saat kosong).
- `POST /api/closing`: sekali simpan closing+order; email `email_customer ?? email`.
- `form-closing-baru.tsx` + `form-ubah-order.tsx` digabung ke `closing/_components/order-form.tsx` (satu mesin: state, total, layout; wrapper tipis berisi kartu customer + validasi ekstra + fetch + redirect). Section reuse (`Paket/Olahan/Addon/Bayar/TotalBar` di `order-sections.tsx`) tetap.
- `components/app-sidebar.tsx`: logo `/logo.png` 627×318 + `object-contain`.

## 5. Auth + akses (selesai)
- `lib/auth/auth.ts`: `requireRole()` (halaman → redirect) + `requireApiRole()` (API → 401/403 JSON) via `getClaims()`, return `{ userId, role, idLokasi }`.
- `lib/supabase/admin.ts` ada (service-role, server-only). List page + API baca via admin client + filter kode (pola baku; user-client terbukti rapuh untuk nested RLS).
- `lib/auth/access.ts` = satu-satunya definisi menu + hak (`ROUTE_ACCESS`, `ROUTE_LABELS`, `HOME_BY_ROLE`, `canAccess`); dipakai layout sidebar + `proxy.ts`. SEO: `/closing + /orders`. CSO: `/closing + /orders + /inventory/cabang` (+ `/resep` saat menu resep dieksekusi).
- `status_history(order_id → orders.id_pesanan cascade, from/to/changed_by)` — dibuat via Dashboard, FK cascade terverifikasi.

## 6. Pesanan — halaman `/orders` (operasi, selesai)
- Status bebas 5 nilai (tanpa `canTransition`; dead code dihapus). Otorisasi: ubah status `cso,branch_manager`; ubah isi `seo,cso`; Finance/BM read-only (kontrol disembunyikan bila tak berhak).
- Scope baca: SEO = buatannya (`cso_id=self`); CSO = se-`id_lokasi` (tanpa lokasi → semua); Finance/BM = semua.
- `Semua` = semua status pesanan (chip per-status tetap ada; badge deadline + pill tenggat hanya order aktif). Strip pipeline: chip Semua/status/Terlambat (klik = filter). Subjudul ikut filter. Deadline chip hanya order aktif.
- Kartu nota lengkap: nama + badge + tenggat, strip paket + olahan, kontak 1 baris (email/alamat/Masuk di expand), Total, tombol item/Ubah, kontrol status, rincian harga di expand (subtotal paket + add-on + diskon + total).
- Daftar selalu segar: pola render-adjust sinkron props + update optimistik `ubahStatus` (lint repo melarang setState di effect).
- API: `PATCH /api/orders/[id]/status` (status + tulis history, scope lokasi CSO) dan `PATCH /api/orders/[id]` (edit isi penuh, tolak terminal 400; SEO hanya miliknya 403).
- `lib/orders/`: satu sumber hitung (`resolve.ts` → `resolveRincian`), tulis (`persist.ts` → `insertRincian`), buat (`create.ts` → `createOrderFromDetail`), edit (`update.ts` → `updateOrderRincian`), status (`status.ts` → konstanta), tipe (`types.ts`); `/orders/[id]/ubah` = form sama + prefill (customer read-only, terminal → notice).
- Live join `paket(tipe,anak,porsi,jenis,jumlah_hewan)` di `order_lines` (tanpa migrasi).

## 7. Keputusan penting (log ringkas 8 Okt 2026)
- Admin-client + filter kode sebagai pola baca (ganti user-client yang gagal nested RLS untuk CSO).
- `BDG-RAYA` ejaan resmi; file migrasi disamakan; DB konvergen tanpa migrasi data.
- Kolom/tabel mati dibuang; `siap_produksi` dibuang (sinyal lunas → badge bayar + panel bayar; auto `diproses` saat lunas **tidak** dijalankan — §13b.7/§14a.6).
- Closing = CRM ringkas, Pesanan = dapur detail (pembeda dikunci setelah sempat konvergen).
- Semua build hijau; lint = sisa pre-existing (`forbidden/page.tsx`, `hooks/use-mobile.ts`, stub `forgotpassword`, `_headers` di `server.ts`) — disepakati dibiarkan.
- [14 Okt 2026] Integrasi WA/Qontak DIBATALKAN permanen (PRD §4) — koordinasi produksi & follow-up bayar via WA manual selamanya; jangan usulkan lagi.

## 8. Todo (23 Okt 2026)
1. Uji end-to-end (data kosong → input 1 closing dulu): login SEO buat closing+order → login CSO lihat se-lokasi → ubah isi (tambah add-on, cek `harga_final`) → ubah status bebas → cek `orders.status` + 1 baris `status_history`; Finance PATCH status (403); SEO buka order CSO (tak tampil di list; PATCH 403).
2. Prasyarat via Dashboard: jalankan `migrasi_v2_2_fungsi.sql` Bagian 2 (`mutasi_stock, pengeluaran_gudang, v_stock, RPC`) + `migrasi_pengajuan_restock.sql` §§1c–2–5 (CHECK 6 status; `batalkan_pengajuan` tidak dipakai app — inventory tidak boleh batal) + verifikasi definisi live `setujui_pengajuan`.
3. Fase B: `/inventory/cabang` read-only (FR-02) — SELESAI 12 Okt 2026 (API `cabang/route.ts` + `page.tsx` + `daftar-inventory.tsx` tabel/filter/badge; `tsc` bersih). Sisa verifikasi manual: CSO cocok `v_stock`, SEO 403.
4. Data master: isi `paket.jumlah_hewan` yang masih NULL (ekor varian itu = 0); diskusi label per-SEO (pengganti email interim).
5. Fase E (pembayaran) + Fase D (VA) — **SELESAI sebagai M1 NICEPAY**, lihat §13–§14. Sisa: checklist uji manual sandbox §14c.
6. [Pengajuan restock Pusat → Cabang — SELESAI kode, tinggal jalankan SQL + uji] Arah: cabang meminta, pusat mengirim. Skema: `pengajuan` satu baris per item (`id_pengajuan` PK, `id_lokasi`, `status`, `created_by` uuid polos, `sku`, `qty`, `nama_barang` snapshot) — **6 status** (lihat §15.3). App: `lib/inventory/pengajuan.ts`, `POST/GET /api/pengajuan` (cso se-lokasi; inventory semua), `PATCH /api/pengajuan/[id]` (inventory: setuju/kirim/tolak; cso: terima; inventory tanpa batal), `DELETE /api/pengajuan` (cso tarik), `/inventory/history` (CSO form ketik-nama + saran dropdown; inventory daftar + aksi). Sisa: jalankan SQL (fungsi) + uji matriks (buat → setuju → kirim → terima → cek `stock_lokasi` dua sisi + mutasi; tolak; inventory batal 400; stok pusat kurang; CSO lokasi lain 403).

## 9. Berikutnya (23 Okt 2026)
- Prioritas 1: **uji manual M1 NICEPAY** (§14c checklist) — butuh tunnel ngrok + sandbox.
- Priority 2: jalankan SQL yang tertunda (`migrasi_v2_2_fungsi.sql` §2, `migrasi_pengajuan_restock.sql`, `rename_sku_sertifikat.sql`, `migrasi_closing_billing.sql`) + koreksi buku ERROR-1 (§12).
- Prioritas 3: NICEPAY prod (`isProduction: true` + `.env` prod + uji webhook prod) — jangan sentuh sebelum semua uji sandbox hijau.
- Prioritas 4: selisih PRD yang belum tertutup — FR-06 auto-`diproses`, FR-08 dashboard (§16).
- Prasyarat (belum dijalankan): Bagian 2 `migrasi_v2_2_fungsi.sql`.

## 10. Resep paket & pengisian sekali (dikunci 13 Okt 2026)

- Butir `paket_items` = pasangan (id_paket, sku), `qty` = kebutuhan per 1 paket (mis. box per porsi × porsi varian). Add-on ikut aturan sama (add-on juga baris `paket`). Bumbu olahan lewat `olahan_item` (kunci id_olahan, rumus per porsi) — dikosongkan dulu, no-op aman.
- Aturan isi: Sultana = 2 baris (BOX NASI SULTANA GDG-009 + Box Bento GDG-006, masing-masing × porsi); varian lain = 1 baris box-nya × porsi. SKU boleh dipakai ulang antar varian (sharing ditangani `group by sku` di trigger/`resolveRincian`); box tanpa baris `stock_lokasi` ditolak fail-closed (`Stok tidak cukup`).
- Pengisi = Inventory/admin, sekali via Dashboard **atau** menu `/resep` (CRUD, role cso — §15.2). Kambing milik vendor, di luar stok. Box master: GDG-006–011 (Bento, Gold, Magenta, Sultana, V.01, V.03).
- Perubahan resep hanya memengaruhi order baru (`order_items` lama = snapshot qty + HPP).
- Menu `/resep` (CSO saja) — **naik ke CRUD SUDAH SELESAI** (lihat §15.2). `PUT` tidak dipakai; validasi paket aktif + SKU ada + qty > 0 + anti-duplikat (id_paket, sku); riwayat tak bisa dirusak dari menu ini.
- Terbuka: isi `olahan_item` saat dapur serahkan takaran; prasyarat tetap Query 1 → 0 baris + cakupan resep/stok per varian sebelum uji potong. ~~Guard tolak order bila paket tanpa resep~~ → **SUDAH** (`lib/orders/resolve.ts`).

## 11. Gudang Pusat → menu Stock (SELESAI kode 15 Okt 2026, tinggal uji manual)
- Konsolidasi: form + tabel + riwayat kini satu menu `/inventory/stock` (role inventory). Tombol **+ Tambah Data** membuka modal (`Dialog` `@base-ui/react`, sudah di-deps) berisi form adaptif (mode Terdaftar/Baru, SKU auto GDG-plus-1, validasi inline, satu tombol Simpan). Menu `/inventory/pusat` DIHAPUS total (rute + akses + `HOME_BY_ROLE`); API `app/api/inventory/pusat` tetap (dipakai halaman Stock).
- `lib/inventory/pusat.ts` (`catatMasuk` unifikasi baru/existing, `ubahMinStock` upsert, `hapusStokLokasi` stok-0); `lib/inventory/inventory.ts` resolver shared; tabel ada pencarian + Hapus baris stok-0 + banner menipis/habis.
- Kolom **Satuan** di tabel Stock (dari `v_stock`, tanpa ubah query) + field Satuan selalu tampil di modal: terisi otomatis saat nama cocok master; barang baru → ikut insert master (default `Pcs`); barang terdaftar → update master bila diubah.
- Sisa uji: inventory Tambah Data (baru + existing), Setujui pengajuan cabang, CSO 403, hapus baris-0.

## 12. Error & koreksi buku (ditemukan 16 Okt 2026)
- [ERROR-1 — bypass approval, buku inkonsisten] 2 pengajuan DITERIMA 15 Okt (Kertas Nasi GDG-021 ×100, BOX SULTANA GDG-009 ×500) status jalan penuh tapi **nol mutasi transfer** di kedua sisi; stok PUSAT utuh (184.500/4.700 = angka seed). Dugaan: flip status manual via Dashboard saat testing, lewat tanpa RPC `setujui_pengajuan`. Perlu jurnal koreksi manual (PUSAT KELUAR + cabang MASUK) setelah 3 fakta dikonfirmasi: tombol-UI vs manual? fisik sampai cabang? GDG-009 cabang=500 itu stok lama atau transfer ini?
- [ERROR-2 — versi fungsi live belum pasti] `migrasi_v2_2_fungsi.sql` §§2–4 + `migrasi_pengajuan_restock.sql` §§1c–2–5 (termasuk fix `stok_lokasi`→`stock_lokasi`, `barang_masuk` + `tanggal_exp`, CHECK 6 status; RPC `batalkan_pengajuan` tidak dipakai app) sudah dikoreksi di repo tapi **belum di-run** di Dashboard. Verifikasi: cek definisi live `setujui_pengajuan` (ada blok keluar/terima? ejaan apa?) + uji 1 pengajuan qty-1 via UI.
- [OPEN] Seed Bagian B oleh user via Dashboard jalan (MASUK 16 Okt masuk); catat: qty GDG-031/GDG-032 beda dari `seed_normalisasi_pusat.sql` — pastikan disengaja. Transfer cabang MASUK `tanggal_exp` NULL (audit terputus di transfer; diterima sadar, carry-over opsional).
- Aturan main: ubah status pengajuan hanya via tombol app, jangan flip manual di Dashboard (langkah kirim/terima lolos tanpa RPC sehingga bypass tidak ketahuan).

## 13. M1 — Integrasi NICEPAY non-SNAP (VA) — 21 Okt 2026
### 13a. Riset NICEPAY non-SNAP (hasil uji sandbox, dasar implementasi)
- **Standar akun: non-SNAP** (`iMid` + `merchantKey`, jalur `/nicepay/direct/v2/*`). Bukan SNAP → **tidak ada** `X-TIMESTAMP`/`X-SIGNATURE`; asumsi lama salah.
- Base URL: dev `https://dev.nicepay.co.id/nicepay` + `/direct/v2/{registration,inquiry,cancel}`; prod `https://www.nicepay.co.id/nicepay` (dipilih SDK lewat `isProduction`).
- **Token (SHA256 hex)** — request: `SHA256(timeStamp + iMid + referenceNo + amt + merchantKey)`; cancel: `…+tXid+…`; **notifikasi: `SHA256(iMid + tXid + amt + merchantKey)` — tanpa timestamp**. Notifikasi tidak punya signature → token notifikasi satu-satunya bukti transfer.
- `timeStamp` = `yyyyMMddHHmmss` **WIB**. SDK (`helper.getTimestampOldFormat()`) memakai **waktu lokal server** → wajib `process.env.TZ = 'Asia/Jakarta'` (Vercel = UTC → token meleset 7 jam). Gejala: `transTm` dari NICEPAY beda 7 jam = TZ salah.
- Registrasi: `POST /direct/v2/registration`, `payMethod '02'` (VA; `'01'` = kartu), `currency 'IDR'`, `amt` **string**, `referenceNo`, `goodsNm`, `billingNm/Phone/Email/Addr/City/State/PostCd/Country`, `dbProcessUrl`, `bankCd 'CENA'`, `vacctValidDt/Tm`. Sukses = `resultCd '0000'`; respons field **camelCase**: `tXid`, `vacctNo` (bukan `txId`/`vaccNo`), `transTm`, `referenceNo`, `amt`, `bankCd`.
- **`referenceNo` TIDAK unik di NICEPAY** → idempotensi wajib di sisi kita.
- Inquiry: `POST /direct/v2/inquiry` (`tXid`+`referenceNo`+`amt`). **`resultCd '0000'` BUKAN penanda lunas**; penentu = `status` (`0` paid, `1` reversal, `3` unpaid, `4` expired/cancel). `depositDt` ada di inquiry (tidak ada di notifikasi).
- Cancel: `POST /direct/v2/cancel` (`tXid`+`amt`, `cancelType '1'`) → sukses **hanya kalau VA belum pernah dibayar**; kalau sudah → `resultCd '9330'` (VA sudah dibayar) → cukup tutup lokal, bukan error fatal.
- Notifikasi: `POST` **form-urlencoded** ke `dbProcessUrl`, User-Agent `Jakarta Commons-HttpClient/3.1`, field: `merchantToken, goodsNm, referenceNo, transTm, tXid, amt, vacctNo, instmntType, billingNm, matchCl, vacctValidDt, payMethod, bankCd, currency, instmntMon, vacctValidTm, transDt, status`; `status '0'` = deposit, `matchCl '1'` = nominal cocok. **Datang ~90 detik** setelah bayar → butuh jalur Inquiry manual ("Cek status").
- Masa berlaku: `vacctValidDt` **10 tahun (2036) DITERIMA** → "VA tidak ada expired" bisa diwujudkan.
- Sandbox `IONPAYTEST` = **auto-paid**: registrasi → inquiry `status 3` → `status 0` dalam hitungan detik (harus siap-siap-order di DB).
- SDK `nodejs-nicepay@1.1.1` (`node_modules/nodejs-nicepay/lib/`): `SecondApiVersion.requestAPI(body, endPoint)` menambah sendiri `timeStamp`+`iMid`+`merchantToken` (jadi **jangan kirim manual**); `requestPayment` = SNAP kartu (tak dipakai); `helper.generateMerchantToken` = hash SHA256 hex (dipakai ulang untuk token notifikasi); `Helper` **tidak** diekspor `index.js` → satu-satunya jalan ke hash = `secondVersion.helper`; `clientSecret` ≠ `merchantKey` (token pakai `merchantKey`; `clientSecret`/`privateKey` hanya untuk access token SNAP); `requestAPI` reject dengan objek response axios (`err.status`, `err.data`) → **cek `resultCd` selalu**, jangan andalkan HTTP status.
- Cara uji: ngrok + `next dev`; `NICEPAY_DB_PROCESS_URL` harus menunjuk tunnel hidup (repo masih menyimpan URL ngrok lama).

### 13b. Keputusan yang dikunci (21 Okt 2026)
1. Opsi A timestamp: `process.env.TZ = 'Asia/Jakarta'` di `lib/payments/nicepay.ts` (bukan fungsi timestamp sendiri).
2. `merchantKey` (bukan `clientSecret`) di constructor `SecondApiVersion`; `isProduction` dari env `NICEPAY_IS_PROD === '1'`.
3. Panggil NICEPAY lewat `requestAPI` (token & timestamp dihitung SDK) → **tidak** menulis `merchantToken`/`tokenCancel`/`timeStamp` sendiri. Helper buatan sendiri hanya: `tokenNotifikasi`, `verifikasiTokenNotifikasi`, `parseNotifikasi`.
4. `gateway_ref` transfer = **`trx:<tXid>`** (deviasi dari rancangan `sha256(tXid|amt|transDt|transTm)`) → notifikasi & inquiry menghasilkan kunci idempotensi sama → tak bisa dobel catat. Bayar manual = `manual:<uuid>`.
5. Role: **buat VA** = `seo`,`cso`,`branch_manager`; **catat bayar** = `seo`,`cso`,`branch_manager`,**`finance`** (PRD FR-05b butuh Finance untuk cash). Finance **tidak** boleh buat VA.
6. VA dibuat otomatis saat `metode_pembayaran === 'VA'`; **gagal VA tidak menggagalkan pesanan** → response `warning`.
7. Status order **tidak** diubah otomatis saat lunas; `status_history` tidak disentuh M1.
8. `closing.kota`/`kode_pos` tetap NOT NULL (wajib di form + API); `closing.wilayah` → `lokasi.id_lokasi` (FK lewat `migrasi_closing_billing.sql`, belum di-run).

### 13c. Kontrak DB (diverifikasi 21 Okt 2026 via probe, bukan asumsi)
- RPC `public.buat_va_pending(p_order_id uuid, p_total numeric, p_reference_no text, p_raw jsonb) → uuid` — exception `ORDER_TIDAK_ADA|BATAL|SUDAH_LUNAS|NOMINAL_INVALID`; membuat baris `PENDING` (`sumber='VA'`), **tidak** mengisi `va_number`/`gateway_ref` (diisi app setelah NICEPAY sukses).
- RPC `public.catat_bayar(p_order_id uuid, p_total numeric, p_sumber text, p_gateway_ref text, p_verified_by uuid, p_nama_pembayar text, p_nama_bank text, p_va_number text, p_raw jsonb) → text` — kode hasil `OK|LUNAS|DUPLIKAT|LEBIH_BAYAR|BATAL|ORDER_TIDAK_ADA|NOMINAL_INVALID|SUMBER_INVALID`; `p_sumber` hanya `MANUAL|VA`; `DUPLIKAT` = `gateway_ref` sudah dipakai.
- View `v_status_pembayaran_order` — kolom persis: `id_pesanan, tipe_pembayaran, harga_final, total_terbayar, sisa_bayar, status_bayar` (probe 9 kandidat kolom: `sudah`/`total_bayar`/`sisa` **tidak ada**). `total_terbayar` = Σ`PAID&PAYMENT` − Σ`PAID&REFUND`; baris `PENDING` tidak dihitung → **sumber hitung tunggal** (dipakai app + kedua RPC) → jangan diubah.
- **Grant sudah dikunci**: `has_function_privilege('anon', …) = false` untuk kedua RPC (verifikasi via query; probe: anon → HTTP 401 `permission denied`) → RPC hanya boleh lewat service role. `revoke execute` **sudah** dijalankan di DB.
- **Auth header**: secret key baru (`sb_secret_…`) **wajib lewat header `apikey`** (Bearer saja → 401); `createAdminClient()` (supabase-js) aman. Key lama (sudah dihapus) masih ada di `.env` → harus diganti.
- Tabel `orders`/`closing`/`pembayaran` = **0 baris** (siap uji); `lokasi` 2 (PUSAT, BDG-RAYA); `users` 2 (role di `app_metadata`, kolom `users` cuma `id/role/is_active`).
- Yang belum: `alter view public.v_status_pembayaran_order set (security_invoker = on);` + `notify pgrst, 'reload schema';` (view masih owner-security → anon bisa baca `id_pesanan`+nominal + sisa).

### 13d. Kode yang ada sekarang
- `lib/payments/nicepay.ts` — lapisan protokol: client SDK, `tokenNotifikasi`/`verifikasiTokenNotifikasi`/`parseNotifikasi`, `callApi` (pola `okCodes`, `['0000','9330']` untuk cancel), `buatVa`/`inquiry`/`batalVa`, tipe `NicepayResult` (`{ok:true,data}` | `{ok:false,error,status,code?}` — gaya repo `OrderResult`). Sisa 2 lint: `import { Currency }` tak terpakai + `require` tanpa disable comment.
- `lib/payments/pembayaran.ts` — lapisan bisnis: `sisaTagihan` (view, `null` kalau order tak ada), `vaAktif` (baris PENDING), `dataBilling` (closing→order→lokasi), `buatVirtualAccount` (reuse VA aktif → `buatVa` → RPC `buat_va_pending` → update `va_number`+`gateway_ref`), `tutupVaAktif` (cancel NICEPAY + `INVALID` lokal; baris tidak dihapus), `catatPembayaranManual` (validasi sisa → RPC `catat_bayar`), `catatTransferVa` (verifikasi token → RPC `catat_bayar` → tutup VA bila LUNAS), `cekStatusVa` (inquiry → notifikasi sintetis → catat), `gatewayRefTrx` = `trx:<tXid>`.
- Pengecahan nama field (bug yang sudah diperbaiki, jangan dibalik): `tXid` (bukan `txId`), `vacctNo` (bukan `vaccNo`), `vacctValidTm` (bukan `vaccValidTm`), `>` (bukan `>>` untuk batas nominal).

### 13e. Sisa pekerjaan M1
1. **Route** (belum ada, nol importer): `POST /api/orders/[id]/va` (seo/cso/bm), `POST /api/orders/[id]/pembayaran` (`action: manual|cek_status`), `POST /api/webhook/nicepay` (form-urlencoded, **selalu 200**), exemption `/api/webhook/*` di `proxy.ts`, auto-VA + `warning` di `POST /api/closing`.
2. **UI**: badge Lunas/Sisa, panel VA (nomor VA, tombol Buat VA / Catat bayar / Cek status), riwayat pembayaran.
3. **DB**: jalankan `alter view … set (security_invoker = on)` + `notify pgrst`; (opsional) file migrasi SQL untuk rekonstruksi RPC bila DB baru.
4. **Uji**: closing metode VA → VA otomatis; inquiry sebelum/sesudah bayar; notifikasi duplikat → 1 baris; manual > sisa → `LEBIH_BAYAR`; manual sebagian → `ON_PROGRESS`; order BATAL → ditolak; CSO lokasi lain → 403; finance catat bayar boleh / buat VA 403; webhook token salah → tidak tercatat; anon panggil RPC → 401 ✓ sudah terverifikasi.
5. **Belum terbukti**: uji sandbox sungguhan (registrasi VA → `resultCd '0000'`, `vacctNo` 16 digit, `transTm` = jam WIB) + print `raw` 1× untuk memastikan nama field respons inquiry (`billingNm` vs `payerName`).

## 14. M1 — Kode pembayaran selesai (22 Okt 2026) — MENUNGGU UJI MANUAL
> Status: `tsc` bersih · `eslint` bersih (sisa 2 error pre-existing) · `next build` sukses. Semua route & UI sudah ada; **belum pernah dites end-to-end** (butuh tunnel ngrok + sandbox).

### 14a. Keputusan yang dikunci (22 Okt 2026)
1. **Default metode bayar tetap `VA`** → tiap closing baru otomatis daftar VA ke NICEPAY.
2. **`no_hp` format lokal `08…`**: `NO_HP = /^08\d{8,10}$/` (lib/closing.ts:25 → total 10–12 digit, bukan `+62…`) → cocok dengan `billingPhone` NICEPAY. Pesan error "No HP diawali 08 dan minimal 10 angka" + `maxLength={14}` **konsisten** dengan regex. PENTING: format ini **tidak boleh balik** ke `+62` tanpa update regex + `pattern` input + pesan error. (Catatan §14f soal selisih wording — sudah resolved: regex yang benar `^08\d{8,10}$`, bukan `^08\d{10,12}$`.)
3. **`kode_pos` & `no_hp` tetap `text`** (bukan int): nol di depan & format 5 digit harus utuh (`01100` → int jadi `1100`). Jaminan digits-only datang dari regex, bukan tipe kolom.
4. **`closing.kota` & `closing.kode_pos` = NOT NULL** (probe) → wajib diisi form; `closing.wilayah` nullable → diisi `auth.idLokasi`.
5. **Role**: buat VA = `seo,cso,branch_manager`; catat bayar = +`finance` (PRD FR-05b). Finance tak boleh buat VA.
6. **Status order TIDAK diubah otomatis saat lunas** (§13b.7) → sinyal lunas = badge + panel; FR-06 "siap produksi" belum.
7. **Revoke SELECT sudah dijalankan user** (22 Okt): `closing, orders, order_lines, order_olahan, pembayaran, v_order_totals, v_status_pembayaran_order` → anon 401 ✓ (probe publishable key). View sudah `security_invoker=on` (probe 13c usang). Tabel master/operasional (`inventory, paket, stock_lokasi, mutasi_stock, v_stock, pengajuan, users, status_history, order_items, lokasi, olahan, olahan_item, pengeluaran_gudang`) **masih publik** — revoke opsional (tidak merusak app: semua baca via service role).
8. **Auto-VA pakai `buatVirtualAccount`** (bisnis), BUKAN `buatVa` (protokol) — `buatVa` tak sentuh DB (tak ada baris `pembayaran`, tak idempoten, tak bisa dibatalkan).

### 14b. File yang berubah (22 Okt 2026)
- `lib/closing.ts` — `NO_HP` (08-based) + `KODE_POS` (5 digit) + `isKotaValid` (tak boleh kosong) + `isKodePosValid`. **Pesan validasi TIDAK disimpan sebagai konstanta** (keputusan user 22 Okt: "jangan hard code") → kalimat ditulis langsung di dalam `if`/`return` di form & API. Aturan (regex + validator) tetap terpusat di sini supaya tak melenceng; kalimat ada 2x (form & API) dan harus kept in sync manual.
- `app/(app)/closing/tambah/form-closing-baru.tsx` — field Kota + Kode Pos, body POST kirim `kota` + **`kode_pos`** (bukan `kodePos`). **Opsi 3 (22 Okt)**: atribut `pattern` **dihapus** (bubble native "Please match the requested format." tak informatif) → validasi format pindah ke JS: pesan inline di bawah field saat `onBlur` (`aria-invalid` + `aria-describedby`), `maxLength`/`inputMode="numeric"` tetap; `validateExtra` jadi jaring kedua saat submit. `required` tetap (bubble "Please fill out this field" cuma untuk field kosong).
- `app/api/closing/route.ts` — validator kota/kode_pos (400), trim, `insert` closing ikut `kota,kode_pos,wilayah=auth.idLokasi`, **auto-VA** saat `metode_pembayaran==='VA'` (gagal → `warning`, tak menggagalkan pesanan), response `+va_number`.
- `app/api/orders/[id]/va/route.ts` (BARU) — POST, role seo/cso/bm, scope (SEO=cso_id self, CSO=same id_lokasi), tolak `BATAL`, `buatVirtualAccount` → `{va_number,total_bayar,reused}`.
- `app/api/orders/[id]/pembayaran/route.ts` (BARU) — POST, role seo/cso/bm/finance, `action:'manual'` → `catatPembayaranManual` (nominal = sisa, nama, bank), `action:'cek_status'` → `cekStatusVa`; balas `{ok,code,message,sisa_bayar}`.
- `app/api/webhook/nicepay/route.ts` (BARU) — POST form-urlencoded, tanpa sesi, **selalu 200** (NICEPAY retry kalau non-200), verifikasi `merchantToken` (satu-satunya bukti), order = `referenceNo` (= `id_pesanan`), idempoten `trx:<tXid>`.
- `lib/auth/access.ts` — `PUBLIC_ROUTES += '/api/webhook'` (proxy tak boleh demand sesi untuk webhook).
- `lib/payments/types.ts` (BARU) — tipe bersama (`PembayaranRow`, `Tagihan`, `KodeBayar`, `NicepayResult`, `VaInput`, `NotifikasiVa`, …) dipisah dari `pembayaran.ts`/`nicepay.ts` (yang `server-only`) → tak boleh diimpor client component. Hanya `types.ts` yang diekspor; `pembayaran.ts` **import saja, tanpa re-export**.
- `lib/payments/pembayaran.ts` — `+tagihanBatch` & `+riwayatBatch` (1 query per sumber, bukan per order); `PembayaranRow` += `nama_pembayar/nama_bank/created_at`.
- `lib/payments/nicepay.ts` — `isProduction: false` **hardcoded** (ikut docs NICEPAY; env `NICEPAY_IS_PROD` dihapus dari `.env`); `require()` diberi disable comment (SDK CJS tanpa tipe).
- `app/(app)/orders/_components/panel-bayar.tsx` (BARU) — badge lunas/sisa, nomor VA + salin, tombol **Buat VA**/**Cek status**, form **Catat bayar** (nominal default = sisa), riwayat pembayaran.
- `app/(app)/orders/page.tsx` — `metode_pembayaran` ikut select; 2 query batch pembayaran → props; `canPay`/`canMakeVa` per role.
- `app/(app)/orders/daftar-orders.tsx` — badge **Lunas** di samping pill status + `<PanelBayar>` di blok Rincian.
- `app/(app)/closing/page.tsx` + `daftar-closing.tsx` — 1 baris ringkas per order (`lunas`/`sisa Rp…` + `VA …`) supaya nomor VA kelihatan dari daftar Closing.
- `.env` — **tanpa** `NICEPAY_IS_PROD` (isProduction hardcoded di kode). ⚠️ File ini sempat rusak (Add-Content menyambung baris `NICEPAY_DB_PROCESS_URL`) → sudah dirapikan; **jangan pakai `Add-Content` untuk .env**.

### 14c. Uji manual yang MASIH harus dijalankan ( Checklist )
1. Tunnel ngrok hidup → `NICEPAY_DB_PROCESS_URL` (`/api/webhook/nicepay`).
2. CSO → Closing baru (no HP `08…`, kota, kode pos 5 digit, metode VA) → `va_number` terisi; VA tampil di `/closing` + `/orders`.
3. Sandbox `IONPAYTEST` auto-paid → **Cek status** → badge Lunas; riwayat 1 baris `PENDING` (VA) + 1 baris `PAID`.
4. Notifikasi duplikat → tetap 1 baris (`gateway_ref` unik).
5. Notifikasi `merchantToken` salah → tidak tercatat, tetap 200.
6. Catat bayar > sisa → `LEBIH_BAYAR`; sebagian → `ON_PROGRESS`; order `BATAL` → ditolak.
7. Finance: catat bayar boleh / buat VA 403. CSO lokasi lain 403.
8. Probe anon `GET /rest/v1/orders` → 401 ✓ (sudah terbukti).

### 14d. Sisa pekerjaan (belum dikerjakan)
1. **SQL opsional** (user, Dashboard): `alter table public.closing add constraint closing_no_hp_check check (no_hp ~ '^08[0-9]{8,10}$'), add constraint closing_kode_pos_check check (kode_pos ~ '^[0-9]{5}$');` (tabel 0 baris → aman; regex **wajib selaras** dengan kode `^08\d{8,10}$`) + `notify pgrst, 'reload schema';`.
2. **`orders.harga_final` int4** → batas Rp 2.147.483.647; order Grosir/Reseller yang lewat itu akan overflow → `alter column harga_final type numeric(14,2)` (keputusan user belum).
3. **Revoke SELECT** tabel master/operasional (opsional, §14a.7).
4. **Fallback `billingPhone`**: kalau sandbox menolak `08…`, normalisasi ke `62…` di `dataBilling` (1 baris).
5. **NICEPAY prod** (belum; jangan sentuh sebelum semua uji sandbox hijau): (a) `lib/payments/nicepay.ts` → `isProduction: true` (1 literal — `Config` milih `www.nicepay.co.id`, selama `false` sistem selalu kena endpoint dev), (b) `.env`: `NICEPAY_MERCHANT_ID`/`NICEPAY_MERCHANT_KEY` prod + `NICEPAY_DB_PROCESS_URL` prod, (c) uji webhook prod sekali (notifikasi sungguhan + inquiry), (d) rotasi/retir secret sandbox.
6. **PRD FR-06** "order masuk tahap produksi" — badge lunas sudah jadi sinyal; auto-`diproses` belum (§13b.7).
7. **Rotasi secret** bila dianggap bocor: `SUPABASE_SERVICE_KEY` & `NICEPAY_MERCHANT_KEY` pernah tercetak prefix-nya di output terminal (22 Okt 2026).

### 14e. Fix hydration error (22 Okt 2026)
Error: *"Hydration failed because the server rendered text didn't match the client"* (ditunjuk di `order-sections.tsx`, padahal itu turunan dari `OrderForm` → `BayarSection` yang nilainya datang dari draft). **3 sumber mismatch**, semuanya diperbaiki:
1. **`hooks/use-draft.ts`** (penyebab langsung) — `useState(() => baca(key))` membaca `localStorage` **di inisialisasi state** → render pertama client ≠ HTML server. Diganti `useSyncExternalStore` (server & render pertama client sama-sama pakai `getServerSnapshot` = tanpa draft; snapshot = **string mentah** supaya referensial stabil; parsing saat render). Bonus: sinkron antar-tab sungguhan (event `storage` + event lokal `EV_DRAFT`) — hook lama cuma menulis, tak pernah membaca perubahan tab lain meski docstring menjanjikan.
2. **`lib/utils/format.ts` `fmtDate`** — `toLocaleDateString('id-ID')` tanpa `timeZone` → server (Vercel **UTC**) vs browser (**WIB**) beda tanggal: `2026-10-22T20:00Z` → 22/10 (UTC) vs 23/10 (WIB). Ditambah `timeZone: 'Asia/Jakarta'`.
3. **`lib/closing.ts` `tenggatLabel` + `daftar-orders.tsx` `terlambat` + `inventory/stock/daftar-stock.tsx` `statusExp`** — `new Date().toDateString()` = "hari" lokal server vs browser → badge H-1/H-2 bisa beda. Dibuat helper `hariWIB()` (hari dalam zona WIB, ada di **`lib/closing.ts:64`** — bukan `lib/utils/format.ts`) → deterministik di semua zona.
- **Bonus (bug prod, bukan hydration)**: `app/(app)/orders/[id]/ubah/page.tsx` `toLocalInput` pakai `getFullYear/getHours` (zona server) → di prod (UTC) jadwal geser **7 jam** saat ditampilkan di form. Diganti konversi eksplisit UTC+7.
- Bukti determinisme: `hariWIB`/`fmtDate`/`tenggatLabel` menghasilkan output **identik** di TZ `UTC`, `Asia/Jakarta`, `America/New_York` (dicek via `node --experimental-strip-types`).

### 14f. Pesan validasi per kolom (22 Okt 2026) — Opsi B
Semua pesan validasi form **pindah ke kolomnya masing-masing** (bukan satu area di bawah form). `TotalBar` (order-sections.tsx:601) kini hanya untuk error **global** (balasan API, "Jaringan bermasalah").
- **Kontrak baru**: `order-form.tsx` → `export type FieldErrors = Record<string, string>`; `validateExtra?: (v) => FieldErrors` (ganti `string | null`); prop baru `onFieldErrors?: (errs) => void`.
- **`order-form.tsx`**: `ownErrors()` Holds validasi milik OrderForm (paket, daging, jeroan, kirim, tiba, tanggal, metode) → peta; `submit()` merge `ownErrors()` + `validateExtra()` → kalau ada isinya: `setFieldErrors` + `onFieldErrors` + **tidak submit**; `clearErr(key)` supaya pesan hilang begitu field diperbaiki.
- **`order-sections.tsx`**: `PaketSection` +`error`; `OlahanSection` +`errorDaging`/`errorJeroan`; `BayarSection` +`errorMetode`/`errorTanggal`/`errorKirim`/`errorTiba` — tiap slot `<p className="text-sm text-red-600">` + `aria-invalid` + `aria-describedby`.
- **`form-closing-baru.tsx`**: 2 state `errHp`/`errPos` → **satu** `fieldErrors` (peta, kunci = nama field); `<p>` per kolom di `nama, no_hp, alamat, kota, kode_pos, jenis_customer` (+ `sumber`, `email` tanpa pesan); `validateExtra` → peta.
- **`form-ubah-order.tsx`**: `validateExtra` dihapus (validasi metode kini di `OrderForm`).
- **API** (`app/api/closing/route.ts`): balasan 400 field-level sekarang `{ error, field }` → wrapper menandai **kolom yang tepat** (`setFieldErrors({ [field]: error })`), pesan tetap muncul di bawah form juga.
- Kalimat "minimal 10 angka" vs regex — **SELESAI**: regex di kode `NO_HP = /^08\d{8,10}$/` (total 10–12 digit) + `maxLength={14}` + pesan "diawali 08 dan minimal 10 angka" → konsisten. (Catatan lama yang menyebut `^08\d{10,12}$` usang.)

## 15. Refactor `lib/` + fitur yang belum terdokumentasi (22 Okt 2026)
### 15.1. Restrukturisasi `lib/` (pecah file, logika preservasi)
8 file flat di HEAD (`access`, `auth`, `format`, `order-status`, `orders`, `inventory`, `pusat`, `pengajuan`) dihapus → 5 subfolder baru (`auth/`, `inventory/`, `orders/`, `payments/`, `utils/`; `supabase/` sudah ada). Perbandingan baris-per-baris dengan `git show HEAD:<path>`: identik (kecuali `resolve.ts` yang sudah punya guard resep).
- `lib/access.ts` → `lib/auth/access.ts` (`ROUTE_ACCESS`, `ROUTE_LABELS`, `COMMON_ROUTES`, `PUBLIC_ROUTES`, `HOME_BY_ROLE`, `publicRoute()`, `canAccess()`).
- `lib/auth.ts` → `lib/auth/auth.ts` (`requireRole` + `requireApiRole`, `server-only`).
- `lib/format.ts` → `lib/utils/format.ts` (`fmtRp`, `fmtNum`, `fmtDate` + `timeZone:'Asia/Jakarta'`).
- `lib/order-status.ts` → `lib/orders/status.ts` (`ORDER_STATUS`, `TIPE_BAYAR`, `METODE_PEMBAYARAN` — **client-safe**, tanpa `server-only`).
- `lib/orders.ts` → `lib/orders/{create,persist,resolve,status,types,update}.ts`: `create.ts` = `createOrderFromDetail()`; `persist.ts` = `insertRincian()` + `cleanupOrder()`; `resolve.ts` = `resolveRincian()` (satu sumber hitung + cek stok + guard resep); `update.ts` = `updateOrderRincian()`; `types.ts` = `OrderResult`, `RincianOk`, `AddonIn`, `InventoryIn`, `RincianIn`, `OrderDetailIn`, `EditRincianIn`.
- `lib/inventory.ts` → `lib/inventory/inventory.ts` (`cocokkanSku()` pure + `resolveSku()` nama→SKU master).
- `lib/pusat.ts` → `lib/inventory/pusat.ts` (`catatMasuk`, `ubahMinStock`, `hapusStokLokasi` — **nama fn bukan `hapusStokPusat`**).
- `lib/pengajuan.ts` → `lib/inventory/pengajuan.ts` (lihat 15.3).
- `lib/payments/{nicepay,pembayaran,types}.ts` — **baru langsung di subfolder** (tak pernah flat); lihat §14b.

### 15.2. CRUD Resep — SUDAH IMPLEMENTASI FULL (bukan read-only lagi)
- `lib/resep.ts` (BARU): `listResep()` (paket PAKET aktif + `paket_items` + master `inventory` + stok `v_stock` per lokasi), `addResep()` (validasi paket aktif/PAKET, SKU ada, qty integer ≥1, anti-duplikat `(id_paket,sku)`), `updateResepQty()` (qty saja, **tanpa PUT**), `deleteResep()`.
- `app/api/resep/route.ts` (BARU): `GET` (cso, filter `q`, `limit` 1–30), `POST`, `PATCH`, `DELETE` — **semua role `cso`**.
- `app/(app)/resep/[idPaket]/page.tsx` + `form-resep.tsx`: tabel bahan (SKU/nama/qty/satuan/stok), edit-inline qty, tombol Hapus, form Tambah + saran SKU (debounce 300 ms, ↑↓/Enter/Escape).
- `app/(app)/resep/daftar-resep.tsx`: grouping per nama paket + badge **"N tanpa resep — order ditolak"** + link "Edit resep".
- **Guard anti lolos sunyi** (butir §10 "Terbuka" — SUDAH): `lib/orders/resolve.ts:68` → order ditolak `Paket belum punya resep - isi di menu Resep dulu`. Add-on tanpa resep tetap lolos (sesuai komentar).

### 15.3. Alur pengajuan restock — 6 status (bukan 3)
Status: `DIAJUKAN → DISETUJUI → DIKIRIM → DITERIMA`, plus `DITOLAK` & `DIBATALKAN` (CHECK di `migrasi_pengajuan_restock.sql` baris 31). `DIBATALKAN` hanya untuk data lama; app tidak lagi menulis status ini.
- `lib/inventory/pengajuan.ts`: `buatPengajuan()`, `setujuiPengajuan()` (RPC), `kirimPengajuan()` (DISETUJUI→DIKIRIM, **tanpa** gerakan stok), `tolakPengajuan()`, `terimaPengajuan()` (DIKIRIM→DITERIMA), `batalPengajuan()` (CSO tarik, hanya saat DIAJUKAN).
- `app/api/pengajuan/[id]/route.ts` PATCH `aksi`: `setuju`/`kirim`/`tolak` (role inventory) + `terima` (role cso, lokasi sama → 403 bila beda). `batal` bukan aksi yang valid.
- `app/api/pengajuan/route.ts` — `DELETE` (BARU): CSO tarik pengajuannya (`?id=`).
- Pisah responsibility: **Setujui & Kirim = pusat (inventory)**; **Terima = cabang (CSO)**; **Batalkan = CSO pemilik saat DIAJUKAN**. Inventory tidak boleh membatalkan.

### 15.4. API & komponen lain yang belum pernah didokumentasikan
- `app/api/inventory/search/route.ts` (BARU): `GET ?q=&limit=` (role seo/cso), scoping `stock_lokasi` per `id_lokasi`, join `inventory(sku,nama_barang,satuan)`, sanitasi karakter `or()` (`%(),` dibuang), limit 1–50. Dipakai form resep & form pengajuan sebagai dropdown saran.
- `app/(app)/inventory/_components/`: `form-stok.tsx` (modal "Tambah Data" adaptif: mode Terdaftar/Baru, SKU auto, satuan, tanggal exp, validasi inline), `input-cls.ts` (`inputCls` — class string input bersama), `status-stock.ts` (`StockKind` normal/low/habis, `PILL_STOCK`, `KIND_LABEL` Aman/Menipis/Habis, `emptyMsg()`, `statusStock()`).
- `app/(app)/orders/_components/panel-bayar.tsx` (BARU): badge `LUNAS`/`ON_PROGRESS`/`BELUM_BAYAR` + "Sisa Rp…", blok VA (nomor + Salin + Cek status), form **Catat bayar** (nominal default = sisa, nama, bank), tombol **Buat Virtual Account** (hanya saat `metode==='VA'` && belum ada VA && belum lunas), riwayat pembayaran (tanggal, nominal, sumber `transfer VA`/`manual`, nama, bank, pill `PAID`/`PENDING`). Dirender hanya di dalam blok "Rincian" (`daftar-orders.tsx:536`).
- `app/api/closing/route.ts`: kolom `kota`,`kode_pos`,`wilayah` ikut select+insert; validator field-level (400 `{error, field}`); **auto-VA** saat `metode_pembayaran==='VA'` → gagal = `warning` (tak menggagalkan pesanan); response `+va_number`; `warnings[]` (no-HP duplikat digabung dengan warning VA).
- `app/(app)/closing/tambah/page.tsx`: tambah query `lokasi(nama, jenis)` — **hasilnya tak dipakai** (dead query, belum dibersihkan).

## 16. Selisih vs PRD (per 23 Okt 2026)
- **Nespay → NICEPAY**: PRD §5 FR-05 masih menyebut Nespay; implementasi = **NICEPAY non-SNAP** (§13a). PRD belum diperbarui — koreksi dokumentasi, bukan kode.
- **FR-04 (VA/Cash)** ✓ ter-cover (VA NICEPAY + catat bayar manual).
- **FR-05 (webhook)** ✓ ter-cover (notifikasi NICEPAY + Inquiry manual "Cek status").
- **FR-05b (konfirmasi Cash)** ✓ ter-cover (catat bayar manual oleh finance/cso).
- **FR-06** ✗ **belum**: badge lunas = sinyal, auto-`diproses` belum (§13b.7, §14d.6).
- **FR-08 (dashboard Branch Manager)** ✗ belum; **FR-11 (reset password mandiri pengguna)** ✗ belum (Could Have; tanpa modul Admin)
- **FR-01/02/03/07/12** ✓ ter-cover.
- **FR-ADD (draft)** ter-cover parsial (add-on + `harga_final` sudah ada; status desain masih DRAFT di PRD §5).

## 17. M2 — Normal VA per-attempt (23 Okt 2026)
> Keputusan: **bukan** Static/Fix Open. MID hanya mendukung `Created VA Type = Normal`, jadi setiap customer mau bayar dibuat VA baru.

- 1 VA = 1 percobaan bayar; nominal = sisa tagihan saat VA dibuat; berlaku 1x24 jam.
- VA lama dibatalkan lebih dulu lewat `/direct/v2/cancel`; kalau NICEPAY balas `9330` (sudah dibayar), lakukan inquiry/rekonsiliasi sebelum membuat VA baru.
- Setelah pembayaran VA/manual (termasuk sebagian), VA aktif dinonaktifkan; pembayaran berikutnya wajib VA baru.
- Pembayaran telat ke VA lama tetap dicari lewat `va_number` (baris `INVALID`), supaya uang tidak hilang. Selisih lebih bayar dicatat `INVALID` dengan `gateway_ref=overpay:<tXid>`.
- Order `BATAL` ikut membatalkan VA aktif.
- Tidak ada kolom/tabel baru; `va_customer_id`, endpoint static, dan migrasi DB tidak dipakai.
- UI: tombol **Buat VA** / **Ganti VA**, riwayat menandai `kelebihan bayar` / `order batal`.
- Status: `tsc` bersih; lint hanya error pre-existing. **Belum E2E**; checklist: VA pertama → ganti VA → bayar → webhook → pembayaran manual sebagian → VA baru untuk sisa → duplikat/overpay → cancel gagal → order BATAL.

## 18. ~~Rencana~~ — VA cicilan + verifikasi pembayaran VA lama (DIGANTI §19)
> Status: **DIBATALKAN 26 Okt 2026**. Rencana VERIFY/antrean setujui-tolak tidak dipakai.
> Diganti **Opsi A: VA cicilan tanpa VERIFY** — lihat §19.
> Fokus: VA saja. Pembayaran cash/transfer manual tetap seperti sekarang.

### 18.1. Keputusan yang disepakati
1. Customer memilih nominal cicilan; **staff** yang menginput nominal.
2. Tidak ada VA otomatis saat closing/order dibuat.
3. Satu VA aktif per order. Jika staff membuat VA baru, VA lama dibatalkan lebih dulu.
4. Tidak ada VA otomatis setelah pembayaran; staff membuat VA berikutnya.
5. Nominal: `> 0` dan `<= sisa`; tidak ada minimum khusus.
6. VA berlaku 1 hari (sampai 23:59:59 WIB besok).
7. Pembayaran ke VA aktif: webhook langsung sah, sisa berkurang, tanpa verifikasi staff.
8. Pembayaran ke VA lama/expired: ditahan sebagai `VERIFY`; belum mengurangi sisa.
9. Verifikasi: `finance` + `branch_manager`; setuju/tolak.
10. Setuju: pembayaran masuk, sisa berkurang, kelebihan dicatat, VA aktif ditutup.
11. Tolak: sisa tetap, dana ditandai perlu refund manual.
12. Webhook jalur utama; “Cek status” manual cadangan; belum ada cron.
13. Pembayaran telat ke VA lama tetap dicatat (setelah verifikasi), tidak hilang.
14. UI antrean verifikasi: **belum final**; saran panel order + badge daftar order (opsi 1).

### 18.2. Alur target
1. Order dibuat dengan metode VA → **tidak ada VA**.
2. Customer setuju bayar Rp X → staff input X di panel.
3. Server validasi; cancel VA aktif (jika ada); buat VA Nicepay nominal X; RPC `buat_va_pending` dengan `p_total = X`.
4. Customer bayar VA X.
5. Webhook:
   - VA aktif → `catat_bayar` otomatis; tutup VA; sisa turun.
   - VA lama/expired → insert baris `VERIFY`; **jangan** panggil `catat_bayar`; **jangan** tutup VA aktif.
6. Jika webhook telat/gagal untuk VA aktif → staff klik “Cek status” → inquiry → catat.
7. Finance/BM melihat antrean `VERIFY` → setujui/tolak.
8. Setuju → catat pembayaran `applied = min(total, sisa)`; catat overpay; tutup VA aktif; update baris `VERIFY`.
9. Tolak → update baris `VERIFY`; tandai perlu refund; VA aktif tetap.
10. Staff buat VA berikutnya saat customer mau bayar lagi.

### 18.3. Perubahan kode yang direncanakan
- `lib/payments/pembayaran.ts`
  - `buatVirtualAccount(admin, orderId, nominal?)`:
    - `nominal` opsional; `undefined` = sisa penuh (kompatibel dengan pemanggil lama).
    - validasi `Number.isFinite`, bulat, `> 0`, `<= sisa` **sebelum** cancel.
    - setelah cancel, baca ulang sisa; tolak `NOMINAL_INVALID` jika `nominal > sisa` baru.
    - gunakan `nominal` untuk `buatVa` dan `p_total`.
  - `catatTransferVa`:
    - bedakan VA aktif vs VA lama/expired.
    - VA aktif: perilaku sekarang (auto `catat_bayar`, tutup VA).
    - VA lama: insert baris `VERIFY` (`gateway_ref` mis. `hold:<tXid>`, `raw_payload.kind='LATE_VA'`), tidak mengubah sisa, tidak menutup VA aktif.
    - idempoten: `hold:<tXid>` unik; webhook duplikat tidak dobel.
  - `cekStatusVa`: tetap untuk VA aktif; **belum** mencakup VA lama. Opsi lanjutan: cek per baris VA lama / tombol di riwayat.
  - Fungsi baru `verifikasiPembayaranVa(admin, orderId, idBayar, aksi, verifiedBy)`:
    - hanya untuk baris `VERIFY`.
    - setuju: hitung `applied = min(total_bayar, sisa)`; catat PAID via `catat_bayar`/insert; catat overpay; tutup VA aktif; update baris `VERIFY`.
    - tolak: update baris `VERIFY` + `raw_payload.kind='LATE_VA_REJECTED'`; sisa tetap; VA aktif tetap.
- `app/api/orders/[id]/va/route.ts`
  - terima `body.total` opsional; kirim ke `buatVirtualAccount`.
- `app/api/orders/[id]/pembayaran/route.ts`
  - tambah action `verifikasi_va` (atau route baru) dengan `id_bayar` + `aksi: 'setuju'|'tolak'`; guard `finance`/`branch_manager`.
- `app/api/closing/route.ts`
  - hapus/disable auto-VA di sekitar baris 159; `va_number` null; warning lain tetap.
- `app/(app)/orders/_components/panel-bayar.tsx`
  - input **Nominal VA** untuk role pembuat VA; default/placeholder = VA aktif atau sisa; validasi client.
  - tombol Buat/Ganti VA mengirim `{ total }`.
  - blok **VERIFY** untuk finance/BM: nominal, VA, waktu, tombol Setujui/Tolak.
  - label riwayat: `va:` = penerbitan VA, `trx:` = transfer VA, `hold:` = menunggu verifikasi, `overpay:` = kelebihan; sembunyikan/beri label VA `INVALID` yang sudah diganti.
  - badge “Perlu verifikasi” (jika opsi 1).
- `progress.md`
  - update status setelah implementasi, bukan sekarang.

### 18.4. Data/DB
- `v_status_pembayaran_order` hanya menghitung `PAID&PAYMENT` → baris `VERIFY` aman tidak menambah sisa.
- Jangan pakai `PENDING` untuk baris `VERIFY`: `vaAktif` menganggap PENDING sebagai VA aktif dan unique partial index bisa bentrok. Perlu status baru `VERIFY` (atau mekanisme setara) + update CHECK constraint/UI/query. **Migrasi diperlukan** untuk status ini; belum ada file migrasi.
- RPC `buat_va_pending` perlu dicek: apakah menerima `0 < p_total <= sisa`. Jika memaksa `p_total = sisa`, perlu migrasi untuk melonggarkan. Ini prasyarat eksekusi.
- `catat_bayar` tetap dipakai untuk mencatat pembayaran yang disetujui; idempotensi lewat `gateway_ref`.
- Baris `VERIFY` harus punya `gateway_ref` unik (mis. `hold:<tXid>`) agar webhook duplikat tidak dobel.
- Tidak perlu tabel cicilan baru.

### 18.5. Edge case yang harus dijaga
- Nominal `> sisa`, `<= 0`, atau desimal → tolak.
- VA lama sudah dibayar saat staff klik Ganti VA → inquiry/rekonsiliasi; jangan buat VA baru dengan nominal basi.
- VA aktif sudah dibayar saat webhook VA lama masuk → VA lama ditahan; VA aktif ditutup setelah verifikasi disetujui.
- Dua pembayaran masuk berurutan → andalkan `catat_bayar`/`LEBIH_BAYAR` dan idempotensi.
- Pembayaran lama > sisa → `applied = sisa`, selisih overpay.
- Order `BATAL` → VA aktif ditutup; pembayaran VA lama yang masuk **belum diputuskan** (saran: tahan/refund, jangan auto).
- VA expired tetapi masih PENDING lokal → anggap tidak aktif; pembayaran ditahan.
- Webhook gagal untuk VA lama → belum ada jalur “Cek status”; catat sebagai risiko/pekerjaan lanjutan.
- Manual cash/transfer tetap menutup VA aktif seperti sekarang.

### 18.6. Uji yang direncanakan
- Closing VA → tidak ada VA otomatis.
- Staff buat VA Rp1 jt dari sisa Rp3,1 jt → bayar → webhook → sisa Rp2,1 jt; tidak ada VA otomatis.
- Staff buat VA Rp2,1 jt → bayar → lunas.
- Ganti VA sebelum bayar → VA lama `INVALID`, VA baru aktif.
- VA aktif dibayar → auto `PAID`.
- VA lama dibayar setelah diganti → baris `VERIFY`; sisa tidak berubah; setuju → sisa turun, VA aktif ditutup; tolak → sisa tetap.
- Overpay: VA lama Rp3,1 jt setelah sisa Rp2,1 jt → applied Rp2,1 jt + overpay Rp1 jt.
- Duplikat webhook → tidak dobel.
- Webhook gagal → “Cek status” VA aktif mencatat.
- Order `BATAL` → VA aktif ditutup.
- Role: finance/BM bisa verifikasi; role lain tidak.
- `npx tsc --noEmit`, `npm run build`, `npm run lint`.

### 18.7. Belum diputuskan
1. Lokasi antrean verifikasi: panel order + badge (saran), halaman khusus, atau keduanya.
2. Status DB untuk `VERIFY`/approved/rejected: status baru vs `raw_payload.kind` + status existing.
3. Perlakuan pembayaran VA lama saat order `BATAL`.
4. Apakah “Cek status” perlu diperluas ke VA lama.
5. Nama aksi/route verifikasi.

### 18.8. Checklist eksekusi
- [ ] Probe RPC `buat_va_pending` untuk nominal parsial.
- [ ] Migrasi status verifikasi (jika diperlukan).
- [ ] Backend `buatVirtualAccount` + API VA.
- [ ] Hapus auto-VA closing.
- [ ] `catatTransferVa` dua jalur (aktif vs lama).
- [ ] Fungsi + API verifikasi.
- [ ] UI nominal VA + antrean verifikasi + label riwayat.
- [ ] Uji sandbox + build/lint.
- [ ] Update progress.md setelah implementasi.

## 19. VA cicilan tanpa VERIFY — dieksekusi 26 Okt 2026
> Keputusan product 26 Okt: pilih **Opsi A**. Verifikasi `VERIFY`/antrean Finance dibatalkan (tidak ada migrasi status). Pembayaran ke VA lama tetap otomatis tercatat seperti §17 — uang tidak ditahan.

- `lib/payments/pembayaran.ts`:
  - `buatVirtualAccount(admin, orderId, nominalDiminta?)` — tanpa nominal = sisa penuh; nominal eksplisit harus integer `>0` dan `<= sisa` (validasi sebelum **dan** sesudah cancel VA lama, karena sisa bisa turun bila VA lama ternyata sudah dibayar). `p_total` + `buatVa.amount` memakai nominal itu. Tidak ada reuse → `reused: false`; `replaced` tetap.
  - `cekStatusVa(admin, orderId, idBayar?)` — `idBayar` diisi = cek VA lama/nonaktif lewat barisnya sendiri; kalau sudah dibayar, pencatatan otomatis sama dengan webhook (`trx:<tXid>`, overpay, tutup VA aktif). Tanpa `idBayar` = VA aktif (perilaku lama).
  - `catatTransferVa` awalnya tidak berubah: VA lama sudah otomatis dicatat lewat `va_number`. Perubahan metadata pengirim ada di §20.
- API: `POST /api/orders/[id]/va` menerima `{ total }` opsional; `POST /api/orders/[id]/pembayaran` `action:'cek_status'` menerima `id_bayar` opsional. `POST /api/closing` **tidak lagi** membuat VA otomatis (`va_number: null`).
- UI `panel-bayar.tsx`: input **Nominal VA (boleh cicilan)** + tombol Buat/Ganti VA mengirim nominal; tombol **Cek dana masuk** (VA aktif) & **Cek dana VA lama** (baris riwayat VA `INVALID`) memanggil inquiry NICEPAY; hasil dibedakan **"Dana masuk — pembayaran tercatat"** vs **"Belum ada dana masuk (NICEPAY: belum dibayar/…)"**, bukan lagi "OK"; label riwayat `VA dibuat` / `tidak aktif`.
- `cekStatusVa` mengembalikan `paid` + `status` NICEPAY; API meneruskannya supaya UI bisa membedakan dana masuk vs belum.
- Prasyarat: jalankan `cek_buat_va_pending.sql` (read-only). Kalau RPC memaksa `p_total = sisa`, longgarkan dulu sebelum uji cicilan.
- Verifikasi kode: `tsc` bersih · lint/build belum dijalankan ulang setelah perubahan ini.
- Uji manual belum: closing VA → tanpa VA; buat VA Rp1 jt dari sisa Rp3,1 jt → bayar → sisa Rp2,1 jt; buat VA kedua → lunas; ganti VA → VA lama `INVALID`; bayar VA lama → tercatat otomatis (webhook) atau lewat Cek status VA lama; overpay → baris `overpay:`; duplikat tidak dobel; Finance buat VA 403.

## 20. Metadata pengirim VA + bank_tujuan (26 Okt 2026)
> NICEPAY non-SNAP **tidak mengirim nama/bank pengirim**. `billingNm` = nama customer, `bankCd` = bank VA. Nama pembayar default = `billingNm`; bank pengirim tetap manual. Jangan memakai `bankCd` sebagai bank pengirim.

- `lib/payments/pembayaran.ts`:
  - `catatTransferVa`: cek `trx:<tXid>` lebih dulu; kalau sudah ada → `DUPLIKAT` tanpa memanggil RPC (metadata manual tidak tertimpa). RPC baru dipanggil dengan `p_nama_pembayar = billingNm` (default customer), `p_nama_bank = null`.
  - Setelah pencatatan, isi `bank_tujuan` baris `trx:<tXid>` dari `va.bank_tujuan ?? notif.bankCd` hanya bila masih `null`.
  - `catatKelebihan`: `nama_pembayar = billingNm`, `nama_bank = null` (bankCd tidak dipakai sebagai bank pengirim).
  - `cekStatusVa`: `bankCd` memakai `va.bank_tujuan` dulu, fallback `raw.bankCd` NICEPAY (bukan string kosong).
- API `POST /api/orders/[id]/pembayaran` `action:'isi_pengirim'`: validasi baris `sumber='VA'`, `status_payment='PAID'`, milik order; simpan `nama_pembayar`/`nama_bank` + penanda `raw_payload.pengirim` (`nama`, `bank`, `oleh`, `at`). Hanya metadata, tidak mengubah total/status.
- UI `panel-bayar.tsx`: riwayat menggabungkan baris `va:<tXid>` yang sudah punya `trx:<tXid>`; baris VA menampilkan pembayar dari `raw_payload.pengirim` → `nama_pembayar` → nama customer, sedangkan bank hanya dari marker manual. Tombol **Isi/Ubah pengirim** muncul untuk VA `PAID`; form manual dilabeli **Nama/Bank pengirim**.
- Backfill bank lama: jalankan `backfill_bank_tujuan.sql` (isi `bank_tujuan` baris `trx:` dari baris `va:` pasangannya).
- Verifikasi kode: `tsc --noEmit` bersih · eslint file terkait bersih · `next build` bersih (26 Okt 2026).
- Uji manual belum: VA paid → isi pengirim → refresh tetap ada; webhook/cek ulang tidak menimpa; baris `va:` yang sudah dibayar tidak dobel di riwayat; `bank_tujuan` baris `trx:` terisi; backfill idempoten.
- Ditunda: dropdown bank pengirim (butuh daftar kode bank + konfirmasi MID).

## 21. Bank VA BCA/Mandiri + pembayar default customer (26 Okt 2026)
> Keputusan user: nama customer dipakai sebagai **pembayar default VA**, tetap bisa diedit lewat tombol **Isi/Ubah pengirim**. Auto-VA saat closing tetap mati.

- `lib/payments/types.ts`: `VA_BANKS` (`CENA`=BCA, `BMRI`=Mandiri), tipe `VaBank`, `isVaBank()`, `vaBankLabel()`; `VaInput.bankCd`.
- `lib/payments/nicepay.ts`: `bankCd` dari input, bukan hardcode `BMRI`.
- `lib/payments/pembayaran.ts`: `buatVirtualAccount(..., bankCd='CENA')`; `bank_tujuan = va.data.bankCd || bankCd`; `catatTransferVa` & `catatKelebihan` mengisi `nama_pembayar` dari `billingNm`, `nama_bank = null`.
- `app/api/orders/[id]/va/route.ts`: terima `bank`, validasi hanya `CENA|BMRI`, default BCA, teruskan ke `buatVirtualAccount`.
- UI `panel-bayar.tsx`: dropdown **Bank VA** (BCA/Mandiri); kontrol VA tampil untuk semua order belum lunas (termasuk `TRANSFER`); riwayat VA menampilkan pembayar default customer, bank pengirim hanya dari marker manual; tombol Isi/Ubah pengirim tetap.
- `daftar-orders.tsx`: kirim `namaCustomer` ke `PanelBayar` sebagai fallback baris lama.
- Tidak ada migrasi SQL. Baris lama dengan `nama_pembayar` null memakai fallback nama customer di UI.
- Verifikasi: `tsc`, eslint, `next build` bersih 26 Okt 2026. Uji manual belum.

## 22. Inventory tidak boleh batalkan pengajuan (26 Okt 2026)
> Keputusan user: role inventory hanya **Setujui/Tolak** pada `DIAJUKAN` dan **Kirim** pada `DISETUJUI`. Pembatalan hanya oleh CSO pemilik saat `DIAJUKAN`.

- `daftar-pengajuan.tsx`: hapus tombol **Batalkan** di `DIAJUKAN`, `DISETUJUI`, dan `DIKIRIM` untuk `mode='pusat'`; `putuskan()` tidak lagi menerima `batal`.
- `PATCH /api/pengajuan/[id]`: aksi `batal` dihapus; payload `{aksi:'batal'}` sekarang `400` (`Aksi harus setuju/kirim/tolak`).
- `lib/inventory/pengajuan.ts`: `batalkanPusat()` dihapus; error RPC `batalkan_pengajuan` tidak mungkin lagi muncul dari UI.
- `DELETE /api/pengajuan` tidak berubah: CSO tetap bisa menarik pengajuan `DIAJUKAN` milik lokasinya.
- Inventory kini melihat baris `DITOLAK` (tab filter + daftar), sebagai jejak keputusan; `DIBATALKAN` data lama tetap disembunyikan.
- Tidak ada migrasi SQL. Fungsi `batalkan_pengajuan` boleh tetap ada/tidak dijalankan karena tidak dipanggil app.
- Verifikasi: `tsc --noEmit` · eslint 3 file terkait · `next build` bersih (26 Okt 2026).
- Uji manual belum: inventory tidak melihat tombol Batalkan; `PATCH {aksi:'batal'}` → 400; Setujui/Tolak/Kirim tetap jalan; CSO Batalkan/Terima tetap jalan.

## 23. Alasan + aktor penolakan pengajuan (26 Okt 2026)
> Pusat wajib mengisi alasan saat menolak; UUID user inventory yang login disimpan di `pengajuan.ditolak_oleh`.

- Migrasi `migrasi_pengajuan_restock.sql` §1d (jalankan ulang, idempotent):
  - `alasan_tolak text`
  - `ditolak_oleh uuid references auth.users(id) on delete set null`
  - `ditolak_at timestamptz`
  - `notify pgrst, 'reload schema'`
- `lib/inventory/pengajuan.ts`: `tolakPengajuan(admin, { id, alasan, oleh })` — trim, wajib 1–500 karakter, update status + metadata. `oleh` selalu dari `auth.userId` server, bukan body client.
- `PATCH /api/pengajuan/[id]`: aksi `tolak` menerima `alasan`; alasan kosong/terlalu panjang → 400.
- UI `daftar-pengajuan.tsx`: tombol **Tolak** membuka textarea alasan + Kirim/Batal (Escape menutup). Baris `DITOLAK` menampilkan alasan dan email penolak; data lama tanpa alasan memakai fallback.
- `page.tsx`: select `alasan_tolak/ditolak_oleh/ditolak_at`; email penolak di-resolve dari `auth.admin.getUserById()` (bukan `public.users`).
- Verifikasi kode: `tsc --noEmit` · eslint 4 file · `next build` bersih (26 Okt 2026).
- Troubleshooting 26 Okt: daftar kosong padahal baris ada = migrasi §1d belum dijalankan (`ERROR 42703: column pengajuan.alasan_tolak does not exist`). `page.tsx` kini menampilkan error query, bukan diam-diam kosong.
- Uji manual belum: jalankan migrasi; inventory tolak tanpa alasan → tombol tidak aktif/400; tolak dengan alasan → DB terisi + CSO melihat alasan/email; user auth dihapus → `ditolak_oleh` null, alasan tetap.

## 24. Notifikasi pengajuan masuk cabang → pusat (RENCANA, belum dieksekusi)
> Keputusan 28 Okt 2026: **polling saja** (tanpa Realtime/Redis) agar hemat free tier Supabase. Penerima: role `inventory` (pusat). Fokus: pengajuan restock berstatus `DIAJUKAN`.

- Sumber event: `POST /api/pengajuan` oleh CSO → baris `pengajuan` status `DIAJUKAN`.
- UI: badge jumlah + toast “X pengajuan baru” di `/inventory/history` saat count naik; baseline di-reset setelah aksi setuju/tolak/kirim.
- Polling 45–60 detik; hentikan saat `document.hidden`; refetch saat tab kembali visible.
- Query ringan: count `DIAJUKAN` + list existing; jangan ambil semua kolom tiap polling.
- Index disarankan: `pengajuan(status, created_at)` atau `(status, id_lokasi, created_at)`.
- Tanpa Redis pada fase ini; pertimbangkan hanya jika volume naik dan query count terukur mahal.
- Catatan: `pengajuan` = 1 baris per item. Badge memakai jumlah baris `DIAJUKAN`; jika notifikasi harus per batch, perlu count `distinct batch_id` via RPC.
- File rencana:
  - `app/(app)/inventory/history/daftar-pengajuan.tsx` — interval, baseline, badge/toast, pause saat hidden.
  - `app/(app)/inventory/history/page.tsx` — initial count/rows.
  - `app/api/pengajuan/route.ts` — GET opsional `?status=DIAJUKAN` atau endpoint count ringan.
- Checklist eksekusi:
  - [ ] Tambah query count/status.
  - [ ] Implement polling + baseline + toast/badge.
  - [ ] Tambah index DB.
  - [ ] Uji: CSO buat pengajuan → pusat dapat notifikasi; approve → badge turun; tab hidden berhenti polling; tidak ada notifikasi ganda.
- Status: **belum dieksekusi**.


## 25. Notifikasi sidebar badge & tabel pengajuan (dieksekusi)
- Role inventory: badge pending DIAJUKAN di sidebar via NotifikasiProvider (realtime + initial fetch; polling/listener redundant dihapus).
- Tab filter di history pengajuan (mode pusat) menampilkan Semua paling kanan.
- Nama tab menu inventory (role inventory) menjadi Pengajuan Restock; cso tetap History Pengajuan.
- Judul halaman masih History Pengajuan (opsional ganti ke Pengajuan Restock).
- Cleanup dead exports isJenisCustomerValid, isSumberValid.

### Role yang ada (app_metadata.role / ROUTE_ACCESS)
- seo
- cso
- inventory
- finance
- branch_manager
- branch_operation
