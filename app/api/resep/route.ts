import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep, addResep, updateResepQty, deleteResep } from '@/lib/resep'

// GET /api/resep?q=&limit=
export async function GET(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
    if (!auth.idLokasi) {
        return NextResponse.json({ error: 'Akun tidak punya lokasi' }, { status: 400 })
    }

    const url = new URL(req.url)
    const query = (url.searchParams.get('q') ?? '').trim().toLowerCase()
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 30)

    const admin = createAdminClient()
    const groups = await listResep(admin, auth.idLokasi)
    const items = groups
        .filter((g) => {
            if (!query) return true
            const teks = [g.nama_paket, g.tipe, g.anak, g.jenis]
            if (teks.some((t) => (t ?? '').toLowerCase().includes(query))) return true
            return g.rows.some((r) => r.sku.toLowerCase().includes(query) || r.nama_barang.toLowerCase().includes(query))
        })
        .slice(0, limit)

    return NextResponse.json({ items, id_lokasi: auth.idLokasi })
}

// POST /api/resep { id_paket, sku, qty }
export async function POST(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const r = await addResep(createAdminClient(), {
        id_paket: body?.id_paket,
        sku: body?.sku,
        qty: Number(body?.qty),
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
}

// PATCH /api/resep { id_paket, sku, qty } — qty saja
export async function PATCH(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const r = await updateResepQty(createAdminClient(), {
        id_paket: body?.id_paket,
        sku: body?.sku,
        qty: Number(body?.qty),
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
}

// DELETE /api/resep { id_paket, sku }
export async function DELETE(req: Request) {
    const auth = await requireApiRole(['cso'])
    if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const body = await req.json()
    const r = await deleteResep(createAdminClient(), {
        id_paket: body?.id_paket,
        sku: body?.sku,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
    return NextResponse.json({ ok: true })
}
