# Admin pagination test data

The connected development/staging project has batch `biqa-20261028-a750`. Every business/name is labeled `[DUMMY biqa-20261028-a750]`. There are 50 records in each of Access requests, Customers, Support tickets, Signup leads, simulated Revenue payments, inactive Plans and inactive Coupons. Existing records remain, so list totals can exceed 50.

The script sends no emails and makes no payment/provider calls. Simulated payments **do appear in Revenue totals** until cleaned up. Test plans and coupons are inactive; public pricing and checkout continue to use the existing active catalogue. Notifications is a configuration page; no recipient addresses were added.

Customer mailboxes are `biqa-20261028-a750-customer-001@yopmail.com` through `biqa-20261028-a750-customer-050@yopmail.com`. Support tickets and simulated payments use those same customer addresses. Unpaid checkout leads use `biqa-20261028-a750-lead-001@yopmail.com` through `050`. Other access requests use the `request` prefix. Approved requests correspond to the first ten customer addresses.

Customers 001–010 await verification: open one in Customers and use **Resend activation** to test email delivery and start its trial after verification. Customers 011–020 await password setup, 021–030 are onboarding, 031–040 are active, 041–045 have expired trials, and 046–050 are suspended. Confirmed dummy accounts have random passwords that are not saved; use the existing password-reset email flow to sign in. YOPmail inboxes are public, so use these accounts only for dummy testing.

Requests include pending, contacted, approved and rejected examples, with two note entries each. Support tickets include all five statuses, all priorities, and customer replies/internal notes. Signup leads include started, closed and failed checkouts. Their reminder dates are empty, so background jobs will not send reminder emails for them.

At a page size of 25, 50 records fill two pages. Use All statuses to see the complete batch; individual status filters contain fewer records. Plans and Coupons also use server pagination. This dataset helps test pagination and UI responsiveness, but does not represent a large-scale load test.

The local manifest with exact IDs is saved in `apps/api/.test-data/biqa-20261028-a750.json` and ignored by Git. Keep it for cleanup. Cleanup deletes only records identified by that manifest; it validates dummy user metadata and the target project first. If a test plan has since been used by other records, foreign-key constraints prevent its removal rather than deleting those records.

For email testing, `apps/api/.test-data/biqa-20261028-a750-mailboxes.csv` lists addresses, states and record IDs. The first customer mailbox is `biqa-20261028-a750-customer-001@yopmail.com`; search that email in Customers and resend activation. No passwords are stored in the manifest or CSV.

Verified after seeding: 50 records in each of the seven lists; distinct 25-row pages for Requests, Revenue and Signup leads; 25-row Support pages; all 50 customer accounts loaded with the expected lifecycle stages; dummy plans excluded from the public catalogue; dummy orders have no scheduled reminder or provider payment ID. The report is saved as `apps/api/.test-data/biqa-20261028-a750-checks.json`.

Baseline backend-read samples before the server-pagination update, 28 October 2026:

| Read | Observed time |
| --- | --- |
| Access requests, page 1 | 300–950 ms |
| Access requests, page 2 | 269–314 ms |
| Revenue pages | 267–292 ms |
| Signup leads pages | 275–774 ms |
| Support pages | 266–287 ms |
| Customers backend assembly | 729–1,045 ms |
| All plans | 271–280 ms |
| All coupons | 267–786 ms |

These are repository/PostgREST reads over the network, **not full browser-page or authenticated HTTP response timings**. The subsequent server-pagination update replaces Customers' in-memory assembly with a private PostgreSQL function and fetches 25 plans/coupons per request. New Customer page samples were 266, 1,215 and 306 ms; network variability remains, while the server now transfers only the requested page. Fifty rows verify navigation and basic responsiveness; they do not establish production load capacity. See [server pagination](server-pagination.md).

From the repository root, remove this batch when finished:

```powershell
pnpm --filter @ai-receptionist/api test-data --confirm-project lbjeygmvhefmbrohbhrm --batch biqa-20261028-a750 --cleanup
```

Create another batch (uses the database configured in `apps/api/.env`):

```powershell
pnpm --filter @ai-receptionist/api test-data --confirm-project lbjeygmvhefmbrohbhrm
```

The script prints its generated batch name and manifest path. An interrupted batch can be resumed by passing the same `--batch`; auth users are recovered using their batch metadata and application records commit in one transaction. Completed batches cannot accidentally be seeded twice.
