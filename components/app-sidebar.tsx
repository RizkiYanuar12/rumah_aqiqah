'use client'

import {
    Sidebar,
    SidebarHeader,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem
} from '@/components/ui/sidebar';
import Link from 'next/link'
import Image from 'next/image'
import { useState } from 'react'
import { usePathname } from 'next/navigation';
import LogoutButton from '@/components/logout';

type item = { href: string; label: string }

const ROLE_LABEL: Record<string, { code: string; label: string }> = {
    seo: { code: 'SE', label: 'SEO' },
    cso: { code: 'CS', label: 'CSO' },
    finance: { code: 'FN', label: 'Finance' },
    inventory: { code: 'INV', label: 'Inventory' },
    branch_manager: { code: 'BM', label: 'Branch Manager' }
}

const ACTIVE = 'data-active:bg-[#c2185b] data-active:text-white data-active:font-semibold data-active:shadow-sm'

export default function AppSideBar({
    items,
    role
}: {
    items: item[],
    role?: string
}) {
    const pathname = usePathname()
    const [logoOk, setLogoOk] = useState(true)

    return (
        <Sidebar>
            <SidebarHeader className="px-4 pt-4">
                {logoOk ? (
                    <Image
                        src='/logo.png'
                        alt="Rumah Aqiqah"
                        width={627}
                        height={318}
                        className="h-9 w-auto max-w-full object-contain group-data-[collapsible=icon]:hidden"
                        onError={() => setLogoOk(false)}
                        priority
                    />
                ) : (
                    <p className="text-lg font-bold tracking-tight text-[#c2185b]">
                        rumah<span className="text-gray-500">aqiqah</span>
                    </p>
                )}
                <p className="text-[11px] text-center text-muted-foreground group-data-[collapsible=icon]:hidden">
                    Kebanggaan di Setiap Kelahiran
                </p>
            </SidebarHeader>

            <SidebarContent>
                <SidebarGroup>
                    <SidebarGroupContent>
                        <SidebarMenu className="gap-1 px-2">
                            {items.map((item) => {
                                const aktif =
                                pathname === item.href || pathname.startsWith(item.href + '/')

                                return(
                                    <SidebarMenuItem key={item.href}>
                                        <SidebarMenuButton
                                            render={<Link href={item.href} />}
                                            isActive={aktif}
                                            className={`h-11 rounded-lg px-3 text-[15px] font-medium hover:bg-[#c2185b]/10 hover:text-[#c2185b] [&_svg]:size-5 ${ACTIVE}`}
                                        >
                                            {item.label}
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                )
                            })}
                        </SidebarMenu>
                    </SidebarGroupContent>
                </SidebarGroup>
            </SidebarContent>

            <SidebarFooter className="gap-2 px-4">
                <div className="flex items-center gap-2.5 rounded-xl border border-[#c2185b]/20 bg-[#c2185b]/5 px-2.5 py-2">
                    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#c2185b] text-xs font-bold tracking-wide text-white">
                        {(ROLE_LABEL[role ?? '']?.code ?? (role ?? '?').slice(0, 2).toUpperCase())}
                    </span>
                    <span className="min-w-0">
                        <span className="block text-[10px] tracking-widest text-muted-foreground uppercase">Masuk sebagai</span>
                        <span className="block truncate text-sm font-semibold text-[#c2185b]">
                            {ROLE_LABEL[role ?? '']?.label ?? role}
                        </span>
                    </span>
                </div>
                <LogoutButton />
            </SidebarFooter>
        </Sidebar>
    )
}
