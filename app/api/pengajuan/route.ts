import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { buatPengajuan, batalPengajuan } from '@/lib/pengajuan'

// GET /api/pengajuan — daftar baris. CSO: lokasinya sendiri. Inventory: semua.
export async function GET() {
  const auth = await requireApiRole(['cso', 'inventory'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  let q = admin
    .from('pengajuan')
    .select('id_pengajuan,id_lokasi,status,created_by,created_at,sku,qty,nama_barang')
    .order('created_at', { ascending: false })
    .limit(200)
  if (auth.role === 'cso') {
    if (!auth.idLokasi) return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })
    q = q.eq('id_lokasi', auth.idLokasi)
  }
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pengajuan: data })
}

// POST /api/pengajuan — CSO cabang mengajukan restock dari PUSAT (satu baris per item).
export async function POST(req: Request) {
  const auth = await requireApiRole(['cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!auth.idLokasi) {
    return NextResponse.json({ error: 'Akun belum punya lokasi' }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const items = Array.isArray(body?.items)
    ? body.items.map((v: { nama_barang?: string; qty?: number }) => ({
        nama_barang: String(v?.nama_barang ?? ''),
        qty: Number(v?.qty ?? 0),
      }))
    : []
  const result = await buatPengajuan(await createAdminClient(), {
    idLokasi: auth.idLokasi,
    userId: auth.userId,
    items,
  })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json(result, { status: 201 })
}

// DELETE /api/pengajuan - CSO menghapus pengajuan yang masih berstatus DIAJUKAN
export async function DELETE(req: Request) {
  const auth = await requireApiRole(['cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!auth.idLokasi) {
    return NextResponse.json({error: 'Akun tidak memiliki lokasi'}, {status: 400})
  }

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id wajib diisi' }, { status: 400 })
  const result = await batalPengajuan(await createAdminClient(), {id, idLokasi: auth.idLokasi})
  if (!result.ok) return NextResponse.json({ error: result.error }, {status: result.status})
  return NextResponse.json(result)
}
