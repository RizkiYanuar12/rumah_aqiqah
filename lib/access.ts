export const ROUTE_ACCESS: Record<string, string[]> = {
    seo: ['/closing', '/orders'],
    cso: ['/closing', '/orders', '/inventory/cabang', '/resep'],
    finance: ['/orders'],
    inventory: ['/inventory/cabang'],
    branch_manager: ['/orders'],
}

// Labeling Nama di UI
export const ROUTE_LABELS: Record <string, string> = {
    '/closing': 'Closing',
    '/orders': 'Pesanan',
    '/inventory/cabang': 'Inventory Cabang',
    '/resep': 'Resep',
}

export const COMMON_ROUTES= ['/forbidden']
export const PUBLIC_ROUTES= ['/login', '/auth']

export const HOME_BY_ROLE: Record<string, string> = {
    seo: '/closing',
    cso: '/orders',
    finance: '/orders',
    inventory: '/inventory/cabang',
    branch_manager: '/orders'
}

const match = (path: string, route: string) =>
    path === route || path.startsWith(route + '/')

export function publicRoute(path: string): boolean {
    return PUBLIC_ROUTES.some((r) => match(path, r))
}

export function canAccess(role: string | undefined, path: string): boolean {
  if (COMMON_ROUTES.some((r) => match(path, r))) return true
  if (!role) return false
  return (ROUTE_ACCESS[role] ?? []).some((r) => match(path, r))
}