import { requireRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep } from '@/lib/resep'
import DaftarResep from './daftar-resep'

export default async function ResepPage() {
  const { idLokasi } = await requireRole(['cso'])
  if (!idLokasi) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">Resep</p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">Resep Paket</h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-3 text-sm text-red-700">Akun belum punya lokasi.</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data: daftarLokasi }, groups] = await Promise.all([
    admin.from('lokasi').select('id_lokasi,nama'),
    listResep(admin, idLokasi),
  ])
  const namaLokasi = daftarLokasi?.find((l) => l.id_lokasi === idLokasi)?.nama ?? idLokasi

  return <DaftarResep initialGroups={groups} namaLokasi={namaLokasi} />
}
