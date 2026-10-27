import { useEffect, useState } from 'react';

// Tiny path router under the console's base path (vite `base`, Caddy serves index.html for any
// /super-admin/* path, so deep links work on reload).
export const BASE = '/super-admin';

export type Page = 'overview' | 'requests' | 'revenue' | 'leads' | 'plans' | 'coupons' | 'notifications';

export const PAGE_PATHS: Record<Page, string> = {
  overview: `${BASE}/`,
  requests: `${BASE}/requests`,
  revenue: `${BASE}/revenue`,
  leads: `${BASE}/signup-leads`,
  plans: `${BASE}/plans`,
  coupons: `${BASE}/coupons`,
  notifications: `${BASE}/notifications`,
};

function currentPage(): Page {
  const path = window.location.pathname.replace(/\/+$/, '');
  const match = (Object.entries(PAGE_PATHS) as Array<[Page, string]>).find(([, p]) => p.replace(/\/+$/, '') === path);
  return match ? match[0] : 'overview';
}

export function navigate(page: Page, search = '') {
  window.history.pushState({}, '', `${PAGE_PATHS[page]}${search}`);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function usePage() {
  const [page, setPage] = useState<Page>(currentPage);
  useEffect(() => {
    const onChange = () => setPage(currentPage());
    window.addEventListener('popstate', onChange);
    return () => window.removeEventListener('popstate', onChange);
  }, []);
  return page;
}
