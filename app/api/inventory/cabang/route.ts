import {NextResponse} from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { catatMasuk, hapusStokLokasi, ubahMinStock } from '@/lib/pusat'

// GET /api/inventory/cabang
export async function GET(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if(!auth.idLokasi) {
        return NextResponse.json({ error: "Akun tidak punya lokasi" }, {status: 400})
    }

    const url = new URL(req.url)
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 30)

    const admin = createAdminClient()
    const {data, error} = await admin
        .from('v_stock')
        .select('sku, nama_barang, kategori, satuan, stock, min_stock, hpp_average, is_low')
        .eq('id_lokasi', auth.idLokasi)
        .order('nama_barang')
        .limit(200)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const items = (data ?? [])
        .map((r) => {
            return {
                sku: r.sku as string,
                nama_barang: (r.nama_barang ?? r.sku),
                kategori: (r.kategori ?? ''),
                satuan: (r.satuan ?? ''),
                stock: Number(r.stock) || 0,
                min_stock: r.min_stock==null ? null: Number(r.min_stock),
                hpp_average: Number(r.hpp_average) || 0,
                is_low: !!r.is_low
            }
        })
        .filter((it) => !query || String(it.nama_barang ?? '').toLowerCase().includes(query) || String(it.sku ?? '').toLowerCase().includes(query))
        .slice(0, limit)
    
    return NextResponse.json({items, id_lokasi: auth.idLokasi})
}

// POST /api/inventory/cabang — catat barang masuk di lokasi CSO.
export async function POST(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.idLokasi) return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })

    const body = await req.json().catch(() => null)
    const rawQty = body?.qty
    const rawHarga = body?.harga_beli
    const result = await catatMasuk(await createAdminClient(), {
        id_lokasi: auth.idLokasi,
        nama_barang: String(body?.nama_barang ?? ''),
        qty: rawQty == null || rawQty === '' ? null : Number(rawQty),
        harga_beli: rawHarga == null || rawHarga === '' ? null : Number(rawHarga),
        satuan: String(body?.satuan ?? '').trim() || null,
        tanggal_exp: String(body?.tanggal_exp ?? '').trim() || null,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result, { status: 201 })
}

// PATCH /api/inventory/cabang — ubah min. stok 1 SKU di lokasi CSO.
export async function PATCH(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.idLokasi) return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })

    const body = await req.json().catch(() => null)
    const result = await ubahMinStock(await createAdminClient(), {
        id_lokasi: auth.idLokasi,
        nama_barang: String(body?.nama_barang ?? ''),
        min_stock: body?.min_stock == null ? null : Number(body.min_stock),
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
}

// DELETE /api/inventory/cabang?nama=... — hapus baris stok lokasi CSO yang sudah 0.
export async function DELETE(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.idLokasi) return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })

    const nama = new URL(req.url).searchParams.get('nama')
    if (!nama?.trim()) return NextResponse.json({ error: 'Nama barang wajib diisi' }, { status: 400 })
    const result = await hapusStokLokasi(await createAdminClient(), {
        id_lokasi: auth.idLokasi,
        nama_barang: nama,
    })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json(result)
}