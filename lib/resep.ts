import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type ResepDigunakan = {
    id_paket: string
    sku: string
    qty: number
}

export type ResepRow = {
    id_paket: string
    sku: string
    nama_barang: string
    qty: number
    satuan: string | null
    stock: number
}

export type ResepPaket = {
    id_paket: string
    nama_paket: string
    tipe: string
    anak: string
    jenis: string
    porsi: number
    kategori: string
    rows: ResepRow[]
}

export type ResepResult = { ok: true } | { ok: false; error: string; status: number }

// Baca: paket PAKET aktif + baris resep + nama/satuan master + stok lokasi (via v_stock).
export async function listResep(
    admin: SupabaseClient,
    idLokasi?: string,
): Promise<ResepPaket[]> {
    const { data: paket } = await admin
        .from('paket')
        .select('id,nama_paket,kategori,tipe,porsi,anak,jenis')
        .eq('kategori', 'PAKET')
        .eq('is_active', true)
        .order('nama_paket')
    if (!paket?.length) return []

    const ids = paket.map((p) => p.id)
    const { data: items } = await admin
        .from('paket_items')
        .select('id_paket,sku,qty')
        .in('id_paket', ids)
    if (!items?.length) {
        return paket.map((p) => ({
            id_paket: p.id,
            nama_paket: p.nama_paket,
            tipe: p.tipe,
            anak: p.anak,
            jenis: p.jenis,
            porsi: Number(p.porsi) || 0,
            kategori: p.kategori,
            rows: [],
        }))
    }

    const skus = [...new Set(items.map((i) => i.sku))]
    const [{ data: master }, stockRes] = await Promise.all([
        admin.from('inventory').select('sku,nama_barang,satuan').in('sku', skus),
        idLokasi
            ? admin.from('v_stock').select('sku,stock').eq('id_lokasi', idLokasi).in('sku', skus)
            : Promise.resolve({ data: null as { sku: string; stock: number }[] | null, error: null }),
    ])
    const stok = new Map<string, number>(
        ((stockRes.data ?? []) as { sku: string; stock: number }[]).map((s) => [s.sku, Number(s.stock) || 0]),
    )

    return paket.map((p) => ({
        id_paket: p.id,
        nama_paket: p.nama_paket,
        tipe: p.tipe,
        anak: p.anak,
        jenis: p.jenis,
        porsi: Number(p.porsi) || 0,
        kategori: p.kategori,
        rows: (items ?? [])
            .filter((i) => i.id_paket === p.id)
            .map((i) => {
                const m = (master ?? []).find((x) => x.sku === i.sku)
                return {
                    id_paket: i.id_paket as string,
                    sku: i.sku as string,
                    nama_barang: (m?.nama_barang ?? i.sku) as string,
                    qty: Number(i.qty) || 0,
                    satuan: (m?.satuan ?? null) as string | null,
                    stock: stok.get(i.sku as string) ?? 0,
                }
            }),
    }))
}

export async function addResep(
    admin: SupabaseClient,
    input: ResepDigunakan
): Promise<ResepResult> {
    const fail = (error: string, status = 400): ResepResult => ({ ok: false, error, status })

    if (!input.id_paket) return fail('Pilih paket terlebih dahulu')
    if (!input.sku) return fail('Pilih barang yang akan digunakan')
    if (!Number.isInteger(input.qty) || input.qty < 1) return fail('Qty minimal 1 dan bilangan bulat')

    const { data: paket } = await admin
        .from('paket')
        .select('id,kategori')
        .eq('id', input.id_paket)
        .eq('is_active', true)
        .single()
    if (!paket || paket.kategori !== 'PAKET') return fail('Paket tidak ditemukan / tidak aktif')

    const { data: barang } = await admin
        .from('inventory')
        .select('sku')
        .eq('sku', input.sku)
        .single()
    if (!barang) return fail(`Item tidak ditemukan: ${input.sku}`)

    const { data: dup } = await admin
        .from('paket_items')
        .select('id_paket')
        .eq('id_paket', input.id_paket)
        .eq('sku', input.sku)
        .maybeSingle()
    if (dup) return fail('Resep baris ini sudah ada (ubah qty saja)')

    const { error } = await admin
        .from('paket_items')
        .insert({
            id_paket: input.id_paket,
            sku: input.sku,
            qty: input.qty,
        })
    if (error) return fail(error.message)
    return { ok: true }
}

// Ubah qty saja (tanpa PUT, sesuai progress §10).
export async function updateResepQty(
    admin: SupabaseClient,
    input: ResepDigunakan
): Promise<ResepResult> {
    const fail = (error: string, status = 400): ResepResult => ({ ok: false, error, status })

    if (!input.id_paket || !input.sku) return fail('Pilih paket dan barang')
    if (!Number.isInteger(input.qty) || input.qty < 1) return fail('Qty minimal 1 dan bilangan bulat')

    const { data, error } = await admin
        .from('paket_items')
        .update({ qty: input.qty })
        .eq('id_paket', input.id_paket)
        .eq('sku', input.sku)
        .select('id_paket')
    if (error) return fail(error.message)
    if (!data?.length) return fail('Resep tidak ditemukan')
    return { ok: true }
}

// Hapus baris resep. Order lama aman (order_items = snapshot qty + HPP).
export async function deleteResep(
    admin: SupabaseClient,
    key: { id_paket: string; sku: string }
): Promise<ResepResult> {
    const fail = (error: string, status = 400): ResepResult => ({ ok: false, error, status })

    if (!key.id_paket || !key.sku) return fail('Pilih paket dan barang')

    const { data, error } = await admin
        .from('paket_items')
        .delete()
        .eq('id_paket', key.id_paket)
        .eq('sku', key.sku)
        .select('id_paket')
    if (error) return fail(error.message)
    if (!data?.length) return fail('Resep tidak ditemukan')
    return { ok: true }
}
