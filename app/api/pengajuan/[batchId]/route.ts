import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { setujuiPengajuan, kirimPengajuan, tolakPengajuan, terimaPengajuan } from '@/lib/inventory/pengajuan'

export async function PATCH(req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  const auth = await requireApiRole(['inventory', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { batchId } = await params
  const body = await req.json().catch(() => null)
  const sku = String(body?.sku ?? '')
  const admin = createAdminClient()

  if (body?.aksi === 'terima') {
    if (auth.role !== 'cso' || !auth.idLokasi) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await terimaPengajuan(admin, { batchId, sku, idLokasi: auth.idLokasi })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ...result, oleh: auth.userId })
  }

  if (auth.role !== 'inventory') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const result =
    body?.aksi === 'setuju'
      ? await setujuiPengajuan(admin, { batchId, sku })
      : body?.aksi === 'kirim'
        ? await kirimPengajuan(admin, { batchId, sku, oleh: auth.userId })
        : body?.aksi === 'tolak'
          ? await tolakPengajuan(admin, { batchId, sku, alasan: typeof body?.alasan === 'string' ? body.alasan : '', oleh: auth.userId })
          : null

  if (!result) return NextResponse.json({ error: 'Aksi harus setuju/kirim/tolak' }, { status: 400 })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ...result, oleh: auth.userId })
}