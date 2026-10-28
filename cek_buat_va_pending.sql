-- Cek definisi RPC buat_va_pending: pastikan menerima nominal cicilan
-- (0 < p_total <= sisa), bukan memaksa p_total = sisa.
-- Jalankan di Supabase SQL Editor. Read-only, tidak mengubah data.
select pg_get_functiondef('public.buat_va_pending'::regproc);
