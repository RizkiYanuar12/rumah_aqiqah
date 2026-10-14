-- =====================================================================
-- MIGRASI V2, BAGIAN 2
--
-- JALANKAN HANYA SETELAH migrasi_v2_1_aman.sql selesai dan
-- query VERIFIKASI-nya cocok.
--
-- Nama tabel master di file ini: inventory (hasil rename dari
-- inventory_cabang di bagian 1). Kalau di bagian 1 kamu TIDAK rename,
-- ganti kata "inventory" sebagai nama tabel menjadi "inventory_cabang"
-- di file ini (muncul di fungsi barang_masuk dan di bagian 6).
--
-- Isi bagian ini:
--   1. constraint pelengkap untuk order_lines dan order_items
--   2. view v_order_totals
--   3. fungsi lokasi_order, barang_masuk, susun_rincian_order, keluar_barang_cabang
--   4. RLS dan pencabutan hak panggil fungsi dari browser
--   5. (PERMANEN) hapus kolom stok lama dari inventory
--
-- Lokasi stok sebuah order:
--   orders.id_lokasi (disalin dari auth app_metadata.id_lokasi saat create;
--   public.users hanya berisi id/role/is_active)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Constraint pelengkap (hanya ditambah kalau belum ada)
-- ---------------------------------------------------------------------
do $$
begin
  -- order_lines
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_lines'::regclass
                   and conname = 'order_lines_order_id_fkey') then
    alter table order_lines add constraint order_lines_order_id_fkey
      foreign key (order_id) references orders(id_pesanan) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_lines'::regclass
                   and conname = 'order_lines_id_paket_fkey') then
    alter table order_lines add constraint order_lines_id_paket_fkey
      foreign key (id_paket) references paket(id);
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_lines'::regclass
                   and conname = 'order_lines_id_baris_induk_fkey') then
    alter table order_lines add constraint order_lines_id_baris_induk_fkey
      foreign key (id_baris_induk) references order_lines(id_baris);
  end if;

  -- order_items
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_order_id_fkey') then
    alter table order_items add constraint order_items_order_id_fkey
      foreign key (order_id) references orders(id_pesanan) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_id_baris_fkey') then
    alter table order_items add constraint order_items_id_baris_fkey
      foreign key (id_baris) references order_lines(id_baris) on delete cascade;
  end if;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_id_olahan_fkey') then
    alter table order_items add constraint order_items_id_olahan_fkey
      foreign key (id_olahan) references olahan(id_olahan);
  end if;

  -- qty boleh minus (upgrade mengurangi isi paket), tetapi tidak boleh nol
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_qty_check') then
    alter table order_items add constraint order_items_qty_check check (qty <> 0);
  end if;
end $$;


-- ---------------------------------------------------------------------
-- 2. View total jual, total HPP, dan margin per order
-- ---------------------------------------------------------------------
create or replace view v_order_totals
with (security_invoker = true) as
select order_id,
       sum(qty * harga_satuan)                         as total_jual,
       sum(qty * hpp_satuan)                           as total_hpp,
       sum(qty * harga_satuan) - sum(qty * hpp_satuan) as margin
from order_lines
group by order_id;


-- ---------------------------------------------------------------------
-- 3. Fungsi
--    Versi lama (kalau ada) dihapus dulu supaya tidak terjadi dua versi
--    dengan parameter berbeda.
-- ---------------------------------------------------------------------
drop function if exists lokasi_order(uuid);
drop function if exists barang_masuk(text, numeric, numeric);
drop function if exists barang_masuk(text, text, numeric, numeric);
-- nama lama (tidak pernah dijalankan di prod, tapi aman bila sudah terlanjur ada):
drop function if exists susun_order(uuid, jsonb);
drop function if exists keluarkan_barang(uuid);
drop function if exists keluarkan_barang(uuid, uuid);
drop function if exists susun_rincian_order(uuid, jsonb);
drop function if exists keluar_barang_cabang(uuid);
drop function if exists keluar_barang_cabang(uuid, uuid);


-- 3a. lokasi stok sebuah order (NULL kalau orders.id_lokasi kosong)
create function lokasi_order(p_order_id uuid)
returns text
language sql stable as $$
  select o.id_lokasi
  from orders o
  where o.id_pesanan = p_order_id
$$;


-- 3b. barang masuk di SATU lokasi + HPP rata-rata lokasi itu
--     HPP baru = (stok lama x HPP lama + masuk x harga beli) / (stok lama + masuk)
create function barang_masuk(
  p_id_lokasi  text,
  p_sku        text,
  p_qty        numeric,
  p_harga_beli numeric
) returns void
language plpgsql as $$
begin
  if p_qty <= 0 then
    raise exception 'Jumlah masuk harus lebih dari 0';
  end if;
  if not exists (select 1 from lokasi where id_lokasi = p_id_lokasi and is_active) then
    raise exception 'Lokasi tidak ditemukan atau tidak aktif: %', p_id_lokasi;
  end if;
  if not exists (select 1 from inventory where sku = p_sku) then
    raise exception 'Barang tidak ditemukan: %', p_sku;
  end if;

  -- baris stok dibuat otomatis kalau barang ini belum pernah masuk di lokasi tsb
  insert into stok_lokasi (id_lokasi, sku, stock, hpp_average)
  values (p_id_lokasi, p_sku, p_qty, p_harga_beli)
  on conflict (id_lokasi, sku) do update
    set hpp_average = (stok_lokasi.stock * stok_lokasi.hpp_average + p_qty * p_harga_beli)
                      / (stok_lokasi.stock + p_qty),
        stock       = stok_lokasi.stock + p_qty;

  insert into mutasi_stock (id_lokasi, sku, jenis, jumlah, harga_satuan)
  values (p_id_lokasi, p_sku, 'MASUK', p_qty, p_harga_beli);
end $$;


-- 3c. susun_rincian_order: mengisi rincian sebuah order.
--     Header orders dibuat lebih dulu oleh aplikasi.
--     HPP barang diambil dari stok_lokasi milik lokasi order
--     (barang yang belum punya stok di lokasi itu dihitung HPP 0).
create function susun_rincian_order(p_order_id uuid, p_baris jsonb)
returns void
language plpgsql as $$
declare
  r        jsonb;
  v_paket  paket%rowtype;
  v_baris  uuid;
  v_qty    int;
  v_ids    uuid[] := '{}';
  v_olh    jsonb;
  v_lokasi text;
begin
  if not exists (select 1 from orders where id_pesanan = p_order_id) then
    raise exception 'Order tidak ditemukan';
  end if;
  if exists (select 1 from order_lines where order_id = p_order_id) then
    raise exception 'Order ini sudah punya rincian';
  end if;

  v_lokasi := lokasi_order(p_order_id);
  if v_lokasi is null then
    raise exception 'Order ini belum punya lokasi stok (orders.id_lokasi kosong)';
  end if;

  for r in select * from jsonb_array_elements(p_baris) loop
    v_qty := coalesce((r->>'qty')::int, 1);
    v_olh := coalesce(r->'olahan', '[]'::jsonb);

    select * into v_paket
    from paket
    where id = (r->>'id_paket')::uuid and is_active;
    if not found then
      raise exception 'Paket tidak ditemukan atau tidak aktif: %', r->>'id_paket';
    end if;

    -- baris paket / add-on / upgrade (HPP dihitung ulang di akhir)
    insert into order_lines
      (order_id, id_paket, id_baris_induk, nama_paket, kategori, qty, harga_satuan, hpp_satuan)
    values
      (p_order_id, v_paket.id,
       case when r->>'induk' is not null then v_ids[(r->>'induk')::int + 1] end,
       v_paket.nama_paket, v_paket.kategori, v_qty, v_paket.harga, 0)
    returning id_baris into v_baris;

    v_ids := v_ids || v_baris;

    -- isi resep paket
    insert into order_items (order_id, id_baris, sku, qty, hpp_snapshot)
    select p_order_id, v_baris, pi.sku, pi.qty * v_qty, coalesce(sl.hpp_average, 0)
    from paket_items pi
    left join stok_lokasi sl
           on sl.sku = pi.sku and sl.id_lokasi = v_lokasi
    where pi.id_paket = v_paket.id;

    -- olahan yang dipilih
    insert into order_olahan (id_baris, id_olahan, nama_olahan, kategori)
    select v_baris, o.id_olahan, o.nama_olahan, o.kategori
    from olahan o
    where o.id_olahan in (select jsonb_array_elements_text(v_olh)::uuid);

    -- bumbu dari olahan: qty_per_porsi x porsi paket x jumlah paket
    insert into order_items (order_id, id_baris, sku, qty, hpp_snapshot, id_olahan)
    select p_order_id, v_baris, oi.sku,
           oi.qty_per_porsi * coalesce(v_paket.porsi, 1) * v_qty,
           coalesce(sl.hpp_average, 0), oi.id_olahan
    from olahan_item oi
    left join stok_lokasi sl
           on sl.sku = oi.sku and sl.id_lokasi = v_lokasi
    where oi.id_olahan in (select jsonb_array_elements_text(v_olh)::uuid);
  end loop;

  -- HPP per baris = (isi resep + bumbu olahan) / qty + hpp_manual
  update order_lines ol
  set hpp_satuan =
        (select coalesce(sum(oi.qty * oi.hpp_snapshot), 0)
         from order_items oi where oi.id_baris = ol.id_baris) / ol.qty
        + coalesce((select p.hpp_manual from paket p where p.id = ol.id_paket), 0)
  where ol.order_id = p_order_id;

  -- pengaman: paket utama di rincian harus sama dengan orders.paket_id
  if exists (
    select 1 from orders o
    where o.id_pesanan = p_order_id
      and o.paket_id is not null
      and not exists (
        select 1 from order_lines ol
        where ol.order_id = p_order_id
          and ol.id_paket = o.paket_id
          and ol.kategori = 'PAKET'
      )
  ) then
    raise exception 'Paket utama order (orders.paket_id) tidak ada di rincian';
  end if;

  -- pengaman: hasil akhir per barang tidak boleh minus
  -- (mis. upgrade "ganti nasi putih" dipasang ke paket tanpa nasi putih)
  if exists (
    select 1 from order_items
    where order_id = p_order_id
    group by sku
    having sum(qty) < 0
  ) then
    raise exception 'Upgrade tidak cocok: ada barang yang diganti tetapi tidak ada di paketnya';
  end if;
end $$;


-- 3d. keluar_barang_cabang: kurangi stok LOKASI ORDER + catat transaksi.
--     NONAKTIF selama trigger trg_order_items_stok (bagian 6) aktif:
--     trigger sudah memotong saat order_items ditulis, pemanggilan fungsi ini
--     akan memotong DUA KALI. Dipertahankan untuk pemakaian manual darurat.
--     Aplikasi (lib/orders.ts) TIDAK memanggil fungsi ini.
create function keluar_barang_cabang(p_order_id uuid, p_oleh uuid default null)
returns void
language plpgsql as $$
declare
  v_lokasi text;
begin
  if not exists (select 1 from orders where id_pesanan = p_order_id) then
    raise exception 'Order tidak ditemukan';
  end if;

  v_lokasi := lokasi_order(p_order_id);
  if v_lokasi is null then
    raise exception 'Order ini belum punya lokasi stok (orders.id_lokasi kosong)';
  end if;

  -- unique(order_id): panggilan kedua (klik ganda / refresh) ditolak di sini
  insert into pengeluaran_gudang (order_id, dikeluarkan_oleh)
  values (p_order_id, p_oleh)
  on conflict (order_id) do nothing;
  if not found then
    raise exception 'Barang order ini sudah dikeluarkan';
  end if;

  -- semua barang yang keluar harus sudah punya baris stok di lokasi ini.
  -- Tanpa pengecekan ini, UPDATE di bawah diam-diam tidak mengurangi apa pun.
  if exists (
    select 1
    from (
      select sku from order_items
      where order_id = p_order_id
      group by sku having sum(qty) > 0
    ) x
    where not exists (
      select 1 from stok_lokasi sl
      where sl.id_lokasi = v_lokasi and sl.sku = x.sku
    )
  ) then
    raise exception 'Ada barang yang belum punya stok di lokasi %', v_lokasi;
  end if;

  update stok_lokasi sl
  set stock = sl.stock - x.qty
  from (
    select sku, sum(qty) as qty
    from order_items
    where order_id = p_order_id
    group by sku
  ) x
  where sl.id_lokasi = v_lokasi and sl.sku = x.sku;
  -- stok kurang -> check (stock >= 0) membatalkan seluruh fungsi

  insert into mutasi_stock (id_lokasi, sku, order_id, jenis, jumlah, harga_satuan)
  select v_lokasi, sku, p_order_id, 'KELUAR', sum(qty), max(hpp_snapshot)
  from order_items
  where order_id = p_order_id
  group by sku
  having sum(qty) > 0;
end $$;


-- ---------------------------------------------------------------------
-- 4. Keamanan
--    Aplikasi mengakses database hanya dari SERVER (service role key).
--    RLS aktif tanpa policy = browser (anon key) tidak bisa membaca/menulis
--    tabel-tabel baru ini. Fungsi hanya boleh dipanggil dari server.
--    Tabel yang SUDAH ADA (paket, orders, users, inventory, order_*)
--    tidak diubah di sini, karena sebagian mungkin dipakai bagian lain.
-- ---------------------------------------------------------------------
alter table lokasi             enable row level security;
alter table stok_lokasi        enable row level security;
alter table paket_items        enable row level security;
alter table olahan             enable row level security;
alter table olahan_item        enable row level security;
alter table order_olahan       enable row level security;
alter table mutasi_stock         enable row level security;
alter table pengeluaran_gudang enable row level security;

revoke execute on function lokasi_order(uuid)                          from public, anon, authenticated;
revoke execute on function barang_masuk(text, text, numeric, numeric)  from public, anon, authenticated;
revoke execute on function susun_rincian_order(uuid, jsonb)            from public, anon, authenticated;
revoke execute on function keluar_barang_cabang(uuid, uuid)            from public, anon, authenticated;


-- ---------------------------------------------------------------------
-- 5. TERAKHIR, PERMANEN: hapus kolom stok lama di inventory
--    Setelah ini stok, HPP, dan batas minimum HANYA ada di stok_lokasi.
--    Jalankan hanya kalau bagian 1-4 di atas berhasil tanpa error.
-- ---------------------------------------------------------------------
alter table inventory
  drop column stock,
  drop column min_stock,
  drop column hpp_average;


-- ---------------------------------------------------------------------
-- 6. Trigger stok otomatis (ditambahkan 13 Okt 2026)
--    - INSERT/UPDATE order_items → potong stock_lokasi + tulis transaksi 'KELUAR'
--    - DELETE/UPDATE order_items → kembalikan stok + tulis 'BATAL'
--      (order batal: dikembalikan sekaligus oleh trigger orders di bawah)
--    - UPDATE orders.status → 'BATAL' → kembalikan seluruh order_items + 'BATAL';
--      dari 'TERKIRIM'/'SELESAI' → ditolak; keluar dari 'BATAL' → ditolak.
--    KONVENSI: status & jenis UPPERCASE ('BATAL', 'KELUAR', 'MASUK') — sama
--    dengan data DB; app menulis uppercase (lib/order-status.ts).
-- ---------------------------------------------------------------------
create or replace function public.trg_order_items_stok()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lokasi text;
  v_status text;
begin
  -- kembalikan stok lama (saat baris diubah atau dihapus)
  if tg_op in ('UPDATE','DELETE') and old.sku is not null then
    select id_lokasi, status into v_lokasi, v_status
      from orders where id_pesanan = old.order_id;

    if not found then
      raise exception 'Order % tidak ditemukan, stok tidak bisa dikembalikan', old.order_id;
    end if;

    -- order batal: stok sudah dikembalikan oleh trigger di orders
    if v_status is distinct from 'BATAL' then
      if v_lokasi is null then
        raise exception 'Order % belum punya id_lokasi', old.order_id;
      end if;

      update stock_lokasi set stock = stock + old.qty
       where id_lokasi = v_lokasi and sku = old.sku;

      insert into mutasi_stock (id_lokasi, sku, order_id, jenis, jumlah, harga_satuan)
      values (v_lokasi, old.sku, old.order_id, 'BATAL', old.qty, old.hpp_snapshot);
    end if;
  end if;

  -- kurangi stok (saat baris baru masuk atau diubah)
  if tg_op in ('INSERT','UPDATE') and new.sku is not null then
    select id_lokasi, status into v_lokasi, v_status
      from orders where id_pesanan = new.order_id;

    if v_status = 'BATAL' then
      raise exception 'Order % sudah dibatalkan, tidak bisa menambah atau mengubah item', new.order_id;
    end if;
    if v_lokasi is null then
      raise exception 'Order % belum punya id_lokasi', new.order_id;
    end if;

    update stock_lokasi set stock = stock - new.qty
     where id_lokasi = v_lokasi and sku = new.sku and stock >= new.qty;

    if not found then
      raise exception 'Stok tidak cukup untuk SKU % di lokasi %', new.sku, v_lokasi;
    end if;

    insert into mutasi_stock (id_lokasi, sku, order_id, jenis, jumlah, harga_satuan)
    values (v_lokasi, new.sku, new.order_id, 'KELUAR', new.qty, new.hpp_snapshot);
  end if;

  return null;
end;
$$;

drop trigger if exists trg_order_items_stok on public.order_items;
create trigger trg_order_items_stok
after insert or update of sku, qty, order_id or delete
on public.order_items
for each row execute function public.trg_order_items_stok();

create or replace function public.trg_orders_batal_stok()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'BATAL' and old.status is distinct from 'BATAL' then
    if old.status in ('TERKIRIM','SELESAI') then
      raise exception 'Order % sudah %, tidak bisa dibatalkan otomatis. Tangani sebagai retur.',
        new.id_pesanan, old.status;
    end if;
    if new.id_lokasi is null then
      raise exception 'Order % belum punya id_lokasi', new.id_pesanan;
    end if;

    update stock_lokasi s
       set stock = s.stock + x.qty
      from (select sku, sum(qty) as qty
              from order_items
             where order_id = new.id_pesanan and sku is not null
             group by sku) x
     where s.id_lokasi = new.id_lokasi and s.sku = x.sku;

    insert into mutasi_stock (id_lokasi, sku, order_id, jenis, jumlah, harga_satuan)
    select new.id_lokasi, oi.sku, new.id_pesanan, 'BATAL', oi.qty, oi.hpp_snapshot
      from order_items oi
     where oi.order_id = new.id_pesanan and oi.sku is not null;

  elsif old.status = 'BATAL' and new.status is distinct from 'BATAL' then
    raise exception 'Order yang sudah dibatalkan tidak bisa diaktifkan kembali. Buat order baru.';
  end if;

  return null;
end;
$$;

drop trigger if exists trg_orders_batal_stok on public.orders;
create trigger trg_orders_batal_stok
after update of status on public.orders
for each row execute function public.trg_orders_batal_stok();


-- ---------------------------------------------------------------------
-- UJI SETELAH SELESAI (buka komentarnya satu per satu)
-- ---------------------------------------------------------------------
-- Stok masuk di PUSAT (ganti sku dan harga dengan data asli):
-- select barang_masuk('PUSAT', '<SKU>', 100, 1500);
-- select * from v_stok where sku = '<SKU>';
--   -> baris PUSAT dan BDG-RAYA terpisah; stok masing-masing tidak saling memengaruhi
