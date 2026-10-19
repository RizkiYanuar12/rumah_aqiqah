import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DaftarStock from './daftar-stock'

export default async function StockPage() {
  await requireRole(['inventory'])

  const admin = createAdminClient()
  const [{ data: items }, { data: mutasi }, { data: master }] = await Promise.all([
    admin
      .from('v_stock')
      .select('sku,nama_barang,kategori,satuan,stock,min_stock,hpp_average,is_low')
      .eq('id_lokasi', 'PUSAT')
      .order('nama_barang')
      .limit(200),
    admin
      .from('mutasi_stock')
      .select('sku,jenis,jumlah,harga_satuan,tanggal_exp,created_at')
      .eq('id_lokasi', 'PUSAT')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('inventory').select('sku,nama_barang,satuan'),
  ])
  const nama = new Map(
    ((master ?? []) as { sku: string; nama_barang: string; satuan: string | null }[]).map((m) => [m.sku, m.nama_barang]),
  )
  const riwayat = ((mutasi ?? []) as { sku: string }[]).map((m) => ({
    ...m,
    nama_barang: nama.get(m.sku) ?? m.sku,
  }))

  return (
    <DaftarStock
      initialItems={(items ?? []) as never}
      initialMutasi={riwayat as never}
      master={((master ?? []) as { sku: string; nama_barang: string; satuan: string | null }[]) as never}
    />
  )
}
