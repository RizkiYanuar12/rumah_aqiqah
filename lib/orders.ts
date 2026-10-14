import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export { ORDER_STATUS, TIPE_BAYAR, METODE_PEMBAYARAN, type OrderStatus, type TipeBayar, type MetodePembayaran } from './order-status'
import { TIPE_BAYAR, METODE_PEMBAYARAN } from './order-status'

export type AddonIn = { id_paket: string; qty: number }

export type InventoryIn = { sku: string; qty: number; harga: number }

export type RincianIn = {
  paket_id: string
  qty: number
  olahan_daging: string
  olahan_jeroan: string
  addons: AddonIn[]
  inventory: InventoryIn[]
  tipe_pembayaran: string
  metode_pembayaran: string
  diskon: number
}

export type OrderDetailIn = RincianIn & {
  closing_id: string | null
  nama_customer: string
  no_hp: string
  alamat: string
  customer_email: string | null
  tanggal_transaksi?: string
  waktu_kirim: string
  waktu_tiba: string
  userId: string
  idLokasi: string
}

export type OrderResult = { ok: true; order_id: string; harga_final: number } | { ok: false; error: string; status: number }

type RincianOk = {
  paket: { id: string; nama_paket: string; harga: number; porsi: number | null }
  daging: { id_olahan: string; nama_olahan: string; kategori: string }
  jeroan: { id_olahan: string; nama_olahan: string; kategori: string }
  addonRows: { id: string; nama_paket: string; harga: number; qty: number }[]
  invRows: { sku: string; nama: string; qty: number; harga: number; hpp: number }[]
  bomRows: { sku: string; qty: number; hpp: number }[]
  harga_final: number
}

// Validasi dari DB + hitung total di server. Satu sumber hitung untuk create & edit.
async function resolveRincian(
  admin: SupabaseClient,
  input: RincianIn,
  idLokasi?: string,
  checkStock = true,
  // Stok yang sudah dipegang order ini (path edit): validasi hanya selisihnya,
  // agar ubah-tanpa-naik-qty tidak ditolak stok yang sedang ia pegang sendiri.
  oldHeld?: Map<string, number>,
): Promise<{ ok: true; r: RincianOk } | { ok: false; error: string }> {
  const bad = (error: string) => ({ ok: false as const, error })

  if (!input.paket_id) return bad('Paket wajib dipilih')
  if (!Number.isInteger(input.qty) || input.qty < 1) return bad('Qty paket minimal 1')
  if (!input.olahan_daging || !input.olahan_jeroan) return bad('Olahan daging + jeroan wajib dipilih')
  if (!(TIPE_BAYAR as readonly string[]).includes(input.tipe_pembayaran)) return bad('Tipe pembayaran tidak valid')
  if (!(METODE_PEMBAYARAN as readonly string[]).includes(input.metode_pembayaran)) return bad('Metode Pembayaran tidak valid')
  if (!(input.diskon >= 0)) return bad('Diskon tidak valid')

  const { data: paket } = await admin
    .from('paket')
    .select('id,nama_paket,harga,kategori,porsi')
    .eq('id', input.paket_id)
    .eq('is_active', true)
    .single()
  if (!paket || paket.kategori !== 'PAKET') return bad('Paket tidak ditemukan / tidak aktif')

  const { data: olahan } = await admin
    .from('olahan')
    .select('id_olahan,nama_olahan,kategori')
    .in('id_olahan', [input.olahan_daging, input.olahan_jeroan])
    .eq('is_active', true)
  const daging = olahan?.find((o) => o.id_olahan === input.olahan_daging && o.kategori === 'OLAHAN_DAGING')
  const jeroan = olahan?.find((o) => o.id_olahan === input.olahan_jeroan && o.kategori === 'OLAHAN_TULANG_JEROAN')
  if (!daging || !jeroan) return bad('Olahan tidak valid (daging + tulang/jeroan)')

  const addonRows: RincianOk['addonRows'] = []
  for (const a of input.addons) {
    if (!a?.id_paket || !Number.isInteger(a.qty) || a.qty < 1) return bad('Qty add-on minimal 1')
  }
  if (input.addons.length) {
    const { data: addonPaket } = await admin
      .from('paket')
      .select('id,nama_paket,harga,kategori')
      .in('id', input.addons.map((a) => a.id_paket))
      .eq('is_active', true)
    for (const a of input.addons) {
      const p = addonPaket?.find((x) => x.id === a.id_paket)
      if (!p || p.kategori !== 'Additional & Upgrade') return bad('Add-on tidak valid')
      addonRows.push({ id: p.id, nama_paket: p.nama_paket, harga: Number(p.harga), qty: a.qty })
    }
  }

  // (olahan_item, qty_per_porsi × porsi × qty). Desain simple: 1 SKU box
  // per varian (Sultana = box sultana + bento); kambing milik vendor, di luar stok.
  const bomNeed = new Map<string, number>()
  const porsiUtama = Number((paket as { porsi?: number | null } | null)?.porsi) || 1
  const { data: resep } = await admin
    .from('paket_items')
    .select('id_paket,sku,qty')
    .in('id_paket', [input.paket_id, ...input.addons.map((a) => a.id_paket)])
  // Guard anti lolos sunyi: paket utama wajib punya resep (add-on tanpa resep tetap lolos).
  if (!(resep ?? []).some((r) => r.id_paket === input.paket_id)) {
    return bad('Paket belum punya resep — isi di menu Resep dulu')
  }
  const qtyBaris = new Map<string, number>([[input.paket_id, input.qty]])
  for (const a of input.addons) qtyBaris.set(a.id_paket, (qtyBaris.get(a.id_paket) ?? 0) + a.qty)
  for (const r of resep ?? []) {
    const q = Number(r.qty) * (qtyBaris.get(r.id_paket) ?? 0)
    if (q) bomNeed.set(r.sku, (bomNeed.get(r.sku) ?? 0) + q)
  }
  const { data: bumbu } = await admin
    .from('olahan_item')
    .select('sku,qty_per_porsi')
    .in('id_olahan', [input.olahan_daging, input.olahan_jeroan])
  for (const o of bumbu ?? []) {
    const q = Number(o.qty_per_porsi) * porsiUtama * input.qty
    if (q) bomNeed.set(o.sku, (bomNeed.get(o.sku) ?? 0) + q)
  }

  const bomSkus = [...bomNeed.keys()]
  const bomRows: RincianOk['bomRows'] = []
  if (bomSkus.length && idLokasi) {
    const [{ data: bomMaster }, { data: bomStock }] = await Promise.all([
      admin.from('inventory').select('sku,nama_barang').in('sku', bomSkus),
      admin.from('stock_lokasi').select('sku,stock,hpp_average').eq('id_lokasi', idLokasi).in('sku', bomSkus),
    ])
    for (const [sku, need] of bomNeed) {
      const m = bomMaster?.find((x) => x.sku === sku)
      const st = bomStock?.find((x) => x.sku === sku)
      const kurang = need - (oldHeld?.get(sku) ?? 0)
      if (checkStock && (!st || Number(st.stock) < kurang)) {
        return bad(`Stok kurang: ${m?.nama_barang ?? sku} (sisa ${Number(st?.stock) || 0}, butuh ${need})`)
      }
      bomRows.push({ sku, qty: need, hpp: Number(st?.hpp_average) || 0 })
    }
  } else {
    for (const [sku, need] of bomNeed) bomRows.push({ sku, qty: need, hpp: 0 })
  }

  const total = Number(paket.harga) * input.qty + addonRows.reduce((s, a) => s + a.harga * a.qty, 0)
  const invRows: RincianOk['invRows'] = []
  const invIn = Array.isArray(input.inventory) ? input.inventory : []
  if (invIn.length) {
    const skus = [...new Set(invIn.map((v) => v?.sku).filter(Boolean))]
    const [{ data: invMaster }, { data: invStock }] = await Promise.all([
      admin.from('inventory').select('sku,nama_barang').in('sku', skus),
      idLokasi
        ? admin.from('stock_lokasi').select('sku,stock').eq('id_lokasi', idLokasi).in('sku', skus)
        : Promise.resolve({ data: [] as { sku: string; stock: number }[] }),
    ])
    for (const v of invIn) {
      if (!v?.sku || !Number.isInteger(v.qty) || v.qty < 1) return bad('Qty item inventory minimal 1')
      if (!(v.harga >= 0)) return bad('Harga item inventory tidak valid')
      const m = invMaster?.find((x) => x.sku === v.sku)
      if (!m) return bad(`Item tidak ditemukan: ${v.sku}`)
      if (idLokasi && checkStock) {
        const st = (invStock as { sku: string; stock: number }[] | null)?.find((x) => x.sku === v.sku)
        const kurang = v.qty - (oldHeld?.get(v.sku) ?? 0)
        if (!st || Number(st.stock) < kurang) return bad(`Stok kurang: ${m.nama_barang} (sisa ${Number(st?.stock) || 0})`)
      }
      // HPP = harga jual (tidak ada input HPP terpisah).
      invRows.push({ sku: v.sku, nama: m.nama_barang, qty: v.qty, harga: Number(v.harga), hpp: Number(v.harga) })
    }
  }

  const grand = total + invRows.reduce((s, v) => s + v.harga * v.qty, 0)
  if (input.diskon > grand) return bad('Diskon melebihi total')

  return { ok: true, r: { paket, daging, jeroan, addonRows, invRows, bomRows, harga_final: grand - input.diskon } }
}

async function insertRincian(
  admin: SupabaseClient,
  order_id: string,
  qty: number,
  r: RincianOk,
): Promise<string | null> {
  const id_baris = crypto.randomUUID()
  const invLines = r.invRows.map((v) => ({ ...v, id_baris: crypto.randomUUID() }))
  const { error: eLines } = await admin.from('order_lines').insert([
    {
      id_baris,
      order_id,
      id_paket: r.paket.id,
      nama_paket: r.paket.nama_paket,
      kategori: 'PAKET',
      qty,
      harga_satuan: r.paket.harga,
      hpp_satuan: 0,
    },
    ...r.addonRows.map((a) => ({
      id_baris: crypto.randomUUID(),
      order_id,
      id_paket: a.id,
      nama_paket: a.nama_paket,
      kategori: 'Additional & Upgrade',
      qty: a.qty,
      harga_satuan: a.harga,
      hpp_satuan: 0,
    })),
    ...invLines.map((v) => ({
      id_baris: v.id_baris,
      order_id,
      id_paket: null,
      nama_paket: v.nama,
      kategori: 'Additional & Upgrade',
      qty: v.qty,
      harga_satuan: v.harga,
      hpp_satuan: v.hpp,
    })),
  ])
  if (eLines) return eLines.message

  if (invLines.length || r.bomRows.length) {
    const { error: eItems } = await admin.from('order_items').insert([
      ...invLines.map((v) => ({
        order_id,
        id_baris: v.id_baris,
        sku: v.sku,
        qty: v.qty,
        hpp_snapshot: v.hpp,
      })),
      ...r.bomRows.map((v) => ({
        order_id,
        id_baris,
        sku: v.sku,
        qty: v.qty,
        hpp_snapshot: v.hpp,
      })),
    ])
    if (eItems) return eItems.message
  }

  const { error: eOlahan } = await admin.from('order_olahan').insert([
    { id_baris, id_olahan: r.daging.id_olahan, nama_olahan: r.daging.nama_olahan, kategori: r.daging.kategori },
    { id_baris, id_olahan: r.jeroan.id_olahan, nama_olahan: r.jeroan.nama_olahan, kategori: r.jeroan.kategori },
  ])
  if (eOlahan) return eOlahan.message
  return null
}

// Hapus order + seluruh rinciannya (tanpa andalkan FK cascade DB).
async function cleanupOrder(admin: SupabaseClient, order_id: string) {
  const { data: baris } = await admin.from('order_lines').select('id_baris').eq('order_id', order_id)
  const ids = (baris ?? []).map((b) => b.id_baris)
  await admin.from('order_items').delete().eq('order_id', order_id)
  if (ids.length) await admin.from('order_olahan').delete().in('id_baris', ids)
  await admin.from('order_lines').delete().eq('order_id', order_id)
  await admin.from('orders').delete().eq('id_pesanan', order_id)
}

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

export type EditRincianIn = RincianIn & {
  waktu_kirim: string
  waktu_tiba: string
}

// Semua validasi lolos dulu sebelum ada baris yang dihapus.
export async function updateOrderRincian(
  admin: SupabaseClient,
  order_id: string,
  input: EditRincianIn,
): Promise<OrderResult> {
  const fail = (error: string, status = 400): OrderResult => ({ ok: false, error, status })

  const { data: order } = await admin.from('orders').select('id_lokasi').eq('id_pesanan', order_id).single()
  // Validasi selisih vs stok yang sudah dipegang SEBELUM baris lama dihapus:
  // gagal di sini = order utuh; gagal di trigger setelah hapus = order yatim.
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
