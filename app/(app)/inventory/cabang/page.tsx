import { requireRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DaftarInventory from './daftar-inventory'

export default async function InventoryCabangPage() {
  const { idLokasi } = await requireRole(['cso'])
  if (!idLokasi) {
    return (
      <div className="mx-auto w-full max-w-[1600px]">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">Inventory</p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">Inventory Cabang</h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-3 text-sm text-red-700">Akun belum punya lokasi.</p>
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