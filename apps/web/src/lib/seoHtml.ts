import { pageSeo } from "./seo";

const escape = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/** The same metadata policy is used in initial HTML, local development and SPA navigation. */
export function withSeoHtml(
  html: string,
  path: string,
  options: Parameters<typeof pageSeo>[1] = {},
) {
  const seo = pageSeo(path, options);
  const tags = [
    `<title>${escape(seo.title)}</title>`,
    `<meta name="description" content="${escape(seo.description)}" />`,
    `<meta name="keywords" content="${escape(seo.keywords)}" />`,
    `<meta name="robots" content="${seo.robots}" />`,
    `<meta name="referrer" content="${seo.canonical ? "strict-origin-when-cross-origin" : "no-referrer"}" />`,
    ...Object.entries({
      "og:type": "website",
      "og:site_name": "Bolega India",
      "og:locale": "en_IN",
      "og:title": seo.title,
      "og:description": seo.description,
      "og:image": seo.image,
      "og:image:width": "1200",
      "og:image:height": "630",
      "og:image:alt": "Bolega India AI receptionist",
      ...(seo.canonical ? { "og:url": seo.canonical } : {}),
    }).map(
      ([key, value]) => `<meta property="${key}" content="${escape(value)}" />`,
    ),
    ...Object.entries({
      "twitter:card": "summary_large_image",
      "twitter:title": seo.title,
      "twitter:description": seo.description,
      "twitter:image": seo.image,
    }).map(
      ([key, value]) => `<meta name="${key}" content="${escape(value)}" />`,
    ),
    ...(seo.canonical
      ? [`<link rel="canonical" href="${escape(seo.canonical)}" />`]
      : []),
    ...(seo.structuredData
      ? [
          `<script type="application/ld+json" data-seo="structured-data">${JSON.stringify(seo.structuredData).replace(/</g, "\\u003c")}</script>`,
        ]
      : []),
  ].join("\n    ");
  return html
    .replace(/<title>[^]*?<\/title>/gi, "")
    .replace(
      /<meta\s+(?:name|property)="(?:keywords|description|robots|referrer|og:[^"]*|twitter:[^"]*)"[^>]*>/gi,
      "",
    )
    .replace(/<link\s+rel="canonical"[^>]*>/gi, "")
    .replace(
      /<script[^>]*data-seo="structured-data"[^>]*>[^]*?<\/script>/gi,
      "",
    )
    .replace(/<html lang="[^"]*"/, '<html lang="en-IN"')
    .replace("</head>", `    ${tags}\n  </head>`);
}
