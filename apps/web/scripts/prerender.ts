import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer, loadEnv } from "vite";
import { PUBLIC_PAGES, seoBuildConfig } from "../src/lib/seo";
import { withSeoHtml } from "../src/lib/seoHtml";

const root = process.cwd();
const env = { ...loadEnv("production", root, "VITE_"), ...process.env };
const { origin, indexable } = seoBuildConfig(env);
const out = resolve(root, "dist");
const template = await readFile(resolve(out, "app.html"), "utf8").catch(() => readFile(resolve(out, "index.html"), "utf8"));
const assets = await readdir(resolve(out, "assets"));
const landingCss = assets.find((name) => /^BolegaLanding-.*\.css$/.test(name));
const server = await createServer({
  root,
  mode: "production",
  server: { middlewareMode: true },
  appType: "custom",
});
try {
  const { renderPublicPage } = await server.ssrLoadModule("/src/seo-entry.tsx");
  for (const path of Object.keys(PUBLIC_PAGES)) {
    let html = withSeoHtml(template, path, { origin, indexable });
    const content = renderPublicPage(path);
    html = html.replace(
      '<div id="root"></div>',
      () => `<div id="root">${content}</div>`,
    );
    if (path === "/" && landingCss)
      html = html.replace(
        "</head>",
        `<link rel="stylesheet" href="/assets/${landingCss}" /></head>`,
      );
    await writeFile(
      resolve(out, path === "/" ? "index.html" : `${path.slice(1)}.html`),
      html,
    );
  }
  // Unknown/private routes receive a noindex shell, never the searchable homepage fallback.
  await writeFile(
    resolve(out, "app.html"),
    withSeoHtml(template, "/dashboard", {
      origin,
      indexable: false,
      routeName: "dashboard",
    }),
  );
  await writeFile(
    resolve(out, "404.html"),
    withSeoHtml(template, "/not-found", {
      origin,
      indexable: false,
      routeName: "not-found",
    }).replace(
      '<div id="root"></div>',
      '<div id="root"><main><h1>Page not found</h1><p>This page could not be found.</p><a href="/">Back to home</a></main></div>',
    ),
  );
  const urls = indexable
    ? Object.keys(PUBLIC_PAGES)
        .map((path) => `<url><loc>${origin}${path}</loc></url>`)
        .join("")
    : "";
  await writeFile(
    resolve(out, "sitemap.xml"),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>\n`,
  );
  // Let crawlers read noindex on private pages. robots.txt is not an access-control mechanism.
  await writeFile(
    resolve(out, "robots.txt"),
    indexable
      ? `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /widget/\nSitemap: ${origin}/sitemap.xml\n`
      : "User-agent: *\nDisallow: /\n",
  );
  console.log(
    `SEO: rendered ${Object.keys(PUBLIC_PAGES).length} public pages; indexing ${indexable ? "enabled" : "disabled"}; canonical origin ${origin}`,
  );
} finally {
  await server.close();
}
