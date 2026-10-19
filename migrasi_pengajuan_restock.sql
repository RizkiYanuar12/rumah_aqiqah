-- =====================================================================
-- PENGAJUAN RESTOCK Pusat -> Cabang (jalankan di Dashboard > SQL Editor)
-- Skema mengikuti tabel `pengajuan` yang sudah dibuat via Dashboard
-- (satu baris = satu item; PK id_pengajuan per baris).
-- File ini idempotent: CREATE IF NOT EXISTS + CREATE OR REPLACE.
-- Bagian yang masih harus dijalankan: Bagian 2 (fungsi) di bawah.
-- =====================================================================

-- 1. Tabel (sudah ada dari Dashboard; perintah ini no-op bila cocok).
create table if not exists pengajuan (
  id_pengajuan uuid primary key default gen_random_uuid(),
  id_lokasi    text,
  status       text not null default 'DIAJUKAN'
               check (status in ('DIAJUKAN', 'DISETUJUI', 'DITOLAK')),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  sku          text,
  qty          numeric,
  nama_barang  text
);
create index if not exists idx_pengajuan_lokasi on pengajuan(id_lokasi);
create index if not exists idx_pengajuan_status on pengajuan(status);

-- 1b. Samakan CHECK status dengan versi file ini (termasuk DIKIRIM).
--     Tabel yang dibuat via Dashboard umumnya tanpa CHECK / tanpa DIKIRIM.
-- 1c. Tambah status DITERIMA (konfirmasi terima fisik oleh CSO cabang)
--     dan DIBATALKAN (pembatalan oleh pusat; lihat fungsi batalkan_pengajuan).
--     Tanpa gerakan stok tambahan di sini (gerakan ada di fungsi).
alter table pengajuan drop constraint if exists pengajuan_status_check;
alter table pengajuan add constraint pengajuan_status_check
  check (status in ('DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DIKIRIM', 'DITERIMA', 'DIBATALKAN'));

-- 2. Pastikan mutasi transfer (tanpa order) bisa dicatat.
alter table mutasi_stock alter column order_id drop not null;

-- 3. RLS: browser tidak bisa baca/tulis langsung (selalu via service-role,
--    pola yang sama dengan tabel stok lain).
alter table pengajuan enable row level security;

-- 4. Persetujuan atomik PER BARIS: kunci baris + pindah stok PUSAT -> cabang.
--    Satu transaksi: gagal = tidak ada yang bergerak, status tetap DIAJUKAN.
--    Penelepon kedua diblokir row-lock lalu ditolak guard status.
create or replace function setujui_pengajuan(p_id uuid)
returns void
language plpgsql as $$
declare
  v_cabang text;
  v_sku    text;
  v_qty    numeric;
  v_status text;
  v_stok   numeric;
  v_hpp    numeric;
begin
  select id_lokasi, sku, qty, status into v_cabang, v_sku, v_qty, v_status
    from pengajuan where id_pengajuan = p_id for update;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_status is distinct from 'DIAJUKAN' then
    raise exception 'Pengajuan sudah diputuskan';
  end if;
  if v_cabang is null or v_sku is null or v_qty is null or v_qty <= 0 then
    raise exception 'Data pengajuan tidak lengkap';
  end if;

  -- Sisi keluar: kurangi stok PUSAT (kunci baris stok).
  select stock, hpp_average into v_stok, v_hpp
    from stock_lokasi where id_lokasi = 'PUSAT' and sku = v_sku for update;
  if not found or v_stok < v_qty then
    raise exception 'Stok pusat kurang: % (sisa %, minta %)', v_sku, coalesce(v_stok, 0), v_qty;
  end if;
  update stock_lokasi set stock = stock - v_qty
    where id_lokasi = 'PUSAT' and sku = v_sku;
  insert into mutasi_stock (id_lokasi, sku, jenis, jumlah, harga_satuan)
    values ('PUSAT', v_sku, 'KELUAR', v_qty, coalesce(v_hpp, 0));

  -- Sisi terima: tambah stok cabang (HPP rata-rata) + mutasi MASUK.
  perform barang_masuk(v_cabang, v_sku, v_qty, coalesce(v_hpp, 0));

  update pengajuan set status = 'DISETUJUI' where id_pengajuan = p_id;
end $$;

revoke execute on function setujui_pengajuan(uuid) from public, anon, authenticated;

-- 5. Pembatalan oleh PUSAT (atas info cabang): DIAJUKAN/DISETUJUI/DIKIRIM -> DIBATALKAN.
--    Cermin setujui_pengajuan: stok yang sudah pindah dikembalikan cabang -> PUSAT
--    dalam satu transaksi (gagal = tidak ada yang bergerak). DITERIMA/DITOLAK/
--    DIBATALKAN ditolak (final). Stok cabang yang sudah terpakai (< qty) juga
--    ditolak — selesaikan ordernya dulu, baru batalkan (tanpa stok minus).
create or replace function batalkan_pengajuan(p_id uuid)
returns void
language plpgsql as $$
declare
  v_cabang text;
  v_sku    text;
  v_qty    numeric;
  v_status text;
  v_stok   numeric;
  v_hpp    numeric;
begin
  select id_lokasi, sku, qty, status into v_cabang, v_sku, v_qty, v_status
    from pengajuan where id_pengajuan = p_id for update;
  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_status in ('DITERIMA', 'DITOLAK', 'DIBATALKAN') then
    raise exception 'Pengajuan sudah selesai, tidak bisa dibatalkan';
  end if;
  if v_status not in ('DIAJUKAN', 'DISETUJUI', 'DIKIRIM') then
    raise exception 'Status tidak dikenal: %', v_status;
  end if;
  if v_cabang is null or v_sku is null or v_qty is null or v_qty <= 0 then
    raise exception 'Data pengajuan tidak lengkap';
  end if;

  -- Sudah pindah ke cabang: kembalikan cabang -> PUSAT (cermin persetujuan).
  if v_status in ('DISETUJUI', 'DIKIRIM') then
    select stock, hpp_average into v_stok, v_hpp
      from stock_lokasi where id_lokasi = v_cabang and sku = v_sku for update;
    if not found or v_stok < v_qty then
      raise exception 'Stok cabang sudah terpakai: % (sisa %, diminta %)', v_sku, coalesce(v_stok, 0), v_qty;
    end if;
    update stock_lokasi set stock = stock - v_qty
      where id_lokasi = v_cabang and sku = v_sku;
    insert into mutasi_stock (id_lokasi, sku, jenis, jumlah, harga_satuan)
      values (v_cabang, v_sku, 'KELUAR', v_qty, coalesce(v_hpp, 0));
    perform barang_masuk('PUSAT', v_sku, v_qty, coalesce(v_hpp, 0));
  end if;

  update pengajuan set status = 'DIBATALKAN' where id_pengajuan = p_id;
end $$;

revoke execute on function batalkan_pengajuan(uuid) from public, anon, authenticated;

-- UJI SETELAH SELESAI (ganti <SKU> dengan sku asli, lalu hapus kembali):
-- insert into pengajuan (id_lokasi, sku, qty, nama_barang)
-- values ('BDG-RAYA', '<SKU>', 1, 'uji') returning id_pengajuan;
-- select setujui_pengajuan('<ID>');
-- select * from stock_lokasi where sku = '<SKU>';
-- (kembalikan manual bila hanya uji baca fungsi — atau biarkan, lalu sesuaikan stok)
