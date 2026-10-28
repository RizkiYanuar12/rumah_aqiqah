import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRincian } from './resolve'
import { insertRincian } from './persist'
import type { EditRincianIn, OrderResult } from './types'

// Semua validasi lolos dulu sebelum ada baris yang dihapus.
export async function updateOrderRincian(
  admin: SupabaseClient,
  order_id: string,
  input: EditRincianIn,
): Promise<OrderResult> {
  const fail = (error: string, status = 400): OrderResult => ({ ok: false, error, status })

  const { data: order } = await admin.from('orders').select('id_lokasi').eq('id_pesanan', order_id).single()
  // Validasi selisih vs stok yang sudah dipegang SEBELUM baris lama dihapus:
  const { data: oldItems } = await admin.from('order_items').select('sku,qty').eq('order_id', order_id)
  const oldHeld = new Map<string, number>()
  for (const it of oldItems ?? []) {
    if (!it.sku) continue
    oldHeld.set(it.sku, (oldHeld.get(it.sku) ?? 0) + Number(it.qty))
  }
  const resolved = await resolveRincian(
    admin,
    input,
    (order as { id_lokasi?: string } | null)?.id_lokasi,
    true,
    oldHeld,
  )
  if (!resolved.ok) return fail(resolved.error)
  const { paket, harga_final } = resolved.r

  const { data: baris } = await admin.from('order_lines').select('id_baris').eq('order_id', order_id)
  const ids = (baris ?? []).map((b) => b.id_baris)
  if (ids.length) {
    await admin.from('order_items').delete().eq('order_id', order_id)
    await admin.from('order_olahan').delete().in('id_baris', ids)
    const { error: eDel } = await admin.from('order_lines').delete().eq('order_id', order_id)
    if (eDel) return fail(eDel.message, 500)
  }

  const eRincian = await insertRincian(admin, order_id, input.qty, resolved.r)
  if (eRincian) return fail(eRincian, 500)

  const { error: eUp } = await admin
    .from('orders')
    .update({
      paket_id: paket.id,
      qty_paket: input.qty,
      metode_pembayaran: input.metode_pembayaran,
      tipe_pembayaran: input.tipe_pembayaran,
      diskon: input.diskon,
      harga_final,
      waktu_kirim: input.waktu_kirim,
      waktu_tiba: input.waktu_tiba,
    })
    .eq('id_pesanan', order_id)
  if (eUp) return fail(eUp.message, 500)

  return { ok: true, order_id, harga_final }
}