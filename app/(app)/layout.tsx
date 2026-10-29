import AppSideBar from '@/components/app-sidebar'
import { NotifikasiProvider } from './notifikasi-provider'
import { ROUTE_ACCESS, ROUTE_LABELS } from '@/lib/auth/access'
import { cookies } from 'next/headers'
import { SidebarProvider, SidebarTrigger, SidebarInset, SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const role = data?.claims?.app_metadata?.role as string | undefined

  const items = (role ? ROUTE_ACCESS[role] ?? [] : []).map((href) => ({
    href,
    label: href === '/inventory/history' && role === 'inventory' ? 'Pengajuan Restock' : (ROUTE_LABELS[href] ?? href),
  }))

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== 'false'

  let initialPendingCount = 0
  if (role === 'inventory') {
    const admin = createAdminClient()
    const { data } = await admin.from('pengajuan').select('batch_id,status').neq('status', 'DIBATALKAN')
    initialPendingCount = new Set(
      ((data ?? []) as { batch_id: string; status: string }[])
        .filter((r) => r.status === 'DIAJUKAN')
        .map((r) => r.batch_id),
    ).size
  }

  if (!data?.claims) return <>{children}</>

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <NotifikasiProvider role={role} initialCount={initialPendingCount}>
        <AppSideBar items={items} role={role} />
      </NotifikasiProvider>
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}