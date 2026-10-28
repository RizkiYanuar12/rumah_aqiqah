import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveSku } from '@/lib/inventory/inventory'

export type PusatResult = { ok: true } | { ok: false; error: string; status: number }

export type MasukResult =
  | { ok: true; sku: string; baru: boolean }
  | { ok: false; error: string; status: number }

// Catat barang masuk ke PUSAT, satu pintu untuk dua kasus:
// - Nama cocok master → tambah stok (qty wajib, harga opsional).
// Stok + HPP rata-rata + mutasi MASUK dikerjakan RPC barang_masuk.
export async function catatMasuk(
  admin: SupabaseClient,
  input: { nama_barang: string; qty: number | null; harga_beli: number | null; satuan?: string | null; tanggal_exp?: string | null; id_lokasi?: string },
): Promise<MasukResult> {
  const fail = (error: string, status = 400): MasukResult => ({ ok: false, error, status })
  const idLokasi = input.id_lokasi ?? 'PUSAT'

  const nama = input.nama_barang?.trim?.() ?? ''
  if (!nama) return fail('Nama barang wajib diisi')

  const { data: master } = await admin.from('inventory').select('sku,nama_barang,satuan')
  const rows = (master ?? []) as { sku: string; nama_barang: string; satuan: string | null }[]
  const cocok = rows.filter((m) => (m.nama_barang ?? '').trim().toLowerCase() === nama.toLowerCase())
  if (cocok.length > 1) return fail(`Nama tidak unik, pilih dari saran: ${cocok[0].nama_barang}`)

  let sku: string
  let baru = false
  let harga: number = 0
  if (!cocok.length) {
    // Master baru hanya boleh didaftarkan di PUSAT; cabang cukup mencatat stok.
    if (idLokasi !== 'PUSAT') return fail(`Barang tidak dikenal: ${nama}`)
    // Barang baru: qty + harga wajib (jadi HPP awal).
    if (!(input.qty != null && Number.isInteger(input.qty) && input.qty >= 1)) return fail('Qty minimal 1')
    if (!(input.harga_beli != null && Number(input.harga_beli) >= 0)) return fail('Harga beli wajib diisi')
    harga = Number(input.harga_beli)
    const nums = rows
      .map((m) => (/^GDG-(\d+)$/.exec(m.sku.trim()) || [])[1])
      .filter(Boolean)
      .map(Number)
    sku = `GDG-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
    const { error: eMaster } = await admin
      .from('inventory')
      .insert({ sku, nama_barang: nama, satuan: input.satuan?.trim() || 'Pcs' })
    if (eMaster) {
      if (/duplicate|unique/i.test(eMaster.message)) return fail('SKU bentrok, ulangi simpan')
      return fail(eMaster.message, 500)
    }
    baru = true
  } else {
    if (input.qty == null) return fail('Qty minimal 1')
    if (!Number.isInteger(input.qty) || input.qty < 1) return fail('Qty minimal 1')
    harga = input.harga_beli == null ? 0 : Number(input.harga_beli)
    if (!(harga >= 0)) return fail('Harga beli tidak valid')
    sku = cocok[0].sku
    const satuanBaru = input.satuan?.trim() || null
    if (satuanBaru && satuanBaru !== (cocok[0].satuan ?? null)) {
      const { error: eSatuan } = await admin.from('inventory').update({ satuan: satuanBaru }).eq('sku', sku)
      if (eSatuan) return fail(eSatuan.message, 500)
    }
  }

  // Tanggal exp opsional (batch ini); format YYYY-MM-DD, selain itu ditolak ramah.
  const expRaw = input.tanggal_exp?.trim() || null
  if (expRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expRaw)) return fail('Tanggal exp tidak valid (pakai YYYY-MM-DD)')

  const { error } = await admin.rpc('barang_masuk', {
    p_id_lokasi: idLokasi,
    p_sku: sku,
    p_qty: input.qty as number,
    p_harga_beli: harga,
    p_tanggal_exp: expRaw,
    p_id_batch: null,
  })
  if (error) return fail(error.message)
  return { ok: true, sku, baru }
}

// Ubah batas minimum stok 1 SKU di satu lokasi (null/0 = tanpa batas).
// Upsert agar batas bisa dipasang sebelum barang pertama datang.
export async function ubahMinStock(
  admin: SupabaseClient,
  input: { nama_barang: string; min_stock: number | null; id_lokasi?: string },
): Promise<PusatResult> {
  const fail = (error: string, status = 400): PusatResult => ({ ok: false, error, status })
  const idLokasi = input.id_lokasi ?? 'PUSAT'

  const s = await resolveSku(admin, input.nama_barang)
  if (!s.ok) return fail(s.error)
  const min = input.min_stock == null ? null : Number(input.min_stock)
  if (min !== null && (!Number.isInteger(min) || min < 0)) return fail('Min stock harus bilangan bulat ≥ 0')

  const { error } = await admin
    .from('stock_lokasi')
    .upsert({ id_lokasi: idLokasi, sku: s.sku, min_stock: min }, { onConflict: 'id_lokasi,sku' })
  if (error) return fail(error.message, 500)
  return { ok: true }
}

// Ubah data master + stok 1 SKU di satu lokasi (form Edit Cabang).
// Stok di-set absolut (bukan ditambah), termasuk HPP dan batas minimum.
export async function ubahBarangLokasi(
  admin: SupabaseClient,
  input: {
    id_lokasi: string
    sku: string
    nama_barang: string
    kategori?: string | null
    satuan?: string | null
    stock: number | null
    hpp_average: number | null
    min_stock: number | null
  },
): Promise<PusatResult> {
  const fail = (error: string, status = 400): PusatResult => ({ ok: false, error, status })
  const sku = input.sku?.trim() ?? ''
  const nama = input.nama_barang?.trim() ?? ''
  if (!sku) return fail('SKU wajib diisi')
  if (!nama) return fail('Nama barang wajib diisi')

  const stock = input.stock == null ? NaN : Number(input.stock)
  if (!Number.isFinite(stock) || stock < 0) return fail('Stok harus angka ≥ 0')
  const hpp = input.hpp_average == null ? NaN : Number(input.hpp_average)
  if (!Number.isFinite(hpp) || hpp < 0) return fail('HPP rata-rata harus angka ≥ 0')
  const min = input.min_stock == null ? null : Number(input.min_stock)
  if (min !== null && (!Number.isInteger(min) || min < 0)) return fail('Min. stok harus bilangan bulat ≥ 0')

  const { data: master, error: eMaster } = await admin.from('inventory').select('sku,nama_barang')
  if (eMaster) return fail(eMaster.message, 500)
  const rows = (master ?? []) as { sku: string; nama_barang: string | null }[]
  const current = rows.find((m) => m.sku === sku)
  if (!current) return fail('Barang tidak ditemukan', 404)
  const namaLama = (current.nama_barang ?? '').trim().toLowerCase()
  const bentrok =
    nama.toLowerCase() !== namaLama &&
    rows.some((m) => m.sku !== sku && (m.nama_barang ?? '').trim().toLowerCase() === nama.toLowerCase())
  if (bentrok) return fail('Nama barang sudah dipakai SKU lain')

  const { error: eInv } = await admin
    .from('inventory')
    .update({
      nama_barang: nama,
      kategori: input.kategori?.trim() || null,
      satuan: input.satuan?.trim() || null,
    })
    .eq('sku', sku)
  if (eInv) return fail(eInv.message, 500)

  const { error: eStock } = await admin
    .from('stock_lokasi')
    .upsert(
      { id_lokasi: input.id_lokasi, sku, stock, hpp_average: hpp, min_stock: min },
      { onConflict: 'id_lokasi,sku' },
    )
  if (eStock) return fail(eStock.message, 500)
  return { ok: true }
}

export async function hapusStokLokasi(
  admin: SupabaseClient,
  input: { nama_barang: string; id_lokasi?: string },
): Promise<PusatResult> {
  const fail = (error: string, status: number = 400): PusatResult => ({ ok: false, error, status })
  const idLokasi = input.id_lokasi ?? 'PUSAT'

  const s = await resolveSku(admin, input.nama_barang)
  if (!s.ok) return fail(s.error)

  const { data: row } = await admin
    .from('stock_lokasi')
    .select('stock')
    .eq('id_lokasi', idLokasi)
    .eq('sku', s.sku)
    .maybeSingle()
  if (!row) return fail('Stok tidak ditemukan di lokasi ini', 404)
  if (Number((row as { stock: number }).stock) > 0) {
    return fail(`Stok masih ${Number((row as { stock: number }).stock)} — habiskan dulu sebelum hapus`)
  }

  const { error } = await admin.from('stock_lokasi').delete().eq('id_lokasi', idLokasi).eq('sku', s.sku)
  if (error) return fail(error.message, 500)
  return { ok: true }
}