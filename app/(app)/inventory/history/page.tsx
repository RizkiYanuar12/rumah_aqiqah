import { requireRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import DaftarPengajuan, { type PengajuanRow } from './daftar-pengajuan'

export default async function PengajuanPage() {
  const { role, idLokasi } = await requireRole(['cso', 'inventory'])
  const admin = createAdminClient()

  let q = admin
    .from('pengajuan')
    .select('batch_id,batch_date,id_lokasi,status,created_at,sku,qty,nama_barang,alasan_tolak,ditolak_oleh,ditolak_at')
    .order('created_at', { ascending: false })
    .limit(200)
  if (role === 'cso') {
    if (!idLokasi) {
      return (
        <div className="mx-auto w-full max-w-[1600px]">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">Inventory</p>
          <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">History Pengajuan</h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-3 text-sm text-red-700">Akun belum punya lokasi.</p>
        </div>
      )
    }
    q = q.eq('id_lokasi', idLokasi)
  }
  q = q.neq('status', 'DIBATALKAN')
  const { data, error } = await q
  if (error) {
    return (
      <div className="mx-auto w-full max-w-[1600px]">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">Inventory</p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">History Pengajuan</h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-3 text-sm text-red-700">Gagal memuat pengajuan: {error.message}</p>
      </div>
    )
  }

  const { data: daftarLokasi } = await admin.from('lokasi').select('id_lokasi,nama')
  const namaLokasi = new Map(
    ((daftarLokasi ?? []) as { id_lokasi: string; nama: string }[]).map((l) => [l.id_lokasi, l.nama]),
  )

  const rows: PengajuanRow[] = ((data ?? []) as {
    batch_id: string
    batch_date: string
    id_lokasi: string
    status: string
    created_at: string
    sku: string
    qty: number
    nama_barang: string | null
    alasan_tolak: string | null
    ditolak_oleh: string | null
    ditolak_at: string | null
  }[]).map((r) => ({
    ...r,
    nama_lokasi: namaLokasi.get(r.id_lokasi) ?? r.id_lokasi,
    nama_penolak: null,
  }))

  const idsPenolak = [...new Set(rows.map((r) => r.ditolak_oleh).filter((v): v is string => Boolean(v)))]
  const namaPenolak = new Map<string, string>()
  await Promise.all(
    idsPenolak.map(async (id) => {
      const { data: authUser } = await admin.auth.admin.getUserById(id)
      if (authUser?.user) namaPenolak.set(id, authUser.user.email ?? id.slice(0, 8))
    }),
  )
  for (const r of rows) {
    r.nama_penolak = r.ditolak_oleh
      ? (namaPenolak.get(r.ditolak_oleh) ?? r.ditolak_oleh.slice(0, 8))
      : null
  }

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