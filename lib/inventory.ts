import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type MasterRow = { sku: string; nama_barang: string }

type Cocok = { ok: true; sku: string; nama_barang: string } | { ok: false; error: string }

// Pencocokan murni (tanpa query): nama persis tak-peka-huruf.
// `tampil` = teks untuk pesan error (asli ketikan user, bukan lower-case).
export function cocokkanSku(
  master: MasterRow[] | null | undefined,
  kunci: string,
  tampil: string,
): Cocok {
  if (!kunci) return { ok: false, error: 'Nama barang wajib diisi' }
  const cocok = (master ?? []).filter((m) => (m.nama_barang ?? '').trim().toLowerCase() === kunci)
  if (!cocok.length) return { ok: false, error: `Barang tidak dikenal: ${tampil}` }
  if (cocok.length > 1) return { ok: false, error: `Nama tidak unik, pilih dari saran: ${cocok[0].nama_barang}` }
  return { ok: true, sku: cocok[0].sku, nama_barang: cocok[0].nama_barang }
}

// Petakan nama barang (ketikan user) ke SKU master.
// Dipakai form pengajuan (CSO) + form barang masuk (inventory).
export async function resolveSku(admin: SupabaseClient, nama: string): Promise<Cocok> {
  const mentah = nama?.trim?.() ?? ''
  if (!mentah) return { ok: false, error: 'Nama barang wajib diisi' }
  const { data: master } = await admin.from('inventory').select('sku,nama_barang')
  return cocokkanSku((master ?? []) as MasterRow[], mentah.toLowerCase(), mentah)
}
