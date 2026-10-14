# [PRD] Sistem Manajemen Terpadu Rumah Akikah

## 1. Executive Summary & Context
- **Product Name / Feature:** Rumah Akikah Management System (RAMS)
- **Target Release:** MVP — Modul Order Flow Inti (fase 1)
- **Status:** Draft
- **Authors & Key Stakeholders:** NUMB (Product Owner / Developer), SEO, CSO, Inventory, Finance, Branch Manager, Admin

## 2. Problem Statement & Business Opportunity
- **What problem are we solving?**
  Operasional Rumah Akikah saat ini tersebar di banyak aplikasi terpisah (Website, Jurnal.id, Zains, Data Looker, Odoo), sementara WA dan Qontak tetap menjadi kanal komunikasi customer. Data antar role tidak saling terhubung secara real-time — misalnya Finance tidak bisa langsung mengecek status pembayaran suatu order tanpa berpindah aplikasi, dan Branch Manager tidak punya satu tempat untuk memantau seluruh operasional (order, stock, pembayaran, produksi).
- **Why now?**
  Semakin banyak lead masuk, proses manual lintas-aplikasi ini rawan miss-communication (misal: stock sudah reserve tapi belum tercatat di Inventory, atau pembayaran valid tapi Vendor Masak belum menerima info order). Menyatukan sistem sekarang mencegah biaya integrasi yang makin mahal ke depan.
- **Target Audience / User Persona:**
  - **CSO** — menerima lead, input order (dengan visibilitas stock real-time), generate VA pembayaran, update status produksi manual berdasarkan info dari Vendor Masak (via WA)
  - **Inventory** — mengelola & update angka stock yang tersedia per paket; menetapkan batas minimum stock (minStock) per barang dan menerima pengingat saat stock mencapai batas tersebut
  - **Finance** — memantau status pembayaran (terverifikasi otomatis via webhook Nespay), menindaklanjuti pembayaran invalid
  - **Vendor Masak** — **tidak memiliki akses sistem**; koordinasi produksi (terima, proses, kirim) tetap dilakukan via WA ke CSO
  - **Branch Manager** — memantau laporan transaksi & operasional lintas role
  - **SEO** — login & input data lead (nama, no. HP, sumber) setelah closing di WA, sebelum diteruskan ke CSO
  - **Admin** — role terpisah (bukan rangkap role operasional lain), mengelola user, role, dan permission di dalam sistem

## 3. Goals & Success Metrics (KPIs)
- **Primary Metric (North Star):** Waktu rata-rata dari "lead masuk" sampai "order terverifikasi & masuk tahap produksi" berkurang signifikan dibanding proses lintas-aplikasi saat ini.
- **Secondary Metrics:**
  - Jumlah order yang tercatat ganda atau tidak sinkron antar role → mendekati 0
  - Waktu verifikasi pembayaran oleh Finance (dari pembayaran masuk sampai status ter-update)
  - Waktu Branch Manager mendapatkan laporan transaksi (real-time vs manual rekap)
- **Guardrail Metrics (Non-Goals):**
  - Tidak boleh ada data order yang hilang saat migrasi dari sistem lama
  - Downtime sistem saat jam operasional tidak boleh mengganggu proses penerimaan pembayaran

## 4. Scope & Phasing (MVP vs Future Scope)
- **In-Scope (P0 / MVP) — Modul Order Flow Inti:**
  - Input lead oleh SEO, lanjut jadi order oleh CSO (data customer prefill dari Lead), dengan validasi stock real-time saat order dibuat
  - Support order walk-in (tanpa Lead, "Datang Langsung") dengan input data customer langsung di form Order
  - Update angka stock oleh Inventory
  - Generate Virtual Account (VA) pembayaran, atau tandai pembayaran Cash untuk walk-in
  - Verifikasi pembayaran otomatis via webhook Nespay (khusus VA); pembayaran Cash dikonfirmasi manual oleh CSO/Finance
  - Role-based login & access control (SEO, CSO, Inventory, Finance, Branch Manager)
- **In-Scope (P1):**
  - Update status produksi manual oleh CSO (berdasarkan koordinasi WA dengan Vendor Masak)
- **In-Scope (P2):**
  - Dashboard laporan Branch Manager (agregat order, pembayaran, operasional)
  - Modul manajemen user & role oleh Admin
- **In-Scope (P3 — pengganti fungsi Jurnal.id):**
  - Modul akuntansi/keuangan (jurnal, laporan keuangan formal)
- **Out of Scope (fase awal):**
  - Fitur analitik prediktif (forecast permintaan, deteksi anomali) — dipertimbangkan setelah data operasional terkumpul
  - Migrasi historis penuh dari Odoo/Zains (data lama tetap diakses di sistem asal bila diperlukan)
  - **Pengajuan stock ke pusat** — proses ini tetap dilakukan di luar sistem (manual/aplikasi lama) untuk fase awal
  - **Transaksi Qurban** — bisnis juga melayani Qurban, tapi sistem fokus ke Akikah dulu; field & alur khusus Qurban (misal Nama Ayah) ditunda ke fase mendatang
- **Dibatalkan permanen (14 Okt 2026, keputusan product):**
  - Integrasi otomatis dengan WA & Qontak **tidak jadi** di fase mana pun. WA tetap kanal komunikasi manual permanen di luar sistem: koordinasi produksi CSO ↔ Vendor Masak (FR-07) dan follow-up pembayaran invalid ke customer (FR-12) selamanya manual via WA. Tidak ada adapter/webhook WA di P1–P3.

## 5. User Journey & Functional Requirements

### Epic / High-Level User Flow:
1. Customer closing di WA → 2. SEO input data lead ke sistem → 3. CSO ambil lead, input order & pilih paket (stock sudah terlihat real-time di UI) → 4. CSO generate VA & kirim ke customer → 5. Customer bayar → 6. Nespay mengirim webhook, sistem otomatis update status pembayaran → 7a. Jika valid, CSO koordinasi ke Vendor Masak via WA → 7b. Jika invalid, customer dihubungi untuk mengulang pembayaran (loop ke langkah 5) → 8. CSO update status produksi di sistem berdasarkan info dari Vendor Masak → 9. Branch Manager menerima laporan transaksi.

### Feature Specifications:
| ID | Fitur | User Story | Acceptance Criteria (Gherkin format) | Prioritas (MoSCoW) |
|:---|:---|:---|:---|:---|
| FR-01 | Input Order | Sebagai CSO, saya ingin input order dari lead agar tercatat di sistem | **Given** lead sudah masuk, **When** CSO input data order, **Then** order tersimpan dengan status "pending" | Must Have |
| FR-02 | Visibilitas Stock Real-Time | Sebagai CSO, saya ingin melihat stock yang tersedia saat input order agar tidak salah pilih paket | **Given** CSO membuka form order, **When** memilih paket, **Then** jumlah stock tersedia untuk paket itu langsung terlihat | Must Have |
| FR-03 | Validasi & Update Stock Otomatis | Sebagai sistem, saya ingin mengurangi stock secara otomatis & aman saat order dibuat | **Given** order baru disubmit, **When** stock paket tersedia (≥1), **Then** stock berkurang atomically & order tersimpan; **jika stock 0**, order ditolak dengan pesan error | Must Have |
| FR-04 | Generate Pembayaran (VA/Cash) | Sebagai CSO, saya ingin generate VA atau tandai Cash agar customer bisa membayar sesuai metode yang dipilih | **Given** order sudah masuk data lengkap, **When** CSO pilih Payment Method, **Then** sistem generate VA (jika VA) atau langsung buka opsi konfirmasi tunai (jika Cash) | Must Have |
| FR-04b | Data Order Lengkap | Sebagai CSO, saya ingin input Alamat, Email, dan Jenis Customer saat membuat order agar data transaksi lengkap untuk laporan | **Given** CSO membuat order, **When** mengisi form, **Then** Alamat & Jenis Customer wajib diisi, Email opsional | Must Have |
| FR-05 | Verifikasi Pembayaran Otomatis (VA) | Sebagai sistem, saya ingin menerima notifikasi pembayaran otomatis dari Nespay agar tidak perlu cek manual | **Given** customer membayar VA, **When** Nespay mengirim webhook, **Then** status pembayaran ter-update otomatis (valid/invalid) tanpa aksi manual Finance | Must Have |
| FR-05b | Konfirmasi Pembayaran Cash | Sebagai CSO/Finance, saya ingin menandai pembayaran Cash sebagai valid secara manual karena tidak ada webhook untuk metode ini | **Given** order memakai Payment Method Cash, **When** CSO/Finance konfirmasi tunai diterima, **Then** status pembayaran langsung menjadi "valid" | Must Have |
| FR-06 | Order Masuk Tahap Produksi | Sebagai CSO, saya ingin order otomatis berubah status setelah pembayaran valid agar saya tahu kapan harus koordinasi ke Vendor Masak via WA | **Given** pembayaran ditandai valid, **When** status order berubah, **Then** order tampil di daftar "siap produksi" milik CSO | Should Have |
| FR-07 | Update Status Produksi Manual | Sebagai CSO, saya ingin update status pesanan berdasarkan info dari Vendor Masak (via WA) agar Branch Manager tahu progres | **Given** CSO menerima info progres dari Vendor Masak via WA, **When** CSO update status di sistem, **Then** status tersimpan (diproses/selesai) | Should Have |
| FR-08 | Dashboard Laporan | Sebagai Branch Manager, saya ingin melihat ringkasan transaksi & operasional lintas role | **Given** ada order baru/berubah status, **When** Branch Manager buka dashboard, **Then** data ter-update tanpa perlu rekap manual | Should Have |
| FR-09 | Role-Based Access Control | Sebagai admin sistem, saya ingin tiap role hanya mengakses data sesuai kewenangannya | **Given** user login dengan role tertentu, **When** mengakses sistem, **Then** hanya menu & data sesuai role yang tampil | Must Have |
| FR-10 | Manajemen User & Role | Sebagai Admin, saya ingin membuat/menghapus akun user dan menetapkan role agar akses sistem terkontrol | **Given** ada karyawan baru/keluar, **When** Admin tambah/hapus user, **Then** user tersebut langsung mendapat/kehilangan akses sesuai role | Should Have |
| FR-11 | Reset Password & Audit Akses | Sebagai Admin, saya ingin reset password user dan melihat log akses agar keamanan sistem terjaga | **Given** user lupa password atau ada aktivitas mencurigakan, **When** Admin cek/reset, **Then** password ter-reset & log akses tercatat | Could Have |
| FR-12 | Pembayaran Invalid → Ulang Bayar | Sebagai CSO/Finance, saya ingin menghubungi customer saat pembayaran invalid agar customer bisa membayar ulang | **Given** webhook menandai pembayaran invalid, **When** CSO/Finance menghubungi customer, **Then** order tetap berstatus "pending" menunggu pembayaran ulang (bukan dibatalkan) | Should Have |
| FR-ADD (DRAFT 25 Sep 2026, belum dikunci) | Additional & Upgrade Isi Box | Sebagai CSO, saya ingin menambah item opsional berbayar (snack box, souvenir, buah, tumisan, mix ayam & telur) ke order agar harga final terhitung otomatis | **Given** order paket sudah dipilih, **When** CSO tambah add-on + qty, **Then** `hargaFinal` = harga paket + Σ(qty × hargaSatuan add-on) − diskon; add-on fisik mengurangi stock, add-on makanan tidak | Should Have |

> **Catatan:** Pengajuan stock ke pusat (sebelumnya FR-09) dipindah ke Out of Scope fase awal — proses ini tetap dilakukan di luar sistem.

## 6. Non-Functional & Operational Requirements
- **Performance & Latency:** Waktu respon endpoint order/payment maksimal 500ms pada kondisi normal.
- **Security & Privacy:** Autentikasi berbasis JWT dengan role di dalam token; data pembayaran customer dienkripsi saat disimpan; endpoint webhook Nespay divalidasi menggunakan signature/secret agar tidak bisa dipalsukan pihak luar.
- **Reliability:** Backup database harian; status order tidak boleh hilang jika terjadi kegagalan sistem.
- **Concurrency:** Pengurangan stock saat order dibuat harus atomic untuk mencegah race condition ketika dua order merebut stock terakhir secara bersamaan.
- **Auditability:** Setiap perubahan status order (dari SEO, CSO, Finance) tercatat dengan timestamp & user yang melakukan perubahan, untuk kebutuhan audit Branch Manager.
- **Stock Reminder:** Setiap barang memiliki batas minimum stock (minStock) yang ditetapkan manual oleh Inventory (bukan ambang persentase — tiap barang jumlahnya berbeda). Sistem memberi pengingat in-app saat stock ≤ minStock. Barang tanpa minStock (NULL) tidak dicek.

## 7. Risks, Assumptions, & Open Questions
- **Assumptions:**
  - Semua role bersedia bermigrasi dari aplikasi lama (Website, Jurnal.id, Zains, Data Looker, Odoo) ke sistem baru secara bertahap sesuai fase.
  - **Tidak ada migrasi data historis** — sistem dimulai dari nol (pure baru) per tanggal go-live. Data stock, order, dan pembayaran mulai dicatat murni dari sistem baru.
- **Dependencies:**
  - WA & Qontak tetap kanal komunikasi manual permanen di luar sistem (integrasi otomatis dibatalkan 14 Okt 2026).
  - Data historis di Odoo/Jurnal.id/Zains tetap bisa diakses secara terpisah (read-only) bila sewaktu-waktu dibutuhkan untuk referensi, tapi tidak di-import ke sistem baru.
- **Open Questions:**
  - Setelah MVP (P0) selesai, urutan pengerjaan P1–P3 tetap mengikuti fase yang sudah disepakati, atau ada prioritas yang berubah?
  - Nilai awal minStock per barang ditentukan siapa/kapan? (Usulan: saat seed dikosongkan/NULL, diisi bertahap oleh Inventory; berlaku untuk barang pusat dulu, cabang menyusul bila dibutuhkan.)
  - [FR-ADD 25 Sep 2026] Desain add-on dikunci? (Usulan: `Item(isAddon)` + `OrderItem`, tanpa tabel baru.) Snack Box = 1 baris atau per isi? Souvenir distock gudang atau vendor?
