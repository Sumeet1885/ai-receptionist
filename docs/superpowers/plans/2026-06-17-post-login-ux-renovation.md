# Post-Login UX Renovation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Renovate the authenticated product UX into a route-driven daily dashboard for non-technical users who manage leads every day.

**Architecture:** Keep the landing page and visual auth page mostly intact, but replace string-based app navigation with URL routing. Split the authenticated console into a central dashboard plus focused pages for leads, inbox, calendar, and agents while reusing the existing data hooks and dashboard components.

**Tech Stack:** React 19, Vite, TypeScript, Supabase JS, Tailwind CSS utility classes, lightweight custom hash/history routing without adding a dependency.

---

## File Structure

- Modify `client/src/App.tsx`: replace `view`/`dashboardTab` as the source of truth with route parsing and navigation helpers.
- Modify `client/src/components/layout/Header.tsx`: authenticated top nav becomes Dashboard, Leads, Inbox, Calendar, Agents; auth routes collapse into one `auth` route with mode state.
- Create `client/src/components/dashboard/DashboardHome.tsx`: central daily home with overview cards, needs-attention list, recent leads, and quick agent status.
- Create `client/src/components/dashboard/PostLoginShell.tsx`: authenticated page wrapper with consistent content width and title area.
- Create `client/src/components/dashboard/AgentsPage.tsx`: agent selector/manager landing page.
- Create `client/src/components/dashboard/AgentDetailPage.tsx`: focused agent management with Overview, Knowledge, Install, Preview subviews.
- Modify `client/src/components/dashboard/DashboardView.tsx`: either retire it from active route use or simplify it to compose the new pages.
- Modify `client/src/components/dashboard/EmbedCodePanel.tsx`: remove hardcoded `agilewaters.com`; use current origin for display/copy.
- Modify `client/src/components/auth/AuthView.tsx`: accept one `defaultMode`, but route users to `/auth` instead of separate sign-in/sign-up views.
- Test with `npm run build --prefix client`.

## Task 1: Add Route Model

**Files:**
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Add route parsing helpers**

Add a small route parser near the top of `App.tsx`:

```ts
type AppRoute =
  | { name: 'landing' }
  | { name: 'auth'; mode: 'signin' | 'signup' }
  | { name: 'dashboard' }
  | { name: 'leads' }
  | { name: 'inbox' }
  | { name: 'calendar' }
  | { name: 'agents' }
  | { name: 'agent-detail'; botId: string; tab: 'overview' | 'knowledge' | 'install' | 'preview' }
  | { name: 'public-chat'; subdomain: string };
```

Use `window.history.pushState` for navigation so browser Back/Forward works.

- [ ] **Step 2: Replace `setView` calls with `navigate(path)`**

Map old views:

```txt
landing -> /
auth-signin -> /auth?mode=signin
auth-signup -> /auth?mode=signup
dashboard -> /dashboard
onboarding -> /agents/new
```

- [ ] **Step 3: Add `popstate` listener**

When the browser Back button fires, re-parse `window.location.pathname` and render the matching page.

## Task 2: Build Authenticated Shell

**Files:**
- Create: `client/src/components/dashboard/PostLoginShell.tsx`
- Modify: `client/src/components/layout/Header.tsx`

- [ ] **Step 1: Create `PostLoginShell`**

The shell should render a page title, subtitle, optional actions, and children:

```tsx
export function PostLoginShell({ title, subtitle, actions, children }: Props) {
  return (
    <div className="flex-1 bg-brand-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl lg:text-3xl font-display font-extrabold text-brand-text">{title}</h2>
            {subtitle && <p className="text-sm text-brand-muted mt-1">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Update `Header` nav**

Authenticated nav labels:

```txt
Dashboard, Leads, Inbox, Calendar, Agents
```

Landing remains unchanged for logged-out users.

## Task 3: Central Dashboard

**Files:**
- Create: `client/src/components/dashboard/DashboardHome.tsx`
- Reuse: `client/src/components/dashboard/StatsCards.tsx`

- [ ] **Step 1: Build daily overview cards**

Cards:

```txt
New Leads
Hot Leads
Appointments
Agent Status
```

Keep copy plain and non-technical.

- [ ] **Step 2: Add Needs Attention section**

Show top hot leads first, then recent leads. Empty state:

```txt
No leads need attention right now.
```

- [ ] **Step 3: Add Agent Health section**

Show selected agent, public link, calendar status placeholder, and quick links to `Agents` and `Calendar`.

## Task 4: Focused Leads Page

**Files:**
- Modify or reuse: `client/src/components/dashboard/LeadTable.tsx`
- Add route render in: `client/src/App.tsx`

- [ ] **Step 1: Render all leads for the selected agent**

Page title:

```txt
Leads
```

Subtitle:

```txt
People who spoke with your receptionist and may need follow-up.
```

- [ ] **Step 2: Keep delete behavior but soften labels**

Change “Live CRM Prospect Sheet” to:

```txt
Lead Queue
```

## Task 5: Inbox Page

**Files:**
- Reuse: `client/src/components/dashboard/ConversationList.tsx`
- Modify: `client/src/components/dashboard/ConversationDetail.tsx`

- [ ] **Step 1: Route page to existing conversation list**

Page title:

```txt
Inbox
```

Subtitle:

```txt
Review chat and voice conversations handled by the receptionist.
```

- [ ] **Step 2: Rename visible labels**

Change “Chat Sessions” to “Conversations”.

## Task 6: Calendar Page

**Files:**
- Reuse: `client/src/components/dashboard/AppointmentsTab.tsx`

- [ ] **Step 1: Route page to existing appointments tab**

Page title:

```txt
Calendar
```

Subtitle:

```txt
Connect your calendar and review bookings created by the receptionist.
```

## Task 7: Agents Page and Agent Detail

**Files:**
- Create: `client/src/components/dashboard/AgentsPage.tsx`
- Create: `client/src/components/dashboard/AgentDetailPage.tsx`
- Reuse: `client/src/components/dashboard/BotSettings.tsx`
- Reuse: `client/src/components/dashboard/EmbedCodePanel.tsx`

- [ ] **Step 1: Agents landing page**

Show cards for each agent with:

```txt
Business name
Industry
Public chat link
Buttons: Manage, Preview
```

- [ ] **Step 2: Agent detail page**

Tabs:

```txt
Overview, Knowledge, Install, Preview
```

`Install` contains embed script and allowed domains. `Knowledge` contains greeting and knowledge base settings.

## Task 8: One Auth Route

**Files:**
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/auth/AuthView.tsx` only if needed

- [ ] **Step 1: Route both sign-in and sign-up to `/auth`**

Use query param:

```txt
/auth?mode=signin
/auth?mode=signup
```

- [ ] **Step 2: After login, route to `/dashboard`**

Existing `AuthView` internal toggle remains usable.

## Task 9: Hardcoded Domain Cleanup

**Files:**
- Modify: `client/src/components/dashboard/EmbedCodePanel.tsx`
- Modify: `client/src/components/onboarding/DeploymentSuccessModal.tsx` if copy needs consistency

- [ ] **Step 1: Replace `https://agilewaters.com/widget/loader.js`**

Use:

```ts
const widgetBaseUrl = window.location.origin;
```

Display/copy:

```html
<script src="${widgetBaseUrl}/widget/loader.js" data-bot-id="${activeBot.id}"></script>
```

## Task 10: Verification

**Files:**
- None

- [ ] **Step 1: Build client**

Run:

```bash
npm run build --prefix client
```

Expected: TypeScript and Vite build pass.

- [ ] **Step 2: Manual routes**

Open these:

```txt
http://127.0.0.1:3000/dashboard
http://127.0.0.1:3000/leads
http://127.0.0.1:3000/inbox
http://127.0.0.1:3000/calendar
http://127.0.0.1:3000/agents
```

Expected: Back/Forward moves between screens.

## Self-Review

- Spec coverage: central dashboard, daily lead management, one auth route, URL-backed navigation, and agent install/settings separation are covered.
- Placeholder scan: no placeholder steps remain.
- Type consistency: route names and tab names are defined once in Task 1 and reused consistently.
