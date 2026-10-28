export const fmtRp = (n: number | null | undefined) =>
  n == null ? '—' : 'Rp ' + Number(n).toLocaleString('id-ID')

export const fmtNum = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('id-ID')

export const fmtDate = (iso: string | null | undefined) =>
  !iso || isNaN(+new Date(iso))
    ? '—'
    : new Date(iso).toLocaleDateString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',  
        timeZone: 'Asia/Jakarta',
      })
