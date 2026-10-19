'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Loader2, TriangleAlert } from 'lucide-react'

export default function LoginPage(){
    const router = useRouter()
    const supabase = createClient()
    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [logoOk, setLogoOk] = useState(true)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    async function handleLogin(e: React.FormEvent){
        e.preventDefault()
        setLoading(true)
        setError('')

        const {error: authError} = await supabase.auth.signInWithPassword({email, password})

        if (authError) {
            setError("Email atau kata sandi salah. Periksa lagi.")
            setLoading(false)
            return
        }
        router.push('/')
        router.refresh()
    }

    return (
        <div className="relative flex min-h-dvh flex-col overflow-hidden bg-[#4a0f30] text-white">
            <header className="z-10 flex items-center justify-between px-6 pt-5 sm:px-10">
                <div className="flex h-9 items-center gap-2">
                    {logoOk ? (
                        <Image
                            src="/logo.png"
                            alt="Rumah Aqiqah"
                            width={120}
                            height={36}
                            className="h-9 w-auto rounded-md bg-white px-2 py-1"
                            onError={() => setLogoOk(false)}
                            priority
                        />
                    ) : (
                        <span className="text-lg font-bold tracking-tight">
                            rumah<span className="text-[#e8b10c]">aqiqah</span>
                        </span>
                    )}
                </div>
                <span className="rounded-full border border-white/20 px-3 py-1 text-xs font-medium tracking-widest text-white/80">
                    ID
                </span>
            </header>

            <main className="z-10 mx-auto flex w-full max-w-xs flex-1 flex-col items-center justify-center pb-40">
                <div className="relative mb-6 flex h-20 w-20 items-center justify-center">
                    {logoOk ? (
                        <Image
                            src="/logo.png"
                            alt=""
                            aria-hidden
                            width={160}
                            height={160}
                            className="h-20 w-20 rounded-3xl bg-white object-contain p-2"
                            onError={() => setLogoOk(false)}
                            priority
                        />
                    ) : (
                        <div
                            aria-hidden
                            className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl font-bold text-white"
                            style={{ background: 'linear-gradient(135deg, #c2185b 30%, #e8b10c 130%)' }}
                        >
                            RA
                        </div>
                    )}
                </div>
                <h1 className="text-3xl font-light tracking-wide">Masuk</h1>
                <p className="mt-3 text-center text-sm text-white/70">
                    Masuk dan kelola lead, order, sampai pembayaran!
                </p>

                <form onSubmit={handleLogin} className="mt-8 grid w-full gap-3">
                    {error && (
                        <p
                            role="alert"
                            className="flex items-start gap-2 rounded-2xl border border-[#e8b10c]/40 bg-black/30 px-4 py-2.5 text-sm text-[#f5d67b]"
                        >
                            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                            {error}
                        </p>
                    )}
                    <label htmlFor="email" className="sr-only">Email</label>
                    <input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Email"
                        required
                        className="h-11 w-full rounded-full bg-white/10 px-5 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-[#e8b10c]"
                    />
                    <div className="relative">
                        <label htmlFor="password" className="sr-only">Kata sandi</label>
                        <input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Kata sandi"
                            required
                            className="h-11 w-full rounded-full bg-white/10 px-5 pr-12 text-sm text-white outline-none placeholder:text-white/50 focus-visible:ring-2 focus-visible:ring-[#e8b10c]"
                        />
                        <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-full text-white/60 hover:text-white"
                        >
                            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#e8b10c] text-sm font-bold text-[#4a0f30] transition hover:bg-[#f5c234] disabled:opacity-60"
                    >
                        {loading && <Loader2 className="size-4 animate-spin" />}
                        {loading ? 'Membuka sistem…' : 'Masuk'}
                    </button>
                </form>
            </main>

            {/* Dekorasi gelombang, aria-hidden: bukan konten. */}
            <svg
                aria-hidden
                viewBox="0 0 1440 220"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-44 w-full sm:h-56"
            >
                <path d="M0,120 C240,60 480,180 720,130 C960,80 1200,150 1440,100 L1440,220 L0,220 Z" fill="#c2185b" opacity="0.25" />
                <path d="M0,150 C260,100 520,190 780,150 C1040,110 1240,170 1440,140 L1440,220 L0,220 Z" fill="#e8b10c" opacity="0.22" />
                <path d="M0,180 C280,140 560,200 820,175 C1080,150 1260,185 1440,170 L1440,220 L0,220 Z" fill="#f7f1e6" />
            </svg>

            <footer className="z-10 flex items-end justify-between px-6 pb-5 text-[#4a0f30] sm:px-10">
                <span className="text-sm font-semibold">↗ Rumah Aqiqah</span>
                <span className="hidden text-[11px] opacity-60 sm:block">RAMS · Sistem internal</span>
                <span className="text-[11px] opacity-60">Butuh bantuan? Hubungi admin</span>
            </footer>
        </div>
    )
}
