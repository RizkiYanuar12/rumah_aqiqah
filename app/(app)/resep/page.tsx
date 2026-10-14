import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep } from '@/lib/resep'
import DaftarResep from './daftar-resep'

export default async function ResepPage() {
  const { idLokasi } = await requireRole(['cso'])
  if (!idLokasi) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Resep Paket</h1>
        <p className="mt-2 text-sm text-red-700">Akun belum punya lokasi.</p>
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
