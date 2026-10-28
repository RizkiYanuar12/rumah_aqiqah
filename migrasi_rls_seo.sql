-- =====================================================================
-- MIGRASI RLS — SEO "lihat order sendiri" (orders / order_lines / order_qlah)
--
-- JALANKAN di Dashboard > SQL Editor.
-- Idempotent: aman dijalankan berulang kali.
--
-- KENAPA:
--   App membaca order lewat SERVICE ROLE (lib/supabase/admin.ts) -> policy
--   ini bukan logic app, ini lapisan kedua kalau publishable key dipakai
--   langsung dari browser. Scope-nya cermin app ((app)/orders/page.tsx):
--     SEO -> hanya order miliknya sendiri.
--
-- ROLE LAIN (cso/finance/branch_manager) TIDAK diberi policy:
--   mereka baca lewat service role, jadi tak butuh akses tabel langsung.
--   Kalau browser client nanti dipakai role lain, tambah policy-nya di sini.
--
-- ANON tetap tak boleh apa-apa (revoke select dari anon, §14a.7 progress.md).
--
-- KOLOM:
--   orders.cso_id        = uuid pembuat order (auth.userId saat create)
--   order_lines.order_id -> orders.id_pesanan
--   order_qlah.id_baris    -> order_lines.id_baris
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Helper: role aplikasi dari JWT.
--    app_metadata adalah claim top-level pada access token Supabase,
--    sama persis dengan claims.app_metadata.role di lib/auth/auth.ts.
-- ---------------------------------------------------------------------
create or replace function public.rams_app_role()
returns text
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '');
$$;

comment on function public.rams_app_role() is
  'Role aplikasi dari JWT app_metadata.role (seo/cso/inventory/finance/branch_manager).';


-- ---------------------------------------------------------------------
-- 2. Helper kepemilikan order.
--    SECURITY DEFINER -> dijalankan sebagai pemilik tabel, jadi query ke
--    orders/order_lines MELEWATI policy RLS. Ini yang mencegah recursion
--    (error 42P17) saat policy order_lines/order_qlah saling menanyakan.
--    auth.uid() tetap menunjuk user yang sedang login (bukan owner fungsi).
-- ---------------------------------------------------------------------
create or replace function public.rams_order_owned_by_caller(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    where o.id_pesanan = p_order_id
      and o.cso_id = auth.uid()
  );
$$;

comment on function public.rams_order_owned_by_caller(uuid) is
  'True bila order tersebut dibuat oleh user yang sedang login (orders.cso_id = auth.uid()).';


create or replace function public.rams_line_owned_by_caller(p_id_baris uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.order_lines ol
    where ol.id_baris = p_id_baris
      and ol.order_id in (
        select o.id_pesanan
        from public.orders o
        where o.cso_id = auth.uid()
      )
  );
$$;

comment on function public.rams_line_owned_by_caller(uuid) is
  'True bila baris order_lines (dan order induknya) dibuat oleh user yang sedang login.';


-- Fungsi ini dipanggil dari dalam policy -> hanya authenticated yang boleh.
revoke execute on function public.rams_app_role()                          from public, anon;
revoke execute on function public.rams_order_owned_by_caller(uuid)        from public, anon;
revoke execute on function public.rams_line_owned_by_caller(uuid)         from public, anon;
grant  execute on function public.rams_app_role()                          to authenticated;
grant  execute on function public.rams_order_owned_by_caller(uuid)        to authenticated;
grant  execute on function public.rams_line_owned_by_caller(uuid)         to authenticated;


-- ---------------------------------------------------------------------
-- 3. RLS aktif + policy "seo_own"
-- ---------------------------------------------------------------------
alter table public.orders       enable row level security;
alter table public.order_lines  enable row level security;
alter table public.order_qlah enable row level security;

-- anon (tanpa sesi) tetap tak boleh baca apa pun.
revoke select on public.orders       from anon;
revoke select on public.order_lines  from anon;
revoke select on public.order_qlah from anon;

-- authenticated butuh hak SELECT supaya yang menentukan adalah policy,
-- bukan ketiadaan hak akses.
grant select on public.orders       to authenticated;
grant select on public.order_lines  to authenticated;
grant select on public.order_qlah to authenticated;

drop policy if exists orders_seo_own        on public.orders;
drop policy if exists order_lines_seo_own   on public.order_lines;
drop policy if exists order_qlah_seo_own   on public.order_qlah;

-- orders: SEO hanya boleh baris yang ia buat sendiri.
create policy orders_seo_own
  on public.orders
  for select
  to authenticated
  using (
    public.rams_app_role() = 'seo'
    and cso_id = auth.uid()
  );

-- order_lines: ikut order induknya.
create policy order_lines_seo_own
  on public.order_lines
  for select
  to authenticated
  using (
    public.rams_app_role() = 'seo'
    and public.rams_order_owned_by_caller(order_id)
  );

-- order_qlah: ikut order_lines -> order induk.
create policy order_qlah_seo_own
  on public.order_qlah
  for select
  to authenticated
  using (
    public.rams_app_role() = 'seo'
    and public.rams_line_owned_by_caller(id_baris)
  );


-- ---------------------------------------------------------------------
-- 4. VERIFIKASI (jalankan setelah migrasi)
-- ---------------------------------------------------------------------
-- a) policy ada & RLS aktif:
-- select c.relname, c.relrowsecurity, p.polname, p.polroles::regrole[]
-- from pg_class c
-- join pg_policy p on p.polrelid = c.oid
-- where c.relname in ('orders','order_lines','order_qlah')
-- order by c.relname, p.polname;
--
-- b) fungsi helper tak bisa dipanggil dari browser:
-- select has_function_privilege('anon', 'public.rams_app_role()', 'execute');                    -- false
-- select has_function_privilege('anon', 'public.rams_order_owned_by_caller(uuid)', 'execute'); -- false
--
-- c) uji lewat app: login SEO -> /orders hanya order miliknya.
--    Login CSO/Finance/BM -> /orders tetap utuh (lewat service role,
--    tidak bergantung policy ini).
