export type StockKind = 'normal' | 'low' | 'habis'

export const PILL_STOCK: Record<StockKind, string> = {
  normal: 'border-green-300 bg-green-50 text-green-700',
  low: 'border-[#e8d40c]/70 bg-[#e8b10c]/15 text-[#4a0f30]',
  habis: 'border-red-500 bg-red-500 text-white',
}

export const KIND_LABEL: Record<StockKind, string> = {
  normal: 'Aman',
  low: 'Menipis',
  habis: 'Habis',
}

// Teks "semua" berbeda per lokasi, jadi lewat parameter.
export const emptyMsg = (semua: string): Record<'semua' | StockKind, string> => ({
  semua,
  low: 'Tidak ada barang menipis',
  habis: 'Tidak ada barang habis',
  normal: 'Tidak ada barang aman',
})

export const statusStock = (it: {
  stock: number | null
  is_low: boolean | null
}): StockKind => (Number(it.stock) <= 0 ? 'habis' : it.is_low ? 'low' : 'normal')