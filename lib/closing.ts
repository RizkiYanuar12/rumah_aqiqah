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

export const NO_HP = /^08\d{8,10}$/

export const KODE_POS = /^\d{5}$/

export const isJenisCustomerValid = (jenisCustomer: unknown): jenisCustomer is (typeof JENIS_CUSTOMER)[number] =>
  (JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer as string)

export const isSumberValid = (sumberInformasi: unknown): sumberInformasi is (typeof SUMBER_INFORMASI)[number] =>
  (SUMBER_INFORMASI as readonly string[]).includes(sumberInformasi as string)

export const isNoHpValid = (hp: unknown): hp is string =>
  typeof hp === 'string' && NO_HP.test(hp)

export const isKotaValid = (kota: unknown): kota is string =>
  typeof kota === 'string' && kota.trim().length > 0

export const isKodePosValid = (kodePos: unknown): kodePos is string =>
  typeof kodePos === 'string' && KODE_POS.test(kodePos.trim())

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

// 'Hari' dalam zona WIB (UTC+7) — server & browser harus hitung hari yang sama,
// kalau tidak tanggal bisa beda 1 hari (hydration error + badge deadline ngawur).
export function hariWIB(iso: string | number | Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jakarta',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso))
}

export function tenggatLabel(iso: string | null | undefined): {
  text: string
  tone: 'now' | 'late' | 'soon' | 'none'
} {
  if (!iso) return { text: 'Jadwal belum ada', tone: 'none' }
  const d = Date.parse(`${hariWIB(iso)}T00:00:00Z`)
  const t = Date.parse(`${hariWIB(new Date())}T00:00:00Z`)
  const diff = Math.round((d - t) / 864e5)
  if (diff < 0) return { text: `Terlambat ${-diff} hari`, tone: 'late' }
  if (diff === 0) return { text: 'Kirim hari ini', tone: 'now' }
  if (diff === 1) return { text: 'Kirim besok', tone: 'soon' }
  return { text: `H-${diff}`, tone: 'soon' }
}
