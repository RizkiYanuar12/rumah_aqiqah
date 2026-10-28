import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { TIPE_BAYAR, METODE_PEMBAYARAN } from './status'
import type { RincianIn, RincianOk } from './types'

// Validasi dari DB + hitung total di server. Satu sumber hitung untuk create & edit.
export async function resolveRincian(
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