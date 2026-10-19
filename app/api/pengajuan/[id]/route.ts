import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { setujuiPengajuan, tolakPengajuan, kirimPengajuan, terimaPengajuan, batalkanPusat } from '@/lib/pengajuan'

// PATCH /api/pengajuan/[id] — inventory pusat: { aksi: 'setuju' | 'kirim' | 'tolak' | 'batal' };
// CSO cabang (lokasinya sendiri): { aksi: 'terima' } untuk DIKIRIM -> DITERIMA.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiRole(['inventory', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const admin = createAdminClient()

  // Penerimaan fisik hanya oleh CSO cabang pemilik baris (tanpa gerakan stok).
  if (body?.aksi === 'terima') {
    if (auth.role !== 'cso' || !auth.idLokasi) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    const result = await terimaPengajuan(admin, { id, idLokasi: auth.idLokasi })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ...result, oleh: auth.userId })
  }

  if (auth.role !== 'inventory') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const result =
    body?.aksi === 'setuju'
      ? await setujuiPengajuan(admin, id)
      : body?.aksi === 'kirim'
        ? await kirimPengajuan(admin, id)
          : body?.aksi === 'tolak'
            ? await tolakPengajuan(admin, id)
              : body?.aksi === 'batal'
                ? await batalkanPusat(admin, id)
                : null
  if (!result) return NextResponse.json({ error: 'Aksi harus setuju/kirim/tolak/batal' }, { status: 400 })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ...result, oleh: auth.userId })
}
