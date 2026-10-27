import { useEffect, useState } from 'react';

// Tiny path router under the console's base path (vite `base`, Caddy serves index.html for any
// /super-admin/* path, so deep links work on reload).
export const BASE = '/super-admin';

export type Page = 'overview' | 'requests';

const PATHS: Record<Page, string> = { overview: `${BASE}/`, requests: `${BASE}/requests` };

function currentPage(): Page {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === `${BASE}/requests` ? 'requests' : 'overview';
}

export function navigate(page: Page, search = '') {
  window.history.pushState({}, '', `${PATHS[page]}${search}`);
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
