import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cocokkanSku } from './inventory'

export type PengajuanItemIn = { sku?: string; nama_barang?: string; qty: number }

export type PengajuanResult =
  | { ok: true; batchId: string; batchDate: string; skus: string[] }
  | { ok: false; error: string; status: number }

type PutusanResult = { ok: true; batchId: string; sku: string } | { ok: false; error: string; status: number }

export async function buatPengajuan(
  admin: SupabaseClient,
  input: { idLokasi: string; userId: string; items: PengajuanItemIn[] },
): Promise<PengajuanResult> {
  const fail = (error: string, status = 400): PengajuanResult => ({ ok: false, error, status })

  const { data: master } = await admin.from('inventory').select('sku,nama_barang')
  const masterRows = (master ?? []) as { sku: string; nama_barang: string }[]
  const gabung = new Map<string, { sku: string; nama: string; qty: number }>()

  for (const it of input.items ?? []) {
    const sku = (it?.sku ?? '').trim()
    const nama = (it?.nama_barang ?? '').trim()
    const qty = Number(it?.qty ?? 0)
    if (!nama && !sku) return fail('Nama barang wajib diisi')
    if (!Number.isInteger(qty) || qty < 1) return fail('Qty minimal 1')

    let resolvedSku = sku
    let resolvedNama = nama
    if (resolvedSku) {
      const masterItem = masterRows.find((m) => m.sku === resolvedSku)
      if (!masterItem) return fail('Barang tidak dikenal: ' + resolvedSku)
      resolvedNama = masterItem.nama_barang
    } else {
      const matched = cocokkanSku(masterRows, nama.toLowerCase(), nama)
      if (!matched.ok) return fail(matched.error)
      resolvedSku = matched.sku
      resolvedNama = matched.nama_barang
    }

    const current = gabung.get(resolvedSku)
    gabung.set(resolvedSku, { sku: resolvedSku, nama: resolvedNama, qty: (current?.qty ?? 0) + qty })
  }

  if (!gabung.size) return fail('Rincian barang wajib diisi')

  const tanggal = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date())
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
  const newBatchId = input.idLokasi + '-' + tanggal.replace(/-/g, '') + '-B' + suffix

  const { data: openData, error: openError } = await admin
    .from('pengajuan')
    .select('batch_id, sku, qty, status')
    .eq('id_lokasi', input.idLokasi)
    .eq('batch_date', tanggal)
    .order('created_at', { ascending: false })
  if (openError) return fail(openError.message, 500)

  const batches = new Map<string, { open: boolean; qtyBySku: Map<string, number> }>()
  for (const row of openData ?? []) {
    const item = row as { batch_id: string; sku: string; qty: number; status: string }
    const current = batches.get(item.batch_id) ?? { open: true, qtyBySku: new Map<string, number>() }
    if (item.status !== 'DIAJUKAN') current.open = false
    current.qtyBySku.set(item.sku, (current.qtyBySku.get(item.sku) ?? 0) + Number(item.qty))
    batches.set(item.batch_id, current)
  }

  const openEntry = [...batches.entries()].find(([, value]) => value.open)?.[0]
  const finalBatchId = openEntry ?? newBatchId
  const existingQtyBySku = openEntry ? batches.get(openEntry)!.qtyBySku : new Map<string, number>()

  if (openEntry) {
    for (const [sku, item] of gabung) {
      const finalQty = (existingQtyBySku.get(sku) ?? 0) + item.qty
      const existing = existingQtyBySku.has(sku)
      if (existing) {
        const { error } = await admin
          .from('pengajuan')
          .update({ qty: finalQty })
          .eq('batch_id', finalBatchId)
          .eq('sku', sku)
        if (error) return fail(error.message, 500)
      } else {
        const { error } = await admin
          .from('pengajuan')
          .insert({
            batch_id: finalBatchId,
            batch_date: tanggal,
            id_lokasi: input.idLokasi,
            status: 'DIAJUKAN',
            created_by: input.userId,
            sku,
            qty: finalQty,
            nama_barang: item.nama,
          })
        if (error) return fail(error.message, 500)
      }
    }
  } else {
    const rows = [...gabung.values()].map((item) => ({
      batch_id: newBatchId,
      batch_date: tanggal,
      id_lokasi: input.idLokasi,
      status: 'DIAJUKAN',
      created_by: input.userId,
      sku: item.sku,
      qty: item.qty,
      nama_barang: item.nama,
    }))
    const { error } = await admin.from('pengajuan').insert(rows)
    if (error) return fail(error.message, 500)
  }

  return { ok: true, batchId: finalBatchId, batchDate: tanggal, skus: [...gabung.keys()] }
}

export async function setujuiPengajuan(
  admin: SupabaseClient,
  input: { batchId: string; sku: string },
): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { error } = await admin.rpc('setujui_pengajuan', { p_batch_id: input.batchId, p_sku: input.sku })
  if (error) return fail(error.message)
  return { ok: true, batchId: input.batchId, sku: input.sku }
}

export async function kirimPengajuan(
  admin: SupabaseClient,
  input: { batchId: string; sku: string; oleh?: string },
): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('status')
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  const item = row as { status: string }
  if (item.status !== 'DISETUJUI') return fail('Hanya yang DISETUJUI bisa dikirim')
  const now = new Date().toISOString()
  const { error } = await admin
    .from('pengajuan')
    .update({
      status: 'DIKIRIM',
      dikirim_oleh: input.oleh ?? null,
      dikirim_at: input.oleh ? now : null,
    })
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
  if (error) return fail(error.message, 500)
  if (input.oleh) {
    await admin
      .from('mutasi_stock')
      .update({ dikirim_oleh: input.oleh, dikirim_at: now })
      .eq('id_batch', input.batchId)
      .eq('sku', input.sku)
  }
  return { ok: true, batchId: input.batchId, sku: input.sku }
}

export async function tolakPengajuan(
  admin: SupabaseClient,
  input: { batchId: string; sku: string; alasan: string; oleh: string },
): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const alasan = input.alasan.trim()
  if (!alasan) return fail('Alasan penolakan wajib diisi')
  if (alasan.length > 500) return fail('Alasan penolakan maksimal 500 karakter')
  const { data: row } = await admin
    .from('pengajuan')
    .select('status')
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  if ((row as { status: string }).status !== 'DIAJUKAN') return fail('Pengajuan sudah diputuskan')
  const { error } = await admin
    .from('pengajuan')
    .update({
      status: 'DITOLAK',
      alasan_tolak: alasan,
      ditolak_oleh: input.oleh,
      ditolak_at: new Date().toISOString(),
    })
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
  if (error) return fail(error.message, 500)
  return { ok: true, batchId: input.batchId, sku: input.sku }
}

export async function terimaPengajuan(
  admin: SupabaseClient,
  input: { batchId: string; sku: string; idLokasi: string },
): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('status, id_lokasi')
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  const item = row as { status: string; id_lokasi: string }
  if (item.id_lokasi !== input.idLokasi) return fail('Forbidden', 403)
  if (item.status !== 'DIKIRIM') return fail('Hanya yang DIKIRIM bisa diterima')
  const { error } = await admin
    .from('pengajuan')
    .update({ status: 'DITERIMA' })
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
  if (error) return fail(error.message, 500)
  return { ok: true, batchId: input.batchId, sku: input.sku }
}

export async function batalPengajuan(
  admin: SupabaseClient,
  input: { batchId: string; sku: string; idLokasi: string },
): Promise<PutusanResult> {
  const fail = (error: string, status = 400): PutusanResult => ({ ok: false, error, status })
  const { data: row } = await admin
    .from('pengajuan')
    .select('status, id_lokasi')
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
    .single()
  if (!row) return fail('Pengajuan tidak ditemukan', 404)
  const item = row as { status: string; id_lokasi: string }
  if (item.id_lokasi !== input.idLokasi) return fail('Forbidden', 403)
  if (item.status !== 'DIAJUKAN') return fail('Hanya DIAJUKAN yang bisa ditarik')
  const { error } = await admin
    .from('pengajuan')
    .update({ status: 'DIBATALKAN' })
    .eq('batch_id', input.batchId)
    .eq('sku', input.sku)
  if (error) return fail(error.message, 500)
  return { ok: true, batchId: input.batchId, sku: input.sku }
}