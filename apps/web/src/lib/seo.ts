const LOCAL_SITE_URL = "http://localhost:3000";

export const PUBLIC_PAGES = {
  "/": {
    title: "AI Receptionist for Indian Businesses | Bolega India",
    description:
      "Answer calls and chats in Indian languages, capture leads and book appointments with Bolega India. Request a 14-day free trial for your business.",
  },
  "/pricing": {
    title: "AI Receptionist Plans & Pricing | Bolega India",
    description:
      "Compare Bolega India plans for AI call minutes, agents and concurrent calls. View India and international pricing, setup fees and business features.",
  },
  "/request-access": {
    title: "Request a 14-Day Free Trial | Bolega India",
    description:
      "Request a 14-day free trial of Bolega India for your business. Our team reviews your request; your trial begins after email verification. No card required.",
  },
  "/privacy": {
    title: "Privacy Policy | Bolega India",
    description:
      "Learn how Bolega India handles account details, calls, chats, lead information and support requests, and how to contact us about your data.",
  },
  "/terms": {
    title: "Terms & Conditions | Bolega India",
    description:
      "Read the terms for using Bolega India, including account responsibilities, AI calling, service availability, plans, billing and support.",
  },
} as const;

const PRIVATE_TITLES: Record<string, string> = {
  "not-found": "Page not found",
  auth: "Sign in",
  "auth-confirm": "Email verification",
  checkout: "Checkout",
  dashboard: "Dashboard",
  leads: "Leads",
  inbox: "Inbox",
  calendar: "Calendar",
  calls: "Calls",
  agents: "Agents",
  plans: "Plans",
  "agent-new": "Create an agent",
  "agent-detail": "Agent",
  support: "Support",
  "contact-support": "Contact support",
  "support-guest-ticket": "Support ticket",
  "public-chat": "Chat",
  "super-admin": "Admin console",
};

export function siteOrigin(value?: string): string {
  const url = new URL(value?.trim() || (typeof window !== 'undefined' ? window.location.origin : LOCAL_SITE_URL));
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error(
      "VITE_SITE_URL must be an HTTP(S) origin without credentials.",
    );
  return url.origin;
}

/** Static HTML/sitemaps have no request host, so indexed builds need an explicit domain. */
export function seoBuildConfig(env: Record<string, string | undefined>) {
  const configured = env.VITE_SITE_URL?.trim();
  if (env.VITE_INDEXABLE === 'true' && !configured) throw new Error('Set VITE_SITE_URL before building an indexable website.');
  return { origin: siteOrigin(configured), indexable: !!configured && env.VITE_INDEXABLE !== 'false' };
}

export function normalizePublicPath(path: string): string {
  const normalized = path.replace(/\/+$/, "") || "/";
  if (normalized === "/privacy-policy") return "/privacy";
  if (normalized === "/terms-and-conditions") return "/terms";
  return normalized;
}

export function pageSeo(
  path: string,
  options: {
    origin?: string;
    indexable?: boolean;
    routeName?: string;
    query?: string;
  } = {},
) {
  const origin = siteOrigin(options.origin);
  const cleanPath = normalizePublicPath(path);
  const page = PUBLIC_PAGES[cleanPath as keyof typeof PUBLIC_PAGES];
  const query = new URLSearchParams(options.query);
  const privateQuery = [
    "token_hash",
    "token",
    "resume",
    "access_token",
    "refresh_token",
    "code",
  ].some((key) => query.has(key));
  const indexable = options.indexable !== false && !!page && !privateQuery;
  const title =
    page?.title ||
    `${PRIVATE_TITLES[options.routeName || ""] || "Workspace"} | Bolega India`;
  return {
    title,
    description:
      page?.description || "Secure access to your Bolega India workspace.",
    canonical:
      page && !privateQuery
        ? `${origin}${cleanPath === "/" ? "/" : cleanPath}`
        : null,
    robots: indexable
      ? "index, follow, max-image-preview:large"
      : "noindex, nofollow, noarchive",
    image: `${origin}/bolegaindia/brand/og-image.png`,
    structuredData: indexable
      ? {
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": `${origin}/#organization`,
              name: "Bolega India",
              url: `${origin}/`,
              logo: `${origin}/bolegaindia/brand/bolegaindia-logo.png`,
            },
            {
              "@type": "WebSite",
              "@id": `${origin}/#website`,
              name: "Bolega India",
              url: `${origin}/`,
              publisher: { "@id": `${origin}/#organization` },
              inLanguage: "en-IN",
            },
            {
              "@type": "WebPage",
              "@id": `${origin}${cleanPath}#webpage`,
              url: `${origin}${cleanPath}`,
              name: title,
              description: page.description,
              isPartOf: { "@id": `${origin}/#website` },
              inLanguage: "en-IN",
            },
          ],
        }
      : null,
  };
}

export function applyPageSeo(
  path: string,
  options: Parameters<typeof pageSeo>[1] = {},
) {
  const seo = pageSeo(path, options);
  document.title = seo.title;
  document.documentElement.lang = "en-IN";
  const meta = (key: string, content: string, property = false) => {
    const attribute = property ? "property" : "name";
    let element = document.head.querySelector<HTMLMetaElement>(
      `meta[${attribute}="${key}"]`,
    );
    if (!element) {
      element = document.createElement("meta");
      element.setAttribute(attribute, key);
      document.head.append(element);
    }
    element.content = content;
  };
  meta("description", seo.description);
  meta("robots", seo.robots);
  meta(
    "referrer",
    seo.canonical ? "strict-origin-when-cross-origin" : "no-referrer",
  );
  meta("og:title", seo.title, true);
  meta("og:description", seo.description, true);
  meta("og:type", "website", true);
  meta("og:site_name", "Bolega India", true);
  meta("og:locale", "en_IN", true);
  meta("og:image", seo.image, true);
  meta("og:image:alt", "Bolega India AI receptionist", true);
  meta("twitter:card", "summary_large_image");
  meta("twitter:title", seo.title);
  meta("twitter:description", seo.description);
  meta("twitter:image", seo.image);
  document.head
    .querySelectorAll(
      'link[rel="canonical"],script[data-seo="structured-data"]',
    )
    .forEach((node) => node.remove());
  if (seo.canonical) {
    const link = document.createElement("link");
    link.rel = "canonical";
    link.href = seo.canonical;
    document.head.append(link);
    meta("og:url", seo.canonical, true);
  } else document.head.querySelector('meta[property="og:url"]')?.remove();
  if (seo.structuredData) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.seo = "structured-data";
    script.textContent = JSON.stringify(seo.structuredData);
    document.head.append(script);
  }
}
