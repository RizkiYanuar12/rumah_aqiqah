-- Updatte mutasi ledger columns
alter table public.mutasi_stock
  add column if not exists id_lokasi_tujuan text references public.lokasi(id_lokasi)
    on delete set null on update cascade,
  add column if not exists id_batch text,
  add column if not exists dikirim_oleh uuid references auth.users(id) on delete set null,
  add column if not exists dikirim_at timestamptz;

alter table public.mutasi_stock
  drop column if exists id_transfer;

create index if not exists idx_mutasi_stock_id_lokasi_tujuan
  on public.mutasi_stock (id_lokasi_tujuan);
create index if not exists idx_mutasi_stock_id_batch
  on public.mutasi_stock (id_batch);
create index if not exists idx_mutasi_stock_dikirim
  on public.mutasi_stock (dikirim_oleh);

alter table public.pengajuan
  add column if not exists dikirim_oleh uuid references auth.users(id) on delete set null,
  add column if not exists dikirim_at timestamptz;

create index if not exists idx_pengajuan_dikirim
  on public.pengajuan (dikirim_oleh);

revoke execute on function public.barang_masuk(text, text, numeric, numeric, date, text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';