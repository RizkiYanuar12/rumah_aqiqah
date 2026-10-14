export const SUMBER_INFORMASI = [
  'Shopee Food',
  'Gofood',
  'Agen',
  'Instagram',
  'Twitter',
  'Facebook',
  'TikTok',
  'Google',
  'Website',
] as const

export const JENIS_CUSTOMER = [
  'Perorangan',
  'Reseller',
  'Distributor',
  'Retail',
  'Grosir',
  'New Customer',
  'Repeat Order'
] as const

export const STATUS = ['BARU', 'DIPROSES', 'SELESAI', 'BATAL'] as const

export const NO_HP = /^\+62\d{9,13}$/

export const isJenisCustomerValid = (jenisCustomer: unknown): jenisCustomer is (typeof JENIS_CUSTOMER)[number] =>
  (JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer as string)

export const isSumberValid = (sumberInformasi: unknown): sumberInformasi is (typeof SUMBER_INFORMASI)[number] =>
  (SUMBER_INFORMASI as readonly string[]).includes(sumberInformasi as string)

export const isNoHpValid = (hp: unknown): hp is string =>
  typeof hp === 'string' && NO_HP.test(hp)

export const ORDER_LINES_SELECT =
  'id_baris,nama_paket,kategori,qty,harga_satuan,order_olahan(nama_olahan,kategori),paket(tipe,anak,porsi,jenis,jumlah_hewan)'

export const CLOSING_ORDERS_SELECT =
  `id_pesanan,status,tipe_pembayaran,metode_pembayaran,harga_final,qty_paket,waktu_kirim,waktu_tiba,tanggal_transaksi,created_at,customer_email,order_lines(${ORDER_LINES_SELECT})`

// ada yang jalan → DIPROSES; semua selesai → SELESAI; semua batal → BATAL.
export function statusClosing(
  orders: { status: string | null }[] | undefined | null,
): 'BARU' | 'DIPROSES' | 'SELESAI' | 'BATAL' {
  const list = orders ?? []
  if (!list.length) return 'BARU'
  if (list.every((o) => o.status === 'BATAL')) return 'BATAL'
  if (list.every((o) => o.status === 'SELESAI')) return 'SELESAI'
  if (list.some((o) => ['DIPROSES', 'SELESAI'].includes(o.status ?? ''))) return 'DIPROSES'
  return 'BARU'
}

export function tenggatLabel(iso: string | null | undefined): {
  text: string
  tone: 'now' | 'late' | 'soon' | 'none'
} {
  if (!iso) return { text: 'Jadwal belum ada', tone: 'none' }
  const d = new Date(new Date(iso).toDateString()).getTime()
  const t = new Date(new Date().toDateString()).getTime()
  const diff = Math.round((d - t) / 864e5)
  if (diff < 0) return { text: `Terlambat ${-diff} hari`, tone: 'late' }
  if (diff === 0) return { text: 'Kirim hari ini', tone: 'now' }
  if (diff === 1) return { text: 'Kirim besok', tone: 'soon' }
  return { text: `H-${diff}`, tone: 'soon' }
}
