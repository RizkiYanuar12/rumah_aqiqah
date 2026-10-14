import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DaftarInventory from './daftar-inventory'

export default async function InventoryCabangPage() {
  const { idLokasi } = await requireRole(['cso'])
  if (!idLokasi) {
    return (
      <div className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Inventory Cabang</h1>
        <p className="mt-2 text-sm text-red-700">Akun belum punya lokasi.</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const [{ data }, { data: daftarLokasi }] = await Promise.all([
    admin
      .from('v_stock')
      .select('sku,nama_barang,kategori,satuan,stock,min_stock,hpp_average,is_low')
      .eq('id_lokasi', idLokasi)
      .order('nama_barang'),
    admin.from('lokasi').select('id_lokasi,nama'),
  ])
  const namaLokasi = daftarLokasi?.find((l) => l.id_lokasi === idLokasi)?.nama ?? idLokasi

  return (
    <DaftarInventory
      initialItems={(data ?? []) as never}
      namaLokasi={namaLokasi}
    />
  )
}