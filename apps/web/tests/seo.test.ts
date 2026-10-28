import test from "node:test";
import assert from "node:assert/strict";
import { PUBLIC_PAGES, pageSeo as resolvePageSeo, siteOrigin, seoBuildConfig } from "../src/lib/seo";
import { withSeoHtml } from "../src/lib/seoHtml";

const pageSeo = (path: string, options: Parameters<typeof resolvePageSeo>[1] = {}) => resolvePageSeo(path, { origin: 'https://bolegaindia.ai', ...options });

test("public pages have unique titles, descriptions and canonical URLs", () => {
  const titles = new Set<string>();
  const descriptions = new Set<string>();
  for (const path of Object.keys(PUBLIC_PAGES)) {
    const seo = pageSeo(path);
    assert.match(seo.robots, /^index, follow/);
    assert.equal(seo.canonical, `https://bolegaindia.ai${path}`);
    assert.ok(seo.title.length <= 65);
    assert.ok(seo.description.length >= 100 && seo.description.length <= 180);
    titles.add(seo.title);
    descriptions.add(seo.description);
    assert.ok(seo.structuredData);
    assert.ok(!JSON.stringify(seo.structuredData).includes("aggregateRating"));
  }
  assert.equal(titles.size, 5);
  assert.equal(descriptions.size, 5);
});

test("private, unknown and token routes have noindex and no canonical or structured data", () => {
  for (const path of [
    "/auth",
    "/auth/confirm",
    "/checkout",
    "/dashboard",
    "/leads",
    "/inbox",
    "/calendar",
    "/calls",
    "/agents/new",
    "/agents/private-id",
    "/plans",
    "/support",
    "/contact-support/ticket",
    "/chats/private-bot",
    "/super-admin",
    "/not-a-real-page",
  ]) {
    const seo = pageSeo(path);
    assert.match(seo.robots, /^noindex/);
    assert.equal(seo.canonical, null);
    assert.equal(seo.structuredData, null);
  }
  for (const key of [
    "token_hash",
    "resume",
    "code",
    "access_token",
    "refresh_token",
    "token",
  ]) {
    const seo = pageSeo("/", { query: `${key}=secret-value` });
    assert.match(seo.robots, /^noindex/);
    assert.equal(seo.canonical, null);
    assert.ok(!JSON.stringify(seo).includes("secret-value"));
  }
});

test("staging stays noindex and aliases converge on clean canonical URLs", () => {
  assert.match(pageSeo("/", { indexable: false }).robots, /^noindex/);
  assert.equal(
    pageSeo("/privacy-policy/").canonical,
    "https://bolegaindia.ai/privacy",
  );
  assert.equal(
    pageSeo("/terms-and-conditions").canonical,
    "https://bolegaindia.ai/terms",
  );
  assert.equal(
    pageSeo("/pricing/").canonical,
    "https://bolegaindia.ai/pricing",
  );
  assert.equal(
    siteOrigin("https://example.com/base?query=1"),
    "https://example.com",
  );
  assert.throws(() => siteOrigin("javascript:alert(1)"));
  assert.throws(() => siteOrigin("https://user:pass@example.com"));
});

test("HTML replacement removes stale metadata without duplicates or token leakage", () => {
  const template =
    '<html lang="en"><head><title>Old title</title><meta name="description" content="old"><meta name="robots" content="index"><meta property="og:url" content="https://old.test"><link rel="canonical" href="https://old.test"></head><body><div id="root"></div></body></html>';
  const html = withSeoHtml(withSeoHtml(template, "/"), "/pricing");
  for (const pattern of [
    /<title>/g,
    /rel="canonical"/g,
    /name="description"/g,
    /data-seo="structured-data"/g,
  ])
    assert.equal((html.match(pattern) || []).length, 1);
  assert.ok(!html.includes("old.test"));
  const privateHtml = withSeoHtml(html, "/auth/confirm", {
    query: "token_hash=secret",
  });
  assert.ok(!privateHtml.includes('rel="canonical"'));
  assert.ok(!privateHtml.includes('data-seo="structured-data"'));
  assert.ok(!privateHtml.includes("secret"));
});

test('origins are configurable with no fixed production-domain fallback', () => {
  const seo = resolvePageSeo('/pricing', { origin: 'https://new.example.com' });
  assert.equal(seo.canonical, 'https://new.example.com/pricing');
  assert.equal(seo.image, 'https://new.example.com/bolegaindia/brand/og-image.png');
  assert.ok(!JSON.stringify(seo).includes('bolegaindia.ai'));
  assert.equal(siteOrigin(), 'http://localhost:3000');
  assert.deepEqual(seoBuildConfig({}), { origin: 'http://localhost:3000', indexable: false });
  assert.throws(() => seoBuildConfig({ VITE_INDEXABLE: 'true' }), /Set VITE_SITE_URL/);
  assert.deepEqual(seoBuildConfig({ VITE_SITE_URL: 'https://new.example.com/', VITE_INDEXABLE: 'true' }), { origin: 'https://new.example.com', indexable: true });
});
