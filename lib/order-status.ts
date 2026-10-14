export const ORDER_STATUS = [
  'PENDING',
  'DIPROSES',
  'SELESAI',
  'BATAL',
] as const

export type OrderStatus = (typeof ORDER_STATUS)[number]

// Nilai valid hasil probe constraint DB (bukan istilah PRD).
// Ditaruh di sini (bukan lib/orders.ts) agar bisa diimpor komponen client.
export const TIPE_BAYAR = ['TUNAI', 'CICILAN'] as const
export type TipeBayar = (typeof TIPE_BAYAR)[number]

export const METODE_PEMBAYARAN = ['VA', 'CASH', 'TRANSFER'] as const
export type MetodePembayaran = (typeof METODE_PEMBAYARAN)[number]
