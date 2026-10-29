# Website and email URL configuration

Website URLs:

- Set `VITE_SITE_URL` in the web build environment for canonical URLs, social images, structured data and sitemap.
- The browser falls back to its current origin for local/unconfigured use; indexable builds require an explicit site origin.
- Set `VITE_INDEXABLE=false` on staging/preview builds.
- Docker workflows take `PRODUCTION_SITE_URL` / `STAGING_SITE_URL` from repository variables.

Email URLs, set in `apps/api/.env` or the API deployment environment:

```dotenv
CLIENT_URL=https://your-public-website.example
# Optional CDN/public asset base, defaults to CLIENT_URL:
EMAIL_ASSET_BASE_URL=https://your-public-assets.example
```

`CLIENT_URL` controls activation, verification, reset and customer destination links. It must be a trusted HTTP(S) origin without a path, query, fragment or credentials. It is required outside development. Never derive email destinations from the incoming Host header.

`EMAIL_ASSET_BASE_URL` controls the logo URL in browser previews and may include an asset path prefix. Logos in actual outgoing mail remain embedded as CID PNG attachments, so they do not depend on a publicly reachable image host. This also keeps local development email logos visible.

Changing Vite URL settings requires a web rebuild; changing API email URL settings requires an API restart. Existing emails retain the URLs with which they were sent. Brand text/contact/legal-entity information is not changed by a domain configuration update.
