# Server pagination

Admin table/grid pages are selected in the database. The frontend sends the page/filter/search parameters and renders the returned rows; it never loads an entire list to slice it into pages.

| List | Database operation |
| --- | --- |
| Access requests | PostgREST exact count and range, with status/search filters; stable creation date + ID ordering |
| Customers | `admin_customer_page` SQL function: database search, lifecycle filtering, totals, status counts, limit/offset, and agent counts for the selected page |
| Support tickets (admin and customer) | PostgREST exact count and range, stable update date + ID ordering |
| Revenue / Signup leads | PostgREST exact count and range with payment/lead filters and stable creation date + ID ordering |
| Plans / Coupons | PostgREST exact count and 25-row range with stable ordering |

Customer auth metadata is read only inside the service-role-only SQL function; `anon` and `authenticated` cannot execute it. The API still requires an admin session/role. Resending a customer email looks up that specific user, rather than fetching the customer directory.

Plan selectors are paginated too. Trial approval filters active trial plans in the database. Coupon plan selection requests pages and preserves selected IDs across page changes; coupon table labels are fetched for its current page's referenced plan IDs. Public pricing remains the active catalogue, rather than the admin paginated table. Configuration fields and dashboard aggregates are not client-side page lists.

The Overview requests preview asks the database for six rows, rather than downloading a page and slicing it. Customer list pages and plan/coupon/support lists guard against an older request replacing a newer page response.

Migration: `20261028180000_admin_customer_pagination.sql` (applied to the connected project). Deploy API and admin changes together. No new environment variables are required.

Validation included SQL pagination with 60 equal-date rows, search beyond the first page, stage counts, out-of-range pages, exact user lookup, service-only permissions, real reads of the seeded data, repository regression tests, and desktop/mobile browser checks for plan/coupon paging and selections across pages.
