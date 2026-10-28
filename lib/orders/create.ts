import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveRincian } from './resolve'
import { insertRincian, cleanupOrder } from './persist'
import { OrderDetailIn, OrderResult } from './types'

// Buat order. Stok dipotong otomatis oleh trigger DB trg_order_items_stok
// resolveRincian di atas tetap cek dulu agar error ramah ("Stok kurang: ...");
// trigger jadi jaring pengaman atomik untuk race.
export async function createOrderFromDetail(admin: SupabaseClient, input: OrderDetailIn): Promise<OrderResult> {  const fail = (error: string, status = 400): OrderResult => ({ ok: false, error, status })

  const resolved = await resolveRincian(admin, input, input.idLokasi)
  if (!resolved.ok) return fail(resolved.error)
  const { paket, harga_final } = resolved.r

  const id_pesanan = crypto.randomUUID()
  const now = new Date().toISOString()
  const tgl = input.tanggal_transaksi && !isNaN(+new Date(input.tanggal_transaksi))
    ? new Date(input.tanggal_transaksi).toISOString()
    : now
  const { error: eOrder } = await admin.from('orders').insert({
    id_pesanan,
    closing_id: input.closing_id,
    paket_id: paket.id,
    cso_id: input.userId,
    perusahaan: 'ANA',
    varian: 'aqiqah',
    nama_customer: input.nama_customer,
    no_hp: input.no_hp,
    customer_email: input.customer_email,
    alamat: input.alamat,
    tanggal_transaksi: tgl,
    metode_pembayaran: input.metode_pembayaran,
    tipe_pembayaran: input.tipe_pembayaran,
    qty_paket: input.qty,
    waktu_kirim: input.waktu_kirim,
    waktu_tiba: input.waktu_tiba,
    diskon: input.diskon,
    harga_final,
    status: 'PENDING',
    created_at: now,
    id_lokasi: input.idLokasi,
  })
  if (eOrder) return fail(eOrder.message, 500)

  const eRincian = await insertRincian(admin, id_pesanan, input.qty, resolved.r)
  if (eRincian) {
    await cleanupOrder(admin, id_pesanan)
    return fail(eRincian, 500)
  }

  return { ok: true, order_id: id_pesanan, harga_final }
}