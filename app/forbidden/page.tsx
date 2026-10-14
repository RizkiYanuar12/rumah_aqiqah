'use client'
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function forbiddenPage() {
    const router = useRouter()
    const supabase = createClient()

    async function logout(){
        await supabase.auth.signOut()
        router.push('/login')
        router.refresh()
    }

    return (
        <main className='main-h-screen flex flex-col items-center'>
            <h1 className='text-xl font-semibold'>AKSES DITOLAK</h1>
            <p>Anda tidak ada hak akses! silakan logout terlebih dahulu</p>
            <button onClick={logout} className='rouded bg-black text-white'>
                Logout
            </button>
        </main>
    )

}