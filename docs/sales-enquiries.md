# Pricing and sales enquiries

The Enterprise **Talk to sales** button on `/pricing` opens the shared drawer in sales mode. It shows **Talk to sales**, sales-specific introductory text and **Send sales enquiry**. The **Pricing & sales** category is preselected and disabled. Normal support continues to open as **Contact support**.

`pricing_sales` is a built-in category, available even when support categories have been customized. It cannot be renamed, archived, reprioritized or deleted through support settings. The server fixes both the category and its high default priority when `intent=sales` is submitted; changing the browser select or submitting another category cannot override it. Sales tickets cannot later be moved to another category.

Sales enquiries appear as highlighted rows/cards with a **Sales** badge in Super admin → Support tickets. **Pricing & sales only** applies a database filter while preserving server pagination. They use the same private conversation, attachments and admin reply flow as support tickets. The requester receives a sales confirmation; internal sales alerts contain an admin link and never the guest's private ticket token.

Super admin → **Notifications → Add emails** accepts multiple addresses. Select **Pricing & sales** and/or **Support requests** for each team address. Existing Access requests, Payments and Signup leads choices remain available. In Support, **Email recipients** links directly to this configuration page. Test emails are sent only when the operator explicitly chooses the existing Test action.

Each enquiry sends one internal alert to every active recipient subscribed to its event. Inactive addresses and addresses subscribed only to other events are excluded. Customer confirmation emails always go to the requester's address. When no recipient configuration exists, the existing super-admin fallback applies. Once configured, the selected subscriptions determine delivery.

Migration `20261028200000_sales_enquiries.sql` adds the sales/support subscriptions. It preserves existing support recipients (active super-admin addresses) and existing subscription/inactive flags. Where the recipient list was empty, it preserves the former fallback subscriptions for the other event types. No new environment variables are required. The migration is applied to the connected project.

Verification covered tampered category/priority input, fixed category settings, multiple subscribed recipients, exclusion of inactive/unsubscribed addresses, private token secrecy, desktop/mobile drawers, highlighted sales tickets, server filtering and bulk email configuration. Implementation checks used mocked mail sending; no live enquiry or test email was sent.
