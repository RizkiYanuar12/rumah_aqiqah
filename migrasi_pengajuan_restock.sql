drop function if exists public.setujui_pengajuan(uuid);
drop function if exists public.batalkan_pengajuan(uuid);
drop table if exists public.pengajuan cascade;

create table public.pengajuan (
  batch_id text not null,
  batch_date date not null default ((now() at time zone 'Asia/Jakarta')::date),
  id_lokasi text not null,
  sku text not null,
  status text not null default 'DIAJUKAN'
    check (status in ('DIAJUKAN', 'DISETUJUI', 'DITOLAK', 'DIKIRIM', 'DITERIMA', 'DIBATALKAN')),
  created_by uuid,
  created_at timestamptz not null default now(),
  qty numeric not null check (qty > 0),
  nama_barang text,
  alasan_tolak text,
  ditolak_oleh uuid references auth.users(id) on delete set null,
  ditolak_at timestamptz,
  primary key (batch_id, sku)
);

create index if not exists idx_pengajuan_lokasi_batch_date on pengajuan(id_lokasi, batch_date);
create index if not exists idx_pengajuan_status on pengajuan(status);

alter table mutasi_stock alter column order_id drop not null;
alter table pengajuan enable row level security;

create or replace function setujui_pengajuan(p_batch_id text, p_sku text)
returns void
language plpgsql as $$
declare
  v_cabang text;
  v_qty numeric;
  v_status text;
  v_stok numeric;
  v_hpp numeric;
  v_batch text;
begin
  select id_lokasi, qty, status into v_cabang, v_qty, v_status
    from pengajuan
    where batch_id = p_batch_id and sku = p_sku
    for update;

  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_status is distinct from 'DIAJUKAN' then
    raise exception 'Pengajuan sudah diputuskan';
  end if;
  if v_cabang is null or v_qty is null or v_qty <= 0 then
    raise exception 'Data pengajuan tidak lengkap';
  end if;

  select stock, hpp_average into v_stok, v_hpp
    from stock_lokasi
    where id_lokasi = 'PUSAT' and sku = p_sku
    for update;

  if not found or v_stok < v_qty then
    raise exception 'Stok pusat kurang: % (sisa %, minta %)', p_sku, coalesce(v_stok, 0), v_qty;
  end if;

  v_batch := p_batch_id;

  update stock_lokasi
    set stock = stock - v_qty
    where id_lokasi = 'PUSAT' and sku = p_sku;
  insert into mutasi_stock (id_lokasi, sku, jenis, jumlah, harga_satuan, id_lokasi_tujuan, id_batch)
  values ('PUSAT', p_sku, 'KELUAR', v_qty, coalesce(v_hpp, 0), v_cabang, p_batch_id);

  perform barang_masuk(v_cabang, p_sku, v_qty, coalesce(v_hpp, 0), null, p_batch_id);

  update pengajuan
    set status = 'DISETUJUI'
    where batch_id = p_batch_id and sku = p_sku;
end $$;

revoke execute on function setujui_pengajuan(text, text) from public, anon, authenticated;

create or replace function batalkan_pengajuan(p_batch_id text, p_sku text)
returns void
language plpgsql as $$
declare
  v_cabang text;
  v_qty numeric;
  v_status text;
  v_stok numeric;
  v_hpp numeric;
  v_batch text;
begin
  select id_lokasi, qty, status into v_cabang, v_qty, v_status
    from pengajuan
    where batch_id = p_batch_id and sku = p_sku
    for update;

  if not found then
    raise exception 'Pengajuan tidak ditemukan';
  end if;
  if v_status in ('DITERIMA', 'DITOLAK', 'DIBATALKAN') then
    raise exception 'Pengajuan sudah selesai, tidak bisa dibatalkan';
  end if;
  if v_status not in ('DIAJUKAN', 'DISETUJUI', 'DIKIRIM') then
    raise exception 'Status tidak dikenal: %', v_status;
  end if;
  if v_cabang is null or v_qty is null or v_qty <= 0 then
    raise exception 'Data pengajuan tidak lengkap';
  end if;

  if v_status in ('DISETUJUI', 'DIKIRIM') then
    select stock, hpp_average into v_stok, v_hpp
      from public.stock_lokasi
      where id_lokasi = v_cabang and sku = p_sku
      for update;

    if not found or v_stok < v_qty then
      raise exception 'Stok cabang sudah terpakai: % (sisa %, diminta %)', p_sku, coalesce(v_stok, 0), v_qty;
    end if;

    update public.stock_lokasi
      set stock = stock - v_qty
      where id_lokasi = v_cabang and sku = p_sku;

    insert into public.mutasi_stock (id_lokasi, sku, jenis, jumlah, harga_satuan, id_lokasi_tujuan, id_batch)
      values (v_cabang, p_sku, 'KELUAR', v_qty, coalesce(v_hpp, 0), 'PUSAT', p_batch_id);
    perform public.barang_masuk('PUSAT', p_sku, v_qty, coalesce(v_hpp, 0), null, p_batch_id);
  end if;

  update pengajuan
    set status = 'DIBATALKAN'
    where batch_id = p_batch_id and sku = p_sku;
end $$;

revoke execute on function batalkan_pengajuan(text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
