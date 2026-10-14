import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { publicRoute, HOME_BY_ROLE, canAccess } from '@/lib/access';

export async function proxy(request: NextRequest) {
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

    // Belum Login
    if (!user) {
        if (publicRoute(path)) return supabaseResponse

        if (API) {
            return NextResponse.json({ error: 'Unauthorized' }, {status: 401})
        }

        const url = request.nextUrl.clone()
        url.pathname = '/login'
        return NextResponse.redirect(url)
    }

    // Sudah login
    // Ambil role user
    const role = user.app_metadata?.role as string | undefined

    if (path === '/') {
        const url = request.nextUrl.clone()
        url.pathname = (role && HOME_BY_ROLE[role]) || '/forbidden'
        return NextResponse.redirect(url)
    }

    // API dijaga requireRole() masing-masing route
    if (API || publicRoute(path)) return supabaseResponse

    // Halaman bukan untuk role yang mengakses
    if (!canAccess(role, path)) {
        const url = request.nextUrl.clone()
        url.pathname = '/forbidden'
        return NextResponse.redirect(url)
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        // menentukan asset yang tidak perlu melakukan authentication
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|gif|webp)$).*)',
    ],
}
