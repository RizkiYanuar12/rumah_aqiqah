import { notFound } from 'next/navigation'
import { requireRole } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep } from '@/lib/resep'
import FormUbahOrder, { type UbahInitial } from './form-ubah-order'

const TERMINAL = ['BATAL']

// datetime-local butuh 'YYYY-MM-DDTHH:mm' (input tidak paham ISO + zona).
const toLocalInput = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(+d)) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export default async function UbahOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { idLokasi } = await requireRole(['seo', 'cso'])
  const { id } = await params

  const admin = createAdminClient()
  const [{ data: order }, { data: lines }, { data: items }, { data: paket }, { data: olahan }] = await Promise.all([
    admin
      .from('orders')
      .select(
        'id_pesanan,status,tipe_pembayaran,metode_pembayaran,qty_paket,diskon,harga_final,waktu_kirim,waktu_tiba,id_lokasi,closing(id,nama_customer,no_hp,alamat)',
      )
      .eq('id_pesanan', id)
      .single(),
    admin
      .from('order_lines')
      .select('id_baris,id_paket,nama_paket,kategori,qty,harga_satuan,hpp_satuan,order_olahan(id_olahan,nama_olahan,kategori)')
      .eq('order_id', id),
    admin.from('order_items').select('id_baris,sku,qty,hpp_snapshot').eq('order_id', id),
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
  ])
  if (!order) notFound()

  const rows = lines ?? []
  const utama = rows.find((li) => li.kategori === 'PAKET')
  const olahanTerpilih = rows.flatMap((li) => li.order_olahan ?? [])
  const addonQty: Record<string, number> = {}
  for (const li of rows) {
    if (li.kategori !== 'PAKET' && li.id_paket) addonQty[li.id_paket] = Number(li.qty) || 0
  }
  const itemByBaris = new Map((items ?? []).map((it) => [it.id_baris, it]))
  const inventory = rows
    .filter((li) => !li.id_paket)
    .map((li) => ({
      sku: (itemByBaris.get(li.id_baris) as { sku?: string } | undefined)?.sku ?? '',
      nama_barang: li.nama_paket as string,
      satuan: '',
      stock: Number(li.qty) || 0,
      qty: Number(li.qty) || 1,
      harga: Number(li.harga_satuan) || 0,
    }))
    .filter((v) => v.sku)
  const closing = Array.isArray(order.closing) ? (order.closing[0] ?? null) : (order.closing ?? null)

  const initial: UbahInitial = {
    paketId: utama?.id_paket ?? '',
    qty: Number(order.qty_paket) || 1,
    dagingId: olahanTerpilih.find((o) => o.kategori === 'OLAHAN_DAGING')?.id_olahan ?? '',
    jeroanId: olahanTerpilih.find((o) => o.kategori !== 'OLAHAN_DAGING')?.id_olahan ?? '',
    addonQty,
    invRows: inventory,
    tipe: order.tipe_pembayaran === 'CICILAN' ? 'CICILAN' : 'TUNAI',
    metode: (order as { metode_pembayaran?: string }).metode_pembayaran ?? '',
    diskon: Number(order.diskon) || 0,
    waktuKirim: toLocalInput(order.waktu_kirim),
    waktuTiba: toLocalInput(order.waktu_tiba),
  }

  // Stok sesuai lokasi order (bukan lokasi user) — breakdown = angka yang dipakai validasi server.
  const scopeLokasi =
    (order as { id_lokasi?: string | null } | null)?.id_lokasi ?? idLokasi ?? undefined
  const grupResep = await listResep(admin, scopeLokasi)
  const resep = (grupResep ?? []).map((g) => ({
    id_paket: g.id_paket,
    rows: g.rows.map((r) => ({
      sku: r.sku,
      nama: r.nama_barang,
      perPaket: r.qty,
      satuan: r.satuan,
      stock: scopeLokasi ? r.stock : null,
    })),
  }))

  return (
    <FormUbahOrder
      orderId={order.id_pesanan}
      status={order.status}
      terminal={TERMINAL.includes(order.status ?? '')}
      customer={{
        nama: (closing as { nama_customer?: string } | null)?.nama_customer ?? '—',
        no_hp: (closing as { no_hp?: string } | null)?.no_hp ?? '—',
        alamat: (closing as { alamat?: string } | null)?.alamat ?? '—',
      }}
      paket={paket ?? []}
      olahan={olahan ?? []}
      resep={resep}
      initial={initial}
    />
  )
}
