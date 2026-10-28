import { NextResponse } from 'next/server'
import { requireApiRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createOrderFromDetail } from '@/lib/orders/create'
import { type AddonIn, type InventoryIn } from '@/lib/orders/types'
import { METODE_PEMBAYARAN } from '@/lib/orders/status'
import { SUMBER_INFORMASI, STATUS, CLOSING_ORDERS_SELECT, JENIS_CUSTOMER, isNoHpValid, isKotaValid, isKodePosValid } from '@/lib/closing'

const CUSTOMER_COLUMNS =
  'id,nama_customer,no_hp,email_customer,alamat,jenis_customer,kota,kode_pos,wilayah,sumber_informasi,status,created_by,created_at' +
  `,orders(${CLOSING_ORDERS_SELECT})`

export async function GET(req: Request) {
  const auth = await requireApiRole(['seo', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const status = new URL(req.url).searchParams.get('status')
  if (status && !(STATUS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 })
  }

  // Admin client + filter kode (RLS tabel baru belum ada untuk semua role)
  const admin = createAdminClient()
  let q = admin.from('closing').select(CUSTOMER_COLUMNS).order('created_at', { ascending: false })
  q = q.order('created_at', { ascending: false, referencedTable: 'orders' })
  if (auth.role === 'seo') q = q.eq('created_by', auth.userId)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ closing: data })
}

export async function POST(req: Request) {
  const auth = await requireApiRole(['seo', 'cso'])
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  if (!auth.idLokasi) {
    return NextResponse.json(
      { error: 'Akun belum punya lokasi (app_metadata.id_lokasi kosong). Minta admin set, lalu login ulang.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => null)
  const nama = body?.nama_customer?.trim?.()
  const no_hp = body?.no_hp?.trim?.()
  const alamat = body?.alamat?.trim?.()
  const email = body?.email_customer?.trim?.() || body?.email?.trim?.() || null
  const sumber = body?.sumber_informasi
  const jenisCustomer = body?.jenis_customer
  const kota = body?.kota?.trim?.() ?? ''
  const kodePos = body?.kode_pos?.trim?.() ?? ''
  const order = body?.order ?? null

  if (!nama || !nama.trim()) {return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 })}
  
  if (!no_hp) {
    return NextResponse.json({ error: 'No HP wajib diisi', field: 'no_hp' }, { status: 400 })
  }

  if (!isNoHpValid(no_hp)) {
    return NextResponse.json({ error: 'No HP diawali 08 dan minimal 10 angka', field: 'no_hp' }, { status: 400 })
  }
  
  if (!alamat) { return NextResponse.json({ error: 'Alamat wajib diisi' }, { status: 400 }) }
  
  if (!(SUMBER_INFORMASI as readonly string[]).includes(sumber)) {
    return NextResponse.json({ error: 'Sumber tidak valid' }, { status: 400 })
  }
  
  if (!(JENIS_CUSTOMER as readonly string[]).includes(jenisCustomer)){
    return NextResponse.json({ error: 'Jenis customer tidak valid'}, {status: 400})
  }
  
  if (!isKotaValid(kota)) {return NextResponse.json({error: 'Mohon Masukkan Kota Tempat Customer Berada', field: 'kota'}, { status: 400 })}

  if (!kodePos) {return NextResponse.json({error: 'Kode pos wajib diisi', field: 'kode_pos'}, {status: 400})}

  if (!isKodePosValid(kodePos)) {return NextResponse.json({error: 'Kode pos harus 5 digit (mis. 40115)', field: 'kode_pos'}, {status: 400})}
  
  if (!order) {return NextResponse.json({ error: 'Rincian order wajib diisi' }, { status: 400 }) }
  
  if (!(METODE_PEMBAYARAN as readonly string[]).includes(order?.metode_pembayaran)) {
    return NextResponse.json({ error: 'Metode pembayaran tidak valid' }, { status: 400 })
  }

  const tanggal_transaksi: string | undefined = order?.tanggal_transaksi
  if (!tanggal_transaksi || isNaN(+new Date(tanggal_transaksi))) {
    return NextResponse.json({ error: 'Tanggal transaksi wajib diisi' }, { status: 400 })
  }

  const waktu_kirim: string | undefined = order?.waktu_kirim
  const waktu_tiba: string | undefined = order?.waktu_tiba
  if (!waktu_kirim || isNaN(+new Date(waktu_kirim))) {
    return NextResponse.json({ error: 'Jadwal kirim wajib diisi' }, { status: 400 })
  }
  if (!waktu_tiba || isNaN(+new Date(waktu_tiba))) {
    return NextResponse.json({ error: 'Jadwal tiba wajib diisi' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Duplikat tidak ditolak; tampilkan warning + riwayat
  const { data: riwayat } = await admin
    .from('closing')
    .select('id,nama_customer,created_at')
    .eq('no_hp', no_hp)

  const { data: created, error: eCreate } = await admin
    .from('closing')
    .insert({ nama_customer: nama, no_hp, email_customer: email, alamat, jenis_customer: jenisCustomer, kota, kode_pos: kodePos, wilayah: auth.idLokasi, sumber_informasi: sumber, created_by: auth.userId, status: 'BARU' })
    .select('id,nama_customer,no_hp,email_customer,alamat,jenis_customer, kota, kode_pos, wilayah, sumber_informasi,status,created_by,created_at')
    .single()
  if (eCreate || !created) {
    return NextResponse.json({ error: eCreate?.message ?? 'Gagal menyimpan closing' }, { status: 500 })
  }

  const addons: AddonIn[] = Array.isArray(order?.addons) ? order.addons : []
  const inventory: InventoryIn[] = Array.isArray(order?.inventory)
    ? order.inventory.map((v: { sku?: string; qty?: number; harga?: number }) => ({
        sku: String(v?.sku ?? ''),
        qty: Number(v?.qty ?? 0),
        harga: Number(v?.harga ?? 0),
      }))
    : []
  const result = await createOrderFromDetail(admin, {
    closing_id: created.id,
    nama_customer: nama,
    no_hp,
    alamat,
    customer_email: email,
    paket_id: order?.paket_id,
    qty: Number(order?.qty ?? 1),
    olahan_daging: order?.olahan_daging,
    olahan_jeroan: order?.olahan_jeroan,
    addons,
    inventory,
    tipe_pembayaran: order?.tipe_pembayaran,
    metode_pembayaran: order?.metode_pembayaran,
    diskon: Number(order?.diskon ?? 0),
    tanggal_transaksi,
    waktu_kirim,
    waktu_tiba,
    userId: auth.userId,
    idLokasi: auth.idLokasi,
  })
  if (!result.ok) {
    await admin.from('closing').delete().eq('id', created.id)
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const warnings: string[] = []
  if (riwayat?.length) warnings.push('No HP sudah terdaftar sebelumnya')

  // VA dibuat manual dari menu Pesanan (nominal bisa cicilan), bukan saat closing.
  return NextResponse.json(
    {
      closing: created,
      order_id: result.order_id,
      harga_final: result.harga_final,
      va_number: null,
      warning: warnings.length ? warnings.join(' · ') : undefined,
      riwayat: riwayat ?? [],
    },
    { status: 201 },
  )
}
