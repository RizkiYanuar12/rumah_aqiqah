import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { requireRole } from '@/lib/auth/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { listResep } from '@/lib/resep'
import FormResep from './form-resep'

export default async function ResepUbahPage({ params }: { params: Promise<{ idPaket: string }> }) {
  const { idLokasi } = await requireRole(['cso'])
  const { idPaket } = await params
  if (!idLokasi) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">Resep</p>
        <h1 className="mt-1 font-heading text-4xl font-semibold tracking-[-0.03em] text-[#4a0f30]">Edit Resep</h1>
        <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
        <p className="mt-2 text-sm text-red-700">Akun belum punya lokasi.</p>
      </div>
    )
  }

  const admin = createAdminClient()
  const groups = await listResep(admin, idLokasi)
  const g = groups.find((x) => x.id_paket === idPaket)
  if (!g) notFound()

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/resep"
          aria-label="Kembali ke semua resep"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-input hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-[0.2em] text-[#c2185b] uppercase">
            Resep Paket
          </p>
          <h1 className="mt-1 truncate font-heading text-3xl font-semibold tracking-[-0.03em] text-[#4a0f30]">{g.nama_paket}</h1>
          <span aria-hidden className="mt-2 block h-1 w-12 rounded-full bg-gradient-to-r from-[#c2185b] to-[#e8b10c]" />
          <p className="mt-2 text-sm text-muted-foreground">
            {[[g.tipe && `Tipe ${g.tipe}`, g.anak, g.jenis].filter(Boolean).join(' · '), g.porsi ? `${g.porsi} porsi` : '', `${g.rows.length} bahan`]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
      </div>
      <FormResep group={g} />
    </div>
  )
}
