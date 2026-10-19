import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DaftarPengajuan from './daftar-pengajuan'

export default async function PengajuanPage() {
  const { role, idLokasi } = await requireRole(['cso', 'inventory'])
  const admin = createAdminClient()

  let q = admin
    .from('pengajuan')
    .select('id_pengajuan,id_lokasi,status,created_at,sku,qty,nama_barang')
    .order('created_at', { ascending: false })
    .limit(200)
  if (role === 'cso') {
    if (!idLokasi) {
      return (
        <div className="mx-auto w-full max-w-6xl">
          <h1 className="text-3xl font-light tracking-wide text-[#c2185b]">Pengajuan Restock</h1>
          <p className="mt-2 text-sm text-red-700">Akun belum punya lokasi.</p>
        </div>
      )
    }
    q = q.eq('id_lokasi', idLokasi)
  } else {
    // POV pusat = meja kerja: baris batal (DITOLAK/DIBATALKAN) disembunyikan.
    // Jejak audit tetap di DB; cabang tetap melihat statusnya sendiri.
    q = q.not('status', 'in', '(DITOLAK,DIBATALKAN)')
  }
  const { data } = await q

  const { data: daftarLokasi } = await admin.from('lokasi').select('id_lokasi,nama')
  const namaLokasi = new Map(
    ((daftarLokasi ?? []) as { id_lokasi: string; nama: string }[]).map((l) => [l.id_lokasi, l.nama]),
  )

  const rows = ((data ?? []) as { id_pengajuan: string; id_lokasi: string; status: string; created_at: string; sku: string; qty: number; nama_barang: string | null }[]).map((r) => ({
    ...r,
    nama_lokasi: namaLokasi.get(r.id_lokasi) ?? r.id_lokasi,
  }))

  // Stok PUSAT untuk tiap SKU yang diminta (acuan tombol Setujui).
  const stokPusat: Record<string, number> = {}
  if (role === 'inventory') {
    const skus = [...new Set(rows.map((r) => r.sku).filter(Boolean))]
    if (skus.length) {
      const { data: st } = await admin.from('stock_lokasi').select('sku,stock').eq('id_lokasi', 'PUSAT').in('sku', skus)
      for (const s of (st ?? []) as { sku: string; stock: number }[]) stokPusat[s.sku] = Number(s.stock)
    }
  }

  return (
    <DaftarPengajuan
      initialRows={rows as never}
      mode={role === 'inventory' ? 'pusat' : 'cabang'}
      namaLokasi={role === 'cso' ? (namaLokasi.get(idLokasi!) ?? idLokasi!) : 'Gudang Pusat'}
      stokPusat={stokPusat}
    />
  )
}
