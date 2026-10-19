import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cocokkanSku } from './inventory'

export type PengajuanItemIn = { nama_barang: string; qty: number }

export type PengajuanResult =
  | { ok: true; ids: string[] }
  | { ok: false; error: string; status: number }

// CSO cabang meminta restock dari PUSAT: satu baris per item
export async function buatPengajuan(
  admin: SupabaseClient,
  input: { idLokasi: string; userId: string; items: PengajuanItemIn[] },
): Promise<PengajuanResult> {
  const fail = (error: string, status = 400): PengajuanResult => ({ ok: false, error, status })

  // Nama diketik user; SKU diisi server dari master (pergerakan stok jalan di atas SKU).
  const minta = new Map<string, number>()
  for (const it of input.items ?? []) {
    const nama = it?.nama_barang?.trim?.() ?? ''
    if (!nama) return fail('Nama barang wajib diisi')
    if (!Number.isInteger(it.qty) || it.qty < 1) return fail(`Qty minimal 1 (${nama})`)
    const kunci = nama.toLowerCase()
    minta.set(kunci, (minta.get(kunci) ?? 0) + it.qty)
  }
  if (!minta.size) return fail('Rincian barang wajib diisi')

  const { data: master } = await admin.from('inventory').select('sku,nama_barang')
  const gabung = new Map<string, { sku: string; nama: string; qty: number }>()
  for (const [kunci, qty] of minta) {
    const s = cocokkanSku(
      (master ?? []) as { sku: string; nama_barang: string }[],
      kunci,
      kunci,
    )
    if (!s.ok) return fail(s.error)
    const cur = gabung.get(s.sku)
    gabung.set(s.sku, { sku: s.sku, nama: s.nama_barang, qty: (cur?.qty ?? 0) + qty })
  }

  const { data: created, error: eCreate } = await admin
    .from('pengajuan')
    .insert(
      [...gabung.values()].map((g) => ({
        id_lokasi: input.idLokasi,
        status: 'DIAJUKAN',
        created_by: input.userId,
        sku: g.sku,
        qty: g.qty,
        nama_barang: g.nama,
      })),
    )
    .select('id_pengajuan')
  if (eCreate || !created?.length) return fail(eCreate?.message ?? 'Gagal menyimpan pengajuan', 500)
  return { ok: true, ids: (created as { id_pengajuan: string }[]).map((r) => r.id_pengajuan) }
}

type PutusanResult = { ok: true; id: string } | { ok: false; error: string; status: number }

// Inventory pusat menyetujui SATU BARIS: stok PUSAT -> cabang via RPC atomik
export async function setujuiPengajuan(admin: SupabaseClient, id: string): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { error } = await admin.rpc('setujui_pengajuan', { p_id: id })
  if (error) return fail(error.message)
  return { ok: true, id }
}

// Inventory pusat menandai barang sudah dikirim: DISETUJUI -> DIKIRIM.
// Tanpa gerakan stok (stok sudah pindah saat disetujui); murni penanda fisik.
export async function kirimPengajuan(admin: SupabaseClient, id: string): Promise<PutusanResult> {
  const fail = (error: string, status: number = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin.from('pengajuan').select('id_pengajuan,status').eq('id_pengajuan', id).single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  if ((row as { status: string }).status !== 'DISETUJUI') return fail('Hanya yang DISETUJUI bisa dikirim')
  const { error } = await admin
    .from('pengajuan')
    .update({ status: 'DIKIRIM' })
    .eq('id_pengajuan', id)
  if (error) return fail(error.message, 500)
  return { ok: true, id }
}

// Inventory pusat menolak SATU BARIS: hanya flip status (tanpa gerakan stok).
export async function tolakPengajuan(admin: SupabaseClient, id: string): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('id_pengajuan,status')
    .eq('id_pengajuan', id)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  if ((row as { status: string }).status !== 'DIAJUKAN') return fail('Pengajuan sudah diputuskan')
  const { error } = await admin.from('pengajuan').update({ status: 'DITOLAK' }).eq('id_pengajuan', id)
  if (error) return fail(error.message, 500)
  return { ok: true, id }
}

// CSO cabang mengonfirmasi barang sudah diterima fisik: DIKIRIM -> DITERIMA.
// Murni penanda rekonsiliasi (stok sudah pindah saat DISETUJUI); tanpa gerakan stok.
// Selisih terima (rusak/kurang) diselesaikan manual di luar status ini.
export async function terimaPengajuan(
  admin: SupabaseClient,
  input: { id: string; idLokasi: string },
): Promise<PutusanResult> {
  const fail = (error: string, status: number = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('id_pengajuan,status,id_lokasi')
    .eq('id_pengajuan', input.id)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  const r = row as { status: string; id_lokasi: string }
  if (r.id_lokasi !== input.idLokasi) return fail('Forbidden', 403)
  if (r.status !== 'DIKIRIM') return fail('Hanya yang DIKIRIM bisa diterima')
  const { error } = await admin
    .from('pengajuan')
    .update({ status: 'DITERIMA' })
    .eq('id_pengajuan', input.id)
  if (error) return fail(error.message, 500)
  return { ok: true, id: input.id }
}

// Inventory pusat membatalkan pengajuan (atas info cabang):
// DIAJUKAN/DISETUJUI/DIKIRIM -> DIBATALKAN. Stok yang sudah pindah
// dikembalikan cabang -> PUSAT via RPC atomik. Final: tolak batal.
export async function batalkanPusat(admin: SupabaseClient, id: string): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { error } = await admin.rpc('batalkan_pengajuan', { p_id: id })
  if (error) return fail(error.message)
  return { ok: true, id }
}

// CSO membatalkan pengajuannya: hapus baris, hanya saat DIAJUKAN
export async function batalPengajuan(
  admin: SupabaseClient,
  input: {id: string; idLokasi: string}
): Promise<PutusanResult> {
  const fail = (error: string, status: number = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('id_pengajuan,status,id_lokasi')
    .eq('id_pengajuan', input.id)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  const r = row as { status: string; id_lokasi: string }
  if (r.id_lokasi !== input.idLokasi) return fail('Forbidden', 403)
  if (r.status !== 'DIAJUKAN') return fail('Hanya DIAJUKAN yang bisa ditarik')
  const { error } = await admin.from('pengajuan').delete().eq('id_pengajuan', input.id)
  if (error) return fail(error.message, 500)
  return { ok: true, id: input.id }
}