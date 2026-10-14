-- RENAME SKU sertifikat Aqiqah -> GDB-029 (Dashboard > SQL Editor)
-- Otomatis cari SKU lama by nama; berhenti (exception) kalau cocok bukan tepat 1
-- atau GDB-029 sudah dipakai. Aman dijalankan ulang: kalau sudah GDB-029,
-- tidak ada baris cocok lain sehingga raise exception jelas, tidak merusak apa pun.

do $$
declare
  v_old text;
  v_n   int;
begin
  select count(*), max(sku) into v_n, v_old
  from inventory
  where nama_barang ilike '%sertifikat%';

  if v_n <> 1 then
    raise exception 'Ditemukan % baris sertifikat (SKU: %). Cek manual dulu.', v_n, v_old;
  end if;

  if exists (select 1 from inventory where sku = 'GDB-029') then
    raise exception 'GDB-029 sudah dipakai. Batal.';
  end if;

  raise notice 'Rename % -> GDB-029', v_old;

  update stock_lokasi set sku = 'GDB-029' where sku = v_old;
  update order_items  set sku = 'GDB-029' where sku = v_old;
  update paket_items  set sku = 'GDB-029' where sku = v_old;
  update olahan_item  set sku = 'GDB-029' where sku = v_old;
  update inventory    set sku = 'GDB-029' where sku = v_old;
end $$;

-- VERIFIKASI (harus 1 baris master + baris stock per lokasi):
select sku, nama_barang, satuan from inventory where sku = 'GDB-029';
select id_lokasi, sku, stock from stock_lokasi where sku = 'GDB-029';
