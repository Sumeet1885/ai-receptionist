# SEO implementation

## Public pages

The homepage, pricing, trial request, privacy and terms pages have unique titles and descriptions, canonical URLs, Open Graph/Twitter previews, `en-IN` language metadata, and Organization/WebSite/WebPage JSON-LD. No invented reviews, ratings or prices are included in structured data.

`apps/web/src/lib/seo.ts` is the shared metadata policy. `seoHtml.ts` applies it to initial HTML; `App.tsx` updates the same tags during client navigation. Query tokens never enter canonical URLs or social metadata. Private pages use `noindex, nofollow, noarchive` and `no-referrer`.

The build renders the actual public React components into HTML using Vite's SSR loader. The browser mounts the interactive app as usual. This is build-time public rendering, not authenticated SSR. No API calls, secrets, customer records or checkout tokens are used to render these pages. Legal content comes from the same legal components used by the app. Pricing amounts remain live API data, so a stale price snapshot is not published by the build. The pricing introduction and heading exist in initial HTML; current plan cards load in the browser.

`scripts/prerender.ts` emits:

- `index.html`, `pricing.html`, `request-access.html`, `privacy.html`, `terms.html` with public content and metadata.
- `app.html`, the noindex shell for private routes.
- `404.html`, a noindex not-found page.
- `sitemap.xml`, containing only the five canonical public routes, without fabricated last-modified dates.
- `robots.txt`, linking the production sitemap. Private pages are not blocked in robots.txt, allowing crawlers to see their noindex instructions. Authorization remains enforced independently.

Existing brand icons, manifest and the 1200×630 social image are retained. Main navigation uses crawlable links. The homepage introduction explicitly describes the AI receptionist, and its primary portrait has dimensions and high fetch priority. Public landing components are safe to render without browser globals; reveal sections are visible in initial HTML.

## Environment and hosting

Set these **at build time**:

```dotenv
VITE_SITE_URL=https://your-public-website.example
VITE_INDEXABLE=true
```

The origin is configuration, not a fixed source-code domain. In the browser, an unset `VITE_SITE_URL` falls back to `window.location.origin`; without browser globals it falls back to localhost for development. Builds without a configured domain remain noindex. Setting `VITE_INDEXABLE=true` without `VITE_SITE_URL` fails early rather than publishing incorrect sitemap/canonical URLs. Set the final public website origin before production builds; do not use the API domain unless the website really uses that domain.

The production Docker workflow reads repository variable `PRODUCTION_SITE_URL` and passes it as the public `VITE_SITE_URL` build argument. The staging workflow similarly reads `STAGING_SITE_URL`. Configure these repository variables before the next image build. Direct Docker builds accept `--build-arg VITE_SITE_URL=https://your-public-website.example`.

Staging/preview builds must use `VITE_INDEXABLE=false`. The staging Dockerfile sets it, and also sets Caddy's `ROBOTS_POLICY` to noindex. The local Dockerfile defaults to noindex. Production Dockerfile enables public indexing. Normal Vite development is always noindex; the runtime also avoids indexing a host that differs from the configured canonical origin. Vercel preview deployments need `VITE_INDEXABLE=false` in their Preview environment settings.

Docker/Caddy serves the generated public HTML, uses `app.html` only for known private routes, and returns a genuine 404 for unknown routes or missing assets. Legal aliases and public trailing-slash/HTML aliases redirect to clean URLs. Private routes and API/widget/admin responses have `X-Robots-Tag` headers; private app pages are not cached. Vercel routes likewise serve the public HTML, private shell and unknown-route 404 separately. Never restore a blanket homepage fallback for every URL: it produces misleading metadata and soft 404s.

## Checks

```powershell
pnpm --filter @ai-receptionist/web test
pnpm --filter @ai-receptionist/web build
pnpm -r typecheck
pnpm run check:boundaries
```

The build includes `scripts/check-seo.ts`, checking unique head metadata, one H1 per public page, initial public content, private noindex, social image dimensions and sitemap exclusions. Unit tests cover route policy, private tokens, aliases, staging and metadata replacement. Browser checks cover initial HTML with JavaScript disabled, rendered metadata and client navigation at desktop/mobile sizes.

After deploying:

1. Verify the final domain in Google Search Console using the account-owned DNS record; no verification token is invented or committed here.
2. Submit `https://<production-domain>/sitemap.xml`.
3. Use URL Inspection on `/`, `/pricing` and `/request-access`; inspect both live HTML and rendered content.
4. Check production public pages are indexable, staging is not, private routes remain noindex and a nonexistent URL returns HTTP 404.
5. Measure real Core Web Vitals/PageSpeed on the deployed site. The existing main app bundle still generates Vite's size warning; metadata work does not establish a performance score or guarantee rankings.

Search Console submission, external domain verification, deployment and production performance measurements are not performed by this local implementation.

References: [Google JavaScript SEO](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics), [Google sitemap guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap), [Caddy error handling](https://caddyserver.com/docs/caddyfile/directives/handle_errors), [Vercel routing configuration](https://vercel.com/docs/project-configuration/vercel-json).
