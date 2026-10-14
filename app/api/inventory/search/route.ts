import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

// GET /api/inventory/search?q=nasi&limit=20
// → { items: [{ sku, nama_barang, satuan, stock, hpp_average }] }
export async function GET(req: Request) {
  const auth = await requireApiRole(['seo', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.idLokasi) {
    return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })
  }

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase()
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 50)

  const admin = createAdminClient()
  let query = admin
    .from('stock_lokasi')
    .select('sku,stock,hpp_average, inventory(sku,nama_barang,satuan)')
    .eq('id_lokasi', auth.idLokasi)
  if (q) {
    // Saring SKU di DB dulu (koma/tanda kurung dipecah parser or(), buang).
    const safe = q.replace(/[%(),]/g, '').trim()
    if (!safe) return NextResponse.json({ items: [] })
    const { data: cocok, error: eCocok } = await admin
      .from('inventory')
      .select('sku')
      .or(`nama_barang.ilike.%${safe}%,sku.ilike.%${safe}%`)
      .limit(200)
    if (eCocok) return NextResponse.json({ error: eCocok.message }, { status: 500 })
    const skus = (cocok ?? []).map((r) => r.sku as string)
    if (!skus.length) return NextResponse.json({ items: [] })
    query = query.in('sku', skus)
  } else {
    query = query.limit(200)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data ?? [])
    .map((r) => {
      const inv = Array.isArray(r.inventory) ? r.inventory[0] : r.inventory
      return {
        sku: r.sku as string,
        nama_barang: (inv as { nama_barang?: string } | null)?.nama_barang ?? (r.sku as string),
        satuan: (inv as { satuan?: string } | null)?.satuan ?? '',
        stock: Number(r.stock) || 0,
        hpp_average: Number(r.hpp_average) || 0,
      }
    })
    .slice(0, limit)

  return NextResponse.json({ items })
}
