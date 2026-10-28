import AppSideBar from '@/components/app-sidebar'
import { ROUTE_ACCESS, ROUTE_LABELS } from '@/lib/auth/access'
import { cookies } from 'next/headers'
import { SidebarProvider, SidebarTrigger, SidebarInset, SIDEBAR_COOKIE_NAME } from '@/components/ui/sidebar'
import { createClient } from '@/lib/supabase/server'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const role = data?.claims?.app_metadata?.role as string | undefined

  const items = (role ? ROUTE_ACCESS[role] ?? [] : []).map((href) => ({
    href,
    label: ROUTE_LABELS[href] ?? href,
  }))

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value !== 'false'

  if (!data?.claims) return <>{children}</>

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSideBar items={items} role={role} />
      <SidebarInset>
        <header className="flex h-12 items-center gap-2 border-b px-4">
          <SidebarTrigger />
        </header>
        <div className="p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  )
}