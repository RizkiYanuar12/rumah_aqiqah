import { requireRole } from '@/lib/auth/auth'
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
      .select('sku,jenis,jumlah,harga_satuan,tanggal_exp,created_at,id_batch,id_lokasi,id_lokasi_tujuan,tujuan:id_lokasi_tujuan(nama),dikirim_oleh,dikirim_at')
      .eq('id_lokasi', 'PUSAT')
      .order('created_at', { ascending: false })
      .limit(50),
    admin.from('inventory').select('sku,nama_barang,satuan'),
  ])
   const nama = new Map(
     ((master ?? []) as { sku: string; nama_barang: string; satuan: string | null }[]).map((m) => [m.sku, m.nama_barang]),
   )
   const idsPengirim = [...new Set(((mutasi ?? []) as { dikirim_oleh: string | null }[]).map((m) => m.dikirim_oleh).filter((v): v is string => Boolean(v)))]
   const namaPengirim = new Map<string, string>()
   await Promise.all(
     idsPengirim.map(async (id) => {
       const { data: u } = await admin.auth.admin.getUserById(id)
       if (u?.user) namaPengirim.set(id, u.user.email ?? id.slice(0, 8))
     }),
   )
   const riwayat = ((mutasi ?? []) as { sku: string; dikirim_oleh: string | null }[]).map((m) => ({
     ...m,
     nama_barang: nama.get(m.sku) ?? m.sku,
     nama_pengirim: m.dikirim_oleh ? (namaPengirim.get(m.dikirim_oleh) ?? m.dikirim_oleh.slice(0, 8)) : null,
   }))

  return (
    <DaftarStock
      initialItems={(items ?? []) as never}
      initialMutasi={riwayat as never}
      master={((master ?? []) as { sku: string; nama_barang: string; satuan: string | null }[]) as never}
    />
  )
}
