import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function requireRole(allowed: string[]){
    const supabase = await createClient()
    const {data } = await supabase.auth.getClaims()
    const claims = data?.claims

    if(!claims) redirect ('/login')

    const role = claims.app_metadata?.role as string
    if (!role || !allowed.includes(role)) redirect('/forbidden')
    
    return {
        userId: claims.sub as string,
        role,
        idLokasi: claims.app_metadata?.id_lokasi as string | undefined,
    }
}

export async function requireApiRole(allowed: string[]){
    const supabase = await createClient()
    const {data} = await supabase.auth.getClaims()
    const claims = data?.claims

    if (!claims) return {
        error: 'Unauthorized' as const, 
        status: 401 as const
    }

    const role = claims.app_metadata?.role as string | undefined
    if (!role || !allowed.includes(role)) return { 
        error: 'Forbidden' as const,
        status: 403 as const
    }

    return {
        userId: claims.sub as string,
        role,
        idLokasi: claims.app_metadata?.id_lokasi as string | undefined,
    }
}