import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute, HOME_BY_ROLE, canAccess } from '@/lib/access';

export async function proxy(request: NextRequest) {
    // Setiap setAll harus membangun ulang response: session token hanya sampai
    // browser bila cookie ditulis ke response yang akhirnya dikembalikan.
    let supabaseResponse = NextResponse.next({
        request,
    })

    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet, headers) {
                    cookiesToSet.forEach(({ name, value}) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({
                        request,
                    })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                    Object.entries(headers).forEach(([key, value]) =>
                        supabaseResponse.headers.set(key, value)
                    )
                },
            },
        }
    )

    const { data } = await supabase.auth.getClaims()
    const user = data?.claims

    const path = request.nextUrl.pathname
    const API = path.startsWith('/api')

    if (!user) {
        if (publicRoute(path)) return supabaseResponse

        if (API) {
            return NextResponse.json({ error: 'Unauthorized' }, {status: 401})
        }

        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    const role = user.app_metadata?.role as string | undefined

    // Beranda per role; role tak dikenal -> /forbidden
    if (path === '/') {
        const url = request.nextUrl.clone()
        url.pathname = (role && HOME_BY_ROLE[role]) || '/forbidden'
        return NextResponse.redirect(url)
    }

    // Guard sebenarnya ada di requireRole() tiap route API; proxy di sini
    // hanya memastikan user punya sesi, bukan mengotorisasi per-endpoint.
    if (API || publicRoute(path)) return supabaseResponse

    // Fallback terakhir: role ada, tapi rute-nya tidak di ROUTE_ACCESS.
    if (!canAccess(role, path)) {
        const url = request.nextUrl.clone()
        url.pathname = '/forbidden'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        // Aset statis dilewati: tidak punya sesi dan tidak butuh redirect,
        // jadi middleware tidak perlu dijalankan untuk tiap file gambar/CSS/JS.
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|gif|webp)$).*)',
    ],
}
