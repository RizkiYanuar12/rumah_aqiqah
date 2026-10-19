-- SEED NORMALISASI GUDANG PUSAT (Opsi 1) — jalankan di Dashboard > SQL Editor
-- Sumber: Data Barang Gudang Pusat RA_September.xlsx (24 barang, 7 grup A-G)
-- Aturan: stock = kolom L "Saldo/Total setelah DO 23/9/26" (Payung None→0). Total = 412.161 pcs
--   min_stock = NULL (diisi Inventory bertahap), hpp_average = 0 (koreksi via barang_masuk)
-- Bagian A = normalisasi master (idempotent). Bagian B = seed stock (Opsi 2, eksekusi terpisah).

-- ---------------------------------------------------------------- A1. Kategori yang masih NULL di master (isi dari grup Excel)
update inventory set kategori = 'Tools Marketing'  where sku = 'GDG-023'; -- Map Sertifikat (grup D)
update inventory set kategori = 'Packaging'         where sku = 'GDG-027' and kategori is null; -- Plastik Kresek Sultana (grup B)
update inventory set kategori = 'Perlengkapan Makan' where sku = 'GDG-028' and kategori is null; -- Risalah Lembar Doa (grup C)
update inventory set kategori = 'Tools Marketing'  where sku = 'GDG-029' and kategori is null; -- Sertifikat Aqiqah (grup D)

-- ---------------------------------------------------------------- A2. Barang baru (GDG-030+, ON CONFLICT aman diulang)
insert into inventory (sku, nama_barang, kategori, satuan) values
  ('GDG-030', 'Box Nasi Regular (Gold/Pink)', 'Box Nasi', 'Pcs'),   -- Excel A2, L=0
  ('GDG-031', 'Plastik Regular RA', 'Packaging', 'Pcs'),            -- Excel B1, L=0
  ('GDG-032', 'Sertifikat Gold (Baru)', 'Tools Marketing', 'Pcs'),  -- Excel D1, L=1900
  ('GDG-033', 'Sertifikat Magenta', 'Tools Marketing', 'Pcs'),     -- Excel D3, L=150
  ('GDG-034', 'Payung RA', 'Payung RA', 'Pcs'),                    -- Excel G1, L=None→0
  ('GDG-035', 'Boneka + Tas Boneka', 'Boneka RA', 'Pcs')            -- Excel F2, L=1900
on conflict (sku) do nothing;

-- ---------------------------------------------------------------- A3. Mapping Excel → SKU (referensi, tidak dieksekusi)
-- Bento Box → GDG-006 Box Bento (L=1150) | Box Nasi Magenta → GDG-008 (L=90750)
-- Box Nasi Sultana 2 → GDG-009 (L=4700) | Cincin Bento → GDG-018 (L=4285)
-- Plastik Sultana → GDG-027 (L=0) | Kertas Nasi → GDG-021 (L=184500)
-- Alat Makan → GDG-002 (L=27000) | Lembar Doa Sultana → GDG-022 (L=2676)
-- Risalah & Lembar Doa → GDG-028 (L=87000) | Map Sertifikat → GDG-023 (L=4600)
-- Bumbu Rendang → GDG-014 (L=150) | Bumbu Kare (Exp Juni) → GDG-013 (L=350)
-- Bumbu Semur (Exp Feb) → GDG-015 (L=50) | Boneka Maskot RA → GDG-003 (L=0)
-- Bumbu TO → GDG-017 Bumbu Tongseng (L=0) | Bumbu TK → GDG-016 Bumbu Tengkleng (L=0)
-- Bumbu Gule (Exp Apr L=0 + Exp Juni L=1000) → gabung GDG-012 Bumbu Gule Merah (L=1000, tanpa batch/exp)

-- ---------------------------------------------------------------- B. SEED STOCK PUSAT (Opsi 2 — JALANKAN TERPISAH setelah A terverifikasi)
-- insert into stock_lokasi (id_lokasi, sku, stock, hpp_average, min_stock) values
--   ('PUSAT','GDG-002',27000,0,null), ('PUSAT','GDG-003',0,0,null),
--   ('PUSAT','GDG-006',1150,0,null),  ('PUSAT','GDG-008',90750,0,null),
--   ('PUSAT','GDG-009',4700,0,null),  ('PUSAT','GDG-012',1000,0,null),
--   ('PUSAT','GDG-013',350,0,null),   ('PUSAT','GDG-014',150,0,null),
--   ('PUSAT','GDG-015',50,0,null),    ('PUSAT','GDG-016',0,0,null),
--   ('PUSAT','GDG-017',0,0,null),     ('PUSAT','GDG-018',4285,0,null),
--   ('PUSAT','GDG-021',184500,0,null),('PUSAT','GDG-022',2676,0,null),
--   ('PUSAT','GDG-023',4600,0,null),  ('PUSAT','GDG-027',0,0,null),
--   ('PUSAT','GDG-028',87000,0,null), ('PUSAT','GDG-030',0,0,null),
--   ('PUSAT','GDG-031',0,0,null),     ('PUSAT','GDG-032',1900,0,null),
--   ('PUSAT','GDG-033',150,0,null),   ('PUSAT','GDG-034',0,0,null),
--   ('PUSAT','GDG-035',1900,0,null)
-- on conflict (id_lokasi, sku) do nothing;
-- -- verifikasi: select coalesce(sum(stock),0) from stock_lokasi where id_lokasi='PUSAT'; -- harus 412161
