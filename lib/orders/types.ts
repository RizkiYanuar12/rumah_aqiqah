export type AddonIn = { id_paket: string; qty: number }

export type InventoryIn = { sku: string; qty: number; harga: number }

export type RincianIn = {
  paket_id: string
  qty: number
  olahan_daging: string
  olahan_jeroan: string
  addons: AddonIn[]
  inventory: InventoryIn[]
  tipe_pembayaran: string
  metode_pembayaran: string
  diskon: number
}

export type OrderDetailIn = RincianIn & {
  closing_id: number | null
  nama_customer: string
  no_hp: string
  alamat: string
  customer_email: string | null
  tanggal_transaksi?: string
  waktu_kirim: string
  waktu_tiba: string
  userId: string
  idLokasi: string
}

export type EditRincianIn = RincianIn & {
  waktu_kirim: string
  waktu_tiba: string
}

export type OrderResult =
  | { ok: true; order_id: string; harga_final: number }
  | { ok: false; error: string; status: number }

// Hasil resolveRincian: rincian yang sudah divalidasi dari DB + total dihitung server.
export type RincianOk = {
  paket: { id: string; nama_paket: string; harga: number; porsi: number | null }
  daging: { id_olahan: string; nama_olahan: string; kategori: string }
  jeroan: { id_olahan: string; nama_olahan: string; kategori: string }
  addonRows: { id: string; nama_paket: string; harga: number; qty: number }[]
  invRows: { sku: string; nama: string; qty: number; harga: number; hpp: number }[]
  bomRows: { sku: string; qty: number; hpp: number }[]
  harga_final: number
}