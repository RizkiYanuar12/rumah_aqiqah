import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { catatMasuk, hapusStokLokasi, ubahMinStock } from '@/lib/pusat'

// GET /api/inventory/pusat
export async function GET() {
  const auth = await requireApiRole(['inventory'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const [{ data: items, error: eItems }, { data: mutasi, error: eMutasi }] = await Promise.all([
    admin
      .from('v_stock')
      .select('sku,nama_barang,kategori,satuan,stock,min_stock,hpp_average,is_low')
      .eq('id_lokasi', 'PUSAT')
      .order('nama_barang')
      .limit(200),
    admin
      .from('mutasi_stock')
      .select('id_lokasi,sku,jenis,jumlah,harga_satuan,created_at,tanggal_exp')
      .eq('id_lokasi', 'PUSAT')
      .order('created_at', { ascending: false })
      .limit(50),
  ])
  if (eItems) return NextResponse.json({ error: eItems.message }, { status: 500 })
  if (eMutasi) return NextResponse.json({ error: eMutasi.message }, { status: 500 })
  return NextResponse.json({ items: items ?? [], mutasi: mutasi ?? [] })
}

// POST /api/inventory/pusat — catat barang masuk supplier (inventory saja).
export async function POST(req: Request) {
  const auth = await requireApiRole(['inventory'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const rawQty = body?.qty
  const rawHarga = body?.harga_beli
  const result = await catatMasuk(await createAdminClient(), {
    nama_barang: String(body?.nama_barang ?? ''),
    qty: rawQty == null || rawQty === '' ? null : Number(rawQty),
    harga_beli: rawHarga == null || rawHarga === '' ? null : Number(rawHarga),
    satuan: body?.satuan ? String(body.satuan) : null,
    tanggal_exp: body?.tanggal_exp ? String(body.tanggal_exp) : null,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, { status: 201 })
}

// PATCH /api/inventory/pusat — ubah min stock 1 SKU (inventory saja).
export async function PATCH(req: Request) {
  const auth = await requireApiRole(['inventory'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const rawMin = body?.min_stock
  const result = await ubahMinStock(await createAdminClient(), {
    nama_barang: String(body?.nama_barang ?? ''),
    min_stock: rawMin == null || rawMin === '' ? null : Number(rawMin),
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}

// DELETE /api/inventory/pusat?nama=... — hapus baris stok PUSAT yang sudah 0 (inventory saja).
export async function DELETE(req: Request) {
  const auth = await requireApiRole(['inventory'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const nama = new URL(req.url).searchParams.get('nama')
  if (!nama?.trim()) return NextResponse.json({ error: 'Nama barang wajib diisi' }, { status: 400 })
  const result = await hapusStokLokasi(await createAdminClient(), { nama_barang: nama })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result)
}