import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLOSING_ORDERS_SELECT } from '@/lib/closing'
import DaftarClosing from './daftar-closing'

export default async function ClosingPage() {
  const { userId, role, idLokasi } = await requireRole(['seo', 'cso'])

  const admin = createAdminClient()
  let q = admin
    .from('closing')
    .select(
      'id,nama_customer,no_hp,email_customer,alamat,jenis_customer,sumber_informasi,status,created_by,created_at' +
        `,orders(${CLOSING_ORDERS_SELECT})`,
    )
    .order('created_at', { ascending: false })
  q = q.order('created_at', { ascending: false, referencedTable: 'orders' })
  if (role === 'seo') q = q.eq('created_by', userId)
  const { data } = (await q) as unknown as { data: import('./daftar-closing').Closing[] | null }

  // Label interim per SEO (ganti hasil diskusi label kapan saja).
  const { data: authUsers } = await admin.auth.admin.listUsers()
  const namaSEO: Record<string, string> = {}
  for (const u of authUsers?.users ?? []) {
    namaSEO[u.id] = u.email ?? u.id.slice(0, 8)
  }

  // Nama tampil lokasi dari DB (ID seperti BDG-RAYA tetap untuk filter/JWT).
  const { data: daftarLokasi } = await admin.from('lokasi').select('id_lokasi,nama')
  const namaLokasi =
    daftarLokasi?.find((l) => l.id_lokasi === idLokasi)?.nama ?? idLokasi ?? 'BDG-RAYA'

  return <DaftarClosing initialClosing={data ?? []} namaSEO={namaSEO} role={role} namaLokasi={namaLokasi} />
}
