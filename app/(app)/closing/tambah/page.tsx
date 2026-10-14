import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep } from '@/lib/resep'
import FormClosingBaru from './form-closing-baru'

export default async function TambahClosingPage() {
  const { idLokasi } = await requireRole(['seo', 'cso'])

  const admin = createAdminClient()
  const [{ data: paket }, { data: olahan }, grupResep] = await Promise.all([
    admin
      .from('paket')
      .select('id,nama_paket,tipe,porsi,anak,jenis,harga,kategori,deskripsi')
      .eq('is_active', true)
      .order('kategori')
      .order('harga'),
    admin
      .from('olahan')
      .select('id_olahan,nama_olahan,kategori')
      .eq('is_active', true)
      .order('nama_olahan'),
    listResep(admin, idLokasi ?? undefined),
  ])
  const resep = (grupResep ?? []).map((g) => ({
    id_paket: g.id_paket,
    rows: g.rows.map((r) => ({
      sku: r.sku,
      nama: r.nama_barang,
      perPaket: r.qty,
      satuan: r.satuan,
      stock: idLokasi ? r.stock : null,
    })),
  }))

  return <FormClosingBaru paket={paket ?? []} olahan={olahan ?? []} resep={resep} hasLokasi={Boolean(idLokasi)} />
}
