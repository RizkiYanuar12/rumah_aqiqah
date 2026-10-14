-- PINDAH DATA inventory -> stock_lokasi (jalankan di Dashboard > SQL Editor)
-- Kondisi saat ini: inventory (master) + stock_lokasi sudah ada,
-- kolom inventory.stock/min_stock/hpp_average sudah di-drop.

-- 0. Cek awal (pastikan stock_lokasi sudah terisi):
select count(*) as baris_stock, coalesce(sum(stock),0) as total_stock from stock_lokasi;
select id_lokasi, count(*) from stock_lokasi group by id_lokasi;

-- 1. Pastikan lokasi ada:
insert into lokasi (id_lokasi, nama, jenis) values
  ('PUSAT',        'Pusat',        'PUSAT'),
  ('BDG-RAYA', 'Bandung Raya', 'CABANG')
on conflict (id_lokasi) do nothing;

-- 2. Buat stock_lokasi (aman dijalankan ulang; tabel sudah ada -> dilewati):
create table if not exists stock_lokasi (
  id_lokasi   text    not null references lokasi(id_lokasi),
  sku         text    not null references inventory(sku),
  stock       numeric not null default 0 check (stock >= 0),
  hpp_average numeric not null default 0,
  min_stock   numeric,
  primary key (id_lokasi, sku)
);
create index if not exists idx_stock_lokasi_sku on stock_lokasi(sku);

-- 3. Pindahkan -- SUDAH SELESAI, JANGAN DIJALANKAN LAGI
-- (dulu: copy inventory.stock -> stock_lokasi BDG-RAYA;
--  sekarang inventory.stock sudah di-drop sehingga query di bawah ERROR.
--  Dibiarkan sebagai dokumentasi.)
-- insert into stock_lokasi (id_lokasi, sku, stock, hpp_average, min_stock)
-- select 'BDG-RAYA', sku, coalesce(stock, 0), coalesce(hpp_average, 0), min_stock
-- from inventory
-- on conflict (id_lokasi, sku) do nothing;

-- 4. Verifikasi (bandingkan stock_lokasi vs backup sebelum drop):
select (select count(*) from stock_lokasi) as baru,
       (select count(*) from inventory_backup) as backup;
select (select coalesce(sum(stock), 0) from stock_lokasi) as baru,
       (select coalesce(sum(stock), 0) from inventory_backup) as backup;
