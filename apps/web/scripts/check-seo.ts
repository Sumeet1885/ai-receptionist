import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PUBLIC_PAGES } from "../src/lib/seo";

for (const path of Object.keys(PUBLIC_PAGES)) {
  const html = await readFile(
    `dist/${path === "/" ? "index" : path.slice(1)}.html`,
    "utf8",
  );
  const head = html.slice(0, html.indexOf("</head>"));
  for (const pattern of [
    /<title>/g,
    /name="description"/g,
    /name="robots"/g,
    /rel="canonical"/g,
    /<h1(?:\s|>)/g,
  ]) {
    const source = pattern.source.startsWith("<h1") ? html : head;
    assert.equal(
      (source.match(pattern) || []).length,
      1,
      `${path}: expected one ${pattern}`,
    );
  }
  assert.ok(
    !html.includes('<div id="root"></div>'),
    `${path}: public content must exist before JavaScript`,
  );
  assert.ok(!html.includes("Webhook simulated successfully"));
}
for (const file of ["app", "404"]) {
  const html = await readFile(`dist/${file}.html`, "utf8");
  assert.match(html, /name="robots" content="noindex/);
  assert.ok(!html.includes('rel="canonical"'));
  assert.ok(!html.includes("application/ld+json"));
}
const image = await readFile("public/bolegaindia/brand/og-image.png");
assert.equal(image.readUInt32BE(16), 1200);
assert.equal(image.readUInt32BE(20), 630);
const sitemap = await readFile("dist/sitemap.xml", "utf8");
assert.ok(!/auth|checkout|dashboard|super-admin|token/.test(sitemap));
console.log(
  "SEO checks passed: initial HTML, unique metadata, H1s, private noindex, social image and sitemap.",
);
