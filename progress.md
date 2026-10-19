# Progress RAMS (Rumah Akikah Management System)

Terakhir update: 13 Okt 2026 (stok otomatis trigger + resep + audit over-engineering). Sumber acuan: `PRD.md`. Istilah resmi: **Closing** (tabel `closing`; `leads` usang).

## 1. PRD dibaca
- MVP = alur Order inti: SEO input closing → CSO input order + tunai/cicilan → produksi manual via WA → laporan BM.
- Out of scope awal: integrasi WA/Qontak, analitik prediktif, migrasi historis, pengajuan stock ke pusat, Qurban.
- Gap vs PRD: VA/Cash + webhook Nespay (FR-04/05) belum — kode pakai `tunai/cicilan`; diputuskan dikerjakan setelah Fase A CSO.

## 2. Desain lokasi/stock (diputuskan)
- `lokasi(id_lokasi, nama, jenis PUSAT|CABANG, is_active)` — seed: PUSAT + BDG-RAYA (ejaan resmi id lokasi; nama tampil `Bandung Raya` dari DB).
- `inventory` = master (`sku, nama_barang, satuan`); angka per lokasi di `stock_lokasi(id_lokasi, sku, stock, hpp_average, min_stock)`. Ejaan resmi: **dengan `k`**.
- Lokasi user di `auth.users.app_metadata.id_lokasi` (Opsi A), set via SQL Editor; wajib re-login setelah ubah.
- Aturan: sama di semua cabang → `inventory`; beda per cabang → `stock_lokasi`.

## 3. Status DB aktual
- Ada: `lokasi(PUSAT+BDG-RAYA), inventory, stock_lokasi, paket(+jumlah_hewan, sebagian NULL), paket_items, olahan(+kategori), olahan_item, closing(+email_customer), orders(+closing_id, +id_lokasi, +customer_email), order_lines, order_olahan, order_items, users(id+role, tanpa id_lokasi — benar), status_history`.
- Transaksional (`closing/orders/lines/history`) kosong — mulai bersih 8 Okt 2026.
- Dibuang: `orders.sumber_informasi` (selalu NULL), `orders.closer_id` (kosong), tabel `closers` (tak terpakai; pelaku = `created_by/cso_id/changed_by → users`).
- Status & jenis UPPERCASE (dikunci 13 Okt 2026, DB dimigrasi manual): `orders.status`/`closing.status` = PENDING/DIPROSES/SELESAI/BATAL/BARU (sumber: `lib/order-status.ts`, `lib/closing.ts`); `mutasi_stock.jenis` = MASUK/KELUAR/BATAL. Trigger Bagian 6 ikut uppercase.
- Stok otomatis via TRIGGER (aktif 13 Okt 2026, `migrasi_v2_2_fungsi.sql` Bagian 6): `trg_order_items_stok` potong saat item ditulis / kembalikan saat item dihapus; `trg_orders_batal_stok` kembalikan semua saat status → `batal` (tolak dari `terkirim`/`selesai`, tolak keluar dari `batal`). App (`lib/orders.ts`) TIDAK panggil RPC — hanya tulis `order_items` + validasi ramah di depan (create: penuh; edit: selisih vs stok yang dipegang). `keluar_barang_cabang` NONAKTIF (pemakaian ganda = potong 2x). Desain stok simple: `paket_items` = box per varian (Sultana = box sultana + bento, qty = porsi); kambing milik vendor, di luar stok.
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
- `lib/auth.ts`: `requireRole()` (halaman → redirect) + `requireApiRole()` (API → 401/403 JSON) via `getClaims()`, return `{ userId, role, idLokasi }`.
- `lib/supabase/admin.ts` ada (service-role, server-only). List page + API baca via admin client + filter kode (pola baku; user-client terbukti rapuh untuk nested RLS).
- `lib/access.ts` = satu-satunya definisi menu + hak (`ROUTE_ACCESS`, `ROUTE_LABELS`, `HOME_BY_ROLE`, `canAccess`); dipakai layout sidebar + `proxy.ts`. SEO: `/closing + /orders`. CSO: `/closing + /orders + /inventory/cabang` (+ `/resep` saat menu resep dieksekusi).
- `status_history(order_id → orders.id_pesanan cascade, from/to/changed_by)` — dibuat via Dashboard, FK cascade terverifikasi.

## 6. Pesanan — halaman `/orders` (operasi, selesai)
- Status bebas 5 nilai (tanpa `canTransition`; dead code dihapus). Otorisasi: ubah status `cso,branch_manager`; ubah isi `seo,cso`; Finance/BM read-only (kontrol disembunyikan bila tak berhak).
- Scope baca: SEO = buatannya (`cso_id=self`); CSO = se-`id_lokasi` (tanpa lokasi → semua); Finance/BM = semua.
- `Semua` = semua status pesanan (chip per-status tetap ada; badge deadline + pill tenggat hanya order aktif). Strip pipeline: chip Semua/status/Terlambat (klik = filter). Subjudul ikut filter. Deadline chip hanya order aktif.
- Kartu nota lengkap: nama + badge + tenggat, strip paket + olahan, kontak 1 baris (email/alamat/Masuk di expand), Total, tombol item/Ubah, kontrol status, rincian harga di expand (subtotal paket + add-on + diskon + total).
- Daftar selalu segar: pola render-adjust sinkron props + update optimistik `ubahStatus` (lint repo melarang setState di effect).
- API: `PATCH /api/orders/[id]/status` (status + tulis history, scope lokasi CSO) dan `PATCH /api/orders/[id]` (edit isi penuh, tolak terminal 400; SEO hanya miliknya 403).
- `lib/orders.ts`: satu sumber hitung (`resolveRincian`), tulis (`insertRincian`), edit (`updateOrderRincian`); `/orders/[id]/ubah` = form sama + prefill (customer read-only, terminal → notice).
- Live join `paket(tipe,anak,porsi,jenis,jumlah_hewan)` di `order_lines` (tanpa migrasi).

## 7. Keputusan penting (log ringkas 8 Okt 2026)
- Admin-client + filter kode sebagai pola baca (ganti user-client yang gagal nested RLS untuk CSO).
- `BDG-RAYA` ejaan resmi; file migrasi disamakan; DB konvergen tanpa migrasi data.
- Kolom/tabel mati dibuang; `siap_produksi` dibuang (sinyal lunas → badge bayar + auto `diproses` Fase E).
- Closing = CRM ringkas, Pesanan = dapur detail (pembeda dikunci setelah sempat konvergen).
- Semua build hijau; lint = sisa pre-existing (`forbidden/page.tsx`, `hooks/use-mobile.ts`, stub `forgotpassword`, `_headers` di `server.ts`) — disepakati dibiarkan.
- [14 Okt 2026] Integrasi WA/Qontak DIBATALKAN permanen (PRD §4) — koordinasi produksi & follow-up bayar via WA manual selamanya; jangan usulkan lagi.

## 8. Todo (12 Okt 2026)
1. Uji end-to-end (data kosong → input 1 closing dulu): login SEO buat closing+order → login CSO lihat se-lokasi → ubah isi (tambah add-on, cek `harga_final`) → ubah status bebas → cek `orders.status` + 1 baris `status_history`; Finance PATCH status (403); SEO buka order CSO (tak tampil di list; PATCH 403).
2. Prasyarat Fase B via Dashboard: jalankan `migrasi_v2_2_fungsi.sql` Bagian 2 (`mutasi_stock, pengeluaran_gudang, v_stock, RPC`) + verifikasi.
3. Fase B: `/inventory/cabang` read-only (FR-02) — SELESAI 12 Okt 2026 (API `cabang/route.ts` + `page.tsx` + `daftar-inventory.tsx` tabel/filter/badge; `tsc` bersih). Sisa verifikasi manual: CSO cocok `v_stock`, SEO 403.
4. Data master: isi `paket.jumlah_hewan` yang masih NULL (ekor varian itu = 0); diskusi label per-SEO (pengganti email interim).
5. [Fase E — Pembayaran, DIPUTUSKAN 12 Okt 2026] `orders.va_number text unique` (PK tetap uuid; tanpa `va_expired_at`); `pembayaran(order_id, va_number, jumlah>0, sumber manual|webhook, idempotency_key unique)`; aturan: tolak lebih-bayar (`Σ+jumlah > harga_final`), cicilan sah, lunas dari `pending` → otomatis `diproses` + history; `POST /api/orders/[id]/pembayaran` (`cso,finance`) + `POST /api/webhook/nespay` (secret, 1 fungsi `catatBayar()` di `lib/`); view `v_order_bayar` + UI riwayat Terbayar/Sisa + badge lunas. Terbuka: batas jumlah cicilan/minimal DP; sumber `event_id` Nespay untuk idempotency.
6. [Fase D — VA Nespay, setelah Fase E] Generate 1 VA per order saat CSO pilih metode VA; webhook lookup `va_number` → insert `sumber='webhook'` (nama pengirim/bank diabaikan); order `batal` tolak setoran baru walau VA hidup.
7. [Pengajuan restock Pusat → Cabang — SELESAI kode 15 Okt 2026, tinggal jalankan SQL + uji] Arah diputuskan: cabang meminta, pusat mengirim. Skema ikut tabel Dashboard: `pengajuan` satu baris per item (`id_pengajuan` PK, `id_lokasi`, `status DIAJUKAN/DISETUJUI/DITOLAK`, `created_by` uuid polos, `sku`, `qty`, `nama_barang` snapshot) — keputusan Setujui/Tolak per baris. `migrasi_pengajuan_restock.sql` (Dashboard, idempotent): index + `mutasi_stock.order_id` nullable + `setujui_pengajuan()` atomik per baris (kunci baris, PUSAT kurang → cabang tambah via `barang_masuk`, mutasi KELUAR+MASUK; gagal = batal semua). App: `lib/pengajuan.ts` (buat isi `nama_barang` dari master; tolak flip guarded), `POST/GET /api/pengajuan` (cso se-lokasi; inventory semua), `PATCH /api/pengajuan/[id]` (inventory saja), `/inventory/pengajuan` (CSO form ketik-nama + saran dropdown, tanpa SKU — server petakan nama→SKU, tolak bila tak dikenal/ambigu; master 29 nama unik; inventory daftar + Setujui/Tolak + stok PUSAT per baris; saran dipoles (highlight cocok, keyboard ↑↓/Enter, status Mencari/kosong, chip konfirmasi + ganti). `lib/access.ts`: inventory hanya menu ini. Sisa: jalankan SQL (tabel sudah ada, yang penting Bagian fungsi), uji matriks (buat → setuju → cek stock_lokasi dua sisi + mutasi; tolak; stok pusat kurang; CSO lokasi lain 403).

## 9. Berikutnya (disepakati 7 Okt 2026)
- Fase B: `/inventory/cabang` read-only (FR-02). Fase C: konfirmasi Cash (FR-05b). Fase D: VA + webhook Nespay (FR-04/05, butuh key).
- Prasyarat Fase B via Dashboard: jalankan Bagian 2 (`mutasi_stock, pengeluaran_gudang, v_stock, RPC`).

## 10. Resep paket & pengisian sekali (dikunci 13 Okt 2026)
- Butir `paket_items` = pasangan (id_paket, sku), `qty` = kebutuhan per 1 paket (mis. box per porsi × porsi varian). Add-on ikut aturan sama (add-on juga baris `paket`). Bumbu olahan lewat `olahan_item` (kunci id_olahan, rumus per porsi) — dikosongkan dulu, no-op aman.
- Aturan isi: Sultana = 2 baris (BOX NASI SULTANA GDG-009 + Box Bento GDG-006, masing-masing × porsi); varian lain = 1 baris box-nya × porsi. SKU boleh dipakai ulang antar varian (sharing ditangani `group by sku` di trigger/`resolveRincian`); box tanpa baris `stock_lokasi` ditolak fail-closed (`Stok tidak cukup`).
- Pengisi = Inventory/admin, sekali via Dashboard (CSO tak tersentuh; form CSO tanpa input resep). Kambing milik vendor, di luar stok. Box master: GDG-006–011 (Bento, Gold, Magenta, Sultana, V.01, V.03).
- Perubahan resep hanya memengaruhi order baru (`order_items` lama = snapshot qty + HPP).
- Menu `/resep` (CSO saja, read-only dulu): `page.tsx` + `daftar-resep.tsx` + 2 baris `lib/access.ts`; tanpa API baru. Naik ke CRUD: `POST /api/resep` (tambah), `PATCH` (ubah qty saja), `DELETE` (hapus) — PUT tidak dipakai; validasi paket aktif + SKU ada + qty > 0 + anti-duplikat (id_paket, sku); riwayat tak bisa dirusak dari menu ini.
- Terbuka: guard tolak order bila paket tanpa resep (anti lolos sunyi); isi `olahan_item` saat dapur serahkan takaran; prasyarat tetap Query 1 → 0 baris + cakupan resep/stok per varian sebelum uji potong.

## 11. Gudang Pusat → menu Stock (SELESAI kode 15 Okt 2026, tinggal uji manual)
- Konsolidasi: form + tabel + riwayat kini satu menu `/inventory/stock` (role inventory). Tombol **+ Tambah Data** membuka modal (`Dialog` `@base-ui/react`, sudah di-deps) berisi form adaptif (mode Terdaftar/Baru, SKU auto GDG-plus-1, validasi inline, satu tombol Simpan). Menu `/inventory/pusat` DIHAPUS total (rute + akses + `HOME_BY_ROLE`); API `app/api/inventory/pusat` tetap (dipakai halaman Stock).
- `lib/pusat.ts` (`catatMasuk` unifikasi baru/existing, `ubahMinStock` upsert, `hapusStokPusat` stok-0); `lib/inventory.ts` resolver shared; tabel ada pencarian + Hapus baris stok-0 + banner menipis/habis.
- Kolom **Satuan** di tabel Stock (dari `v_stock`, tanpa ubah query) + field Satuan selalu tampil di modal: terisi otomatis saat nama cocok master; barang baru → ikut insert master (default `Pcs`); barang terdaftar → update master bila diubah.
- Sisa uji: inventory Tambah Data (baru + existing), Setujui pengajuan cabang, CSO 403, hapus baris-0.

## 12. Error & koreksi buku (ditemukan 16 Okt 2026)
- [ERROR-1 — bypass approval, buku inkonsisten] 2 pengajuan DITERIMA 15 Okt (Kertas Nasi GDG-021 ×100, BOX SULTANA GDG-009 ×500) status jalan penuh tapi **nol mutasi transfer** di kedua sisi; stok PUSAT utuh (184.500/4.700 = angka seed). Dugaan: flip status manual via Dashboard saat testing, lewat tanpa RPC `setujui_pengajuan`. Perlu jurnal koreksi manual (PUSAT KELUAR + cabang MASUK) setelah 3 fakta dikonfirmasi: tombol-UI vs manual? fisik sampai cabang? GDG-009 cabang=500 itu stok lama atau transfer ini?
- [ERROR-2 — versi fungsi live belum pasti] `migrasi_v2_2_fungsi.sql` §§2–4 + `migrasi_pengajuan_restock.sql` §§1c–2–5 (termasuk fix `stok_lokasi`→`stock_lokasi`, `barang_masuk` + `tanggal_exp`, RPC `batalkan_pengajuan`, CHECK 6 status) sudah dikoreksi di repo tapi **belum di-run** di Dashboard. Verifikasi: cek definisi live `setujui_pengajuan` (ada blok keluar/terima? ejaan apa?) + uji 1 pengajuan qty-1 via UI.
- [OPEN] Seed Bagian B oleh user via Dashboard jalan (MASUK 16 Okt masuk); catat: qty GDG-031/GDG-032 beda dari `seed_normalisasi_pusat.sql` — pastikan disengaja. Transfer cabang MASUK `tanggal_exp` NULL (audit terputus di transfer; diterima sadar, carry-over opsional).
- Aturan main: ubah status pengajuan hanya via tombol app, jangan flip manual di Dashboard (langkah kirim/terima lolos tanpa RPC sehingga bypass tidak ketahuan).
