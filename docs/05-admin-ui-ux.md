# 05 — Admin Portal UI/UX Design
**Workforce Management Platform — Admin Portal**
Version: 1.1
Date: 2026-06-14
Target: Desktop-first (1366 / 1440 / 1920 px)
Remediation: R-UI-001, R-UI-002, R-UI-003, R-UI-004 resolved

---

## Table of Contents

0. [Pre-Authentication Screens](#0-pre-authentication-screens)
1. [Design System](#1-design-system)
2. [Navigation & Sitemap](#2-navigation--sitemap)
3. [Global Patterns](#3-global-patterns)
4. [Dashboard](#4-dashboard)
5. [Employees](#5-employees)
6. [Attendance](#6-attendance)
7. [Leave Management](#7-leave-management)
8. [Regularization](#8-regularization)
9. [Payroll](#9-payroll)
10. [Reports](#10-reports)
11. [Notifications](#11-notifications)
12. [Audit Logs](#12-audit-logs)
13. [Settings](#13-settings)
14. [Accessibility Requirements](#14-accessibility-requirements)
15. [Error & Edge Case Pages](#15-error--edge-case-pages)

---

## 0. Pre-Authentication Screens

Screens rendered before a session exists. Use `AuthShell` — no sidebar, no top bar, centered card on `gray-50` background. `RestrictedShell` used for forced password change (logo + logout only).

### 0.1 Login (`/login`)

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│                    ⬡  WorkForce Pro                             │
│                       Acme Corp                                 │
│                                                                  │
│              ┌─────────────────────────────────┐               │
│              │         Admin Sign In            │               │
│              │                                 │               │
│              │  Email Address                  │               │
│              │  [_____________________________]│               │
│              │                                 │               │
│              │  Password                    [👁]│              │
│              │  [_____________________________]│               │
│              │                                 │               │
│              │  [         Sign In          ]   │               │
│              │                                 │               │
│              │       Forgot your password?     │               │
│              └─────────────────────────────────┘               │
│                                                                  │
│              © 2026 WorkForce Pro                               │
└──────────────────────────────────────────────────────────────────┘
```

**Card width:** 400px. Background: `bg-gray-50`. Card: `bg-white shadow-sm rounded-xl`.

**Fields:**

| Field | Type | Autocomplete | Required |
|---|---|---|---|
| Email Address | `type="email"` | `autocomplete="email"` | Yes |
| Password | `type="password"` with show/hide toggle `[👁]` | `autocomplete="current-password"` | Yes |

**Error States (inline alert below form, `role="alert"`):**

| API Error | User Message |
|---|---|
| `AUTH_001` INVALID_CREDENTIALS | "Invalid email or password. Check your credentials and try again." |
| `AUTH_004` EMAIL_NOT_FOUND | Same as `AUTH_001` (no account enumeration) |
| `AUTH_002` RATE_LIMITED | "Too many sign-in attempts. Please wait before trying again." + 60s countdown; submit disabled |
| `AUTH_007` ACCOUNT_INACTIVE | "Your account has been deactivated. Contact your administrator." |
| Network error | "Unable to connect. Check your internet connection and try again." |

**Rate-limit countdown:** `AUTH_002` → show "Try again in **47s**." Client-side countdown. Submit re-enables at 0.

**Success flow:**
- `requiresPasswordChange: false` → `/dashboard`
- `requiresPasswordChange: true` → `/change-password`
- `?redirect=` param preserved and honored after auth

**Accessibility:** `<form aria-label="Admin sign in">`, `aria-required="true"` on inputs, error `role="alert" aria-live="assertive"`.

---

### 0.2 Forgot Password (`/forgot-password`)

```
┌─────────────────────────────────┐
│   Reset Your Password           │
│                                 │
│  Enter your email and we'll     │
│  send a password reset link.    │
│                                 │
│  Email Address                  │
│  [_____________________________]│
│                                 │
│  [     Send Reset Link      ]   │
│                                 │
│  ← Back to Sign In              │
└─────────────────────────────────┘
```

**Success state** (form replaced, same page):
```
│  ✓  Check your email            │
│                                 │
│  If an account exists for       │
│  john@acme.com, a reset link    │
│  has been sent. Check your      │
│  inbox and spam folder.         │
│                                 │
│  Link expires in 1 hour.        │
│                                 │
│  [   Back to Sign In   ]        │
```

Success message identical whether email exists or not — no account enumeration. API: `POST /auth/password-reset/request`.

**Error:** `AUTH_002` rate limited → "Too many requests. Wait 1 hour before requesting another reset link."

---

### 0.3 Reset Password (`/reset-password?token=xxx`)

```
┌─────────────────────────────────┐
│   Set New Password              │
│                                 │
│  New Password               [👁]│
│  [_____________________________]│
│                                 │
│  Confirm New Password       [👁]│
│  [_____________________________]│
│                                 │
│  Password requirements:         │
│  ○ At least 8 characters        │
│  ○ One uppercase letter         │
│  ○ One number                   │
│                                 │
│  [     Set New Password     ]   │
└─────────────────────────────────┘
```

**Requirement indicators:** Each bullet turns green ✓ on live input as the condition is met.

**Validation (Zod):** `newPassword`: min 8, ≥1 uppercase, ≥1 number, max 128. `confirmPassword`: must equal `newPassword`.

**Invalid/expired token state** (`AUTH_009` — full page replace):
```
│  ⚠  Link Invalid or Expired    │
│                                 │
│  This reset link has expired    │
│  or has already been used.      │
│  Reset links are valid for 1h.  │
│                                 │
│  [  Request a New Reset Link ]  │
```
`[Request a New Reset Link]` → `/forgot-password`.

**Success state** (form replaced):
```
│  ✓  Password Updated            │
│                                 │
│  Your password has been set.    │
│  You can now sign in.           │
│                                 │
│  [        Sign In       ]       │
```
Auto-redirect to `/login` after 3 seconds.

---

### 0.4 Forced Change Password (`/change-password`)

Rendered inside `RestrictedShell` — logo top-left, `[Logout]` top-right. No sidebar, no navigation.

```
┌──────────────────────────────────────────────────────────────────┐
│  ⬡  WorkForce Pro                                    [Logout]   │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│              ┌─────────────────────────────────┐               │
│              │  🔒  Password Change Required    │               │
│              │                                 │               │
│              │  Your administrator has set a   │               │
│              │  temporary password. You must   │               │
│              │  set a new password to continue.│               │
│              │                                 │               │
│              │  New Password               [👁]│               │
│              │  [_____________________________]│               │
│              │                                 │               │
│              │  Confirm New Password       [👁]│               │
│              │  [_____________________________]│               │
│              │                                 │               │
│              │  ○ At least 8 characters        │               │
│              │  ○ One uppercase letter         │               │
│              │  ○ One number                   │               │
│              │                                 │               │
│              │  [    Update Password      ]    │               │
│              └─────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

**Routing guard (Next.js Middleware):** If JWT `requiresPasswordChange: true` AND route ≠ `/change-password`, `/api/auth/logout` → redirect `/change-password`. If `requiresPasswordChange: false` AND on `/change-password` → redirect `/dashboard`.

**API:** `PATCH /auth/me/change-password` — no current password field (temp already verified at login). Returns fresh `accessToken` with `requiresPasswordChange: false`.

**Success:** Replace token in storage → toast "Password updated. Welcome to WorkForce Pro!" → redirect `/dashboard` (full shell). Other device sessions revoked server-side automatically.

**`[Logout]` link:** Always accessible. Clears session, redirects `/login`.

---

## 1. Design System

### 1.1 Technology Stack

| Layer | Choice |
|---|---|
| Component library | shadcn/ui (Radix UI primitives + Tailwind CSS 4) |
| Styling | Tailwind CSS 4 with CSS variables for theming |
| Forms | React Hook Form + Zod validation |
| Tables | TanStack Table v8 (via shadcn/ui DataTable pattern) |
| Icons | Lucide React |
| Date utilities | date-fns + date-fns-tz (consistent with backend) |
| Toast notifications | Sonner (via shadcn/ui) |
| Charts (dashboard) | Recharts (via shadcn/ui chart primitives) |
| State management | React Context + URL state (searchParams for filters/pagination) |

### 1.2 Typography

Base font: **Inter** (variable font, Google Fonts or self-hosted)

```css
/* Tailwind CSS 4 custom font */
@font-face {
  font-family: 'Inter';
  src: url('/fonts/inter-variable.woff2') format('woff2');
  font-weight: 100 900;
}
```

| Role | Size | Weight | Line Height | Tailwind Class |
|---|---|---|---|---|
| Page title | 24px | 600 | 32px | `text-2xl font-semibold` |
| Section heading | 18px | 600 | 28px | `text-lg font-semibold` |
| Card heading | 16px | 500 | 24px | `text-base font-medium` |
| Body / table cell | 14px | 400 | 20px | `text-sm` |
| Helper text / caption | 12px | 400 | 16px | `text-xs` |
| Micro / badge | 11px | 500 | 16px | `text-[11px] font-medium` |

### 1.3 Color System

Using CSS custom properties in `globals.css`. All colors reference the shadcn/ui convention.

```css
:root {
  /* Background layers */
  --background: 0 0% 100%;        /* white — page bg */
  --surface: 0 0% 98%;            /* gray-50 — card/panel bg */
  --surface-raised: 0 0% 96%;     /* gray-100 — hover/selected bg */

  /* Brand */
  --primary: 221 83% 53%;         /* blue-600 — CTA, links, active nav */
  --primary-foreground: 0 0% 100%;

  /* Borders */
  --border: 220 13% 91%;          /* gray-200 */
  --border-strong: 220 9% 78%;    /* gray-300 */

  /* Text */
  --foreground: 224 71% 4%;       /* gray-950 — primary text */
  --muted-foreground: 220 9% 46%; /* gray-500 — secondary text */

  /* Sidebar */
  --sidebar-bg: 222 47% 11%;      /* slate-900 — dark sidebar */
  --sidebar-fg: 210 40% 96%;      /* slate-100 */
  --sidebar-active: 221 83% 53%;  /* blue-600 active item bg */
  --sidebar-hover: 217 33% 17%;   /* slate-800 hover */
}
```

### 1.4 Status Color System

All status colors are rendered as shadcn/ui `Badge` components with custom `variant`.

| Status | Background | Text | Tailwind | Context |
|---|---|---|---|---|
| `present` | green-50 | green-700 | `bg-green-50 text-green-700` | Attendance day |
| `half-day` | amber-50 | amber-700 | `bg-amber-50 text-amber-700` | Attendance day |
| `absent` | red-50 | red-700 | `bg-red-50 text-red-700` | Attendance day |
| `leave` | blue-50 | blue-700 | `bg-blue-50 text-blue-700` | Attendance day |
| `holiday` | purple-50 | purple-700 | `bg-purple-50 text-purple-700` | Attendance day |
| `weekend` | gray-100 | gray-500 | `bg-gray-100 text-gray-500` | Attendance day |
| `pending` | amber-50 | amber-700 | `bg-amber-50 text-amber-700` | Leave / Reg |
| `approved` | green-50 | green-700 | `bg-green-50 text-green-700` | Leave |
| `rejected` | red-50 | red-700 | `bg-red-50 text-red-700` | Leave / Reg |
| `cancelled` | gray-100 | gray-500 | `bg-gray-100 text-gray-500` | Leave |
| `revoked` | orange-50 | orange-700 | `bg-orange-50 text-orange-700` | Leave |
| `draft` | amber-50 | amber-700 | `bg-amber-50 text-amber-700` | Payroll |
| `finalised` | green-50 | green-700 | `bg-green-50 text-green-700` | Payroll |
| `active` | green-50 | green-700 | `bg-green-50 text-green-700` | Employee |
| `inactive` | gray-100 | gray-500 | `bg-gray-100 text-gray-500` | Employee |
| `checked-in` | green-50 | green-700 | `bg-green-50 text-green-700` | Live attendance |
| `checked-out` | gray-100 | gray-600 | `bg-gray-100 text-gray-600` | Live attendance |

### 1.5 Spacing Scale

Tailwind CSS 4 default spacing applies. Key conventions:
- Page padding: `px-6 py-6` (24px) at 1366; `px-8 py-8` (32px) at 1440+
- Card padding: `p-5` or `p-6`
- Table cell padding: `px-4 py-3`
- Form field gap: `gap-4` (16px)
- Section gap: `gap-6` (24px)

### 1.6 Breakpoints

| Token | Width | Usage |
|---|---|---|
| `lg` | 1024px | Minimum supported (future responsive) |
| `xl` | 1280px | — |
| `2xl` | 1366px | Minimum desktop target |
| `3xl` (custom) | 1440px | Standard desktop |
| `4xl` (custom) | 1920px | Wide desktop |

```css
/* tailwind.config.ts additions */
screens: {
  '3xl': '1440px',
  '4xl': '1920px',
}
```

---

## 2. Navigation & Sitemap

### 2.1 Shell Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  SIDEBAR (240px)         │  CONTENT AREA                        │
│  ┌──────────────────┐    │  ┌──────────────────────────────┐    │
│  │  Logo + Company  │    │  │  Top Bar (Header)             │    │
│  ├──────────────────┤    │  │  Breadcrumb · User Menu       │    │
│  │  Nav Items       │    │  ├──────────────────────────────┤    │
│  │  • Dashboard     │    │  │  Page Content                 │    │
│  │  • Employees     │    │  │                               │    │
│  │  • Attendance    │    │  │                               │    │
│  │  • Leave         │    │  │                               │    │
│  │  • Regularization│    │  │                               │    │
│  │  • Payroll       │    │  │                               │    │
│  │  • Reports       │    │  │                               │    │
│  │  ─────────────── │    │  │                               │    │
│  │  • Notifications │    │  │                               │    │
│  │  • Audit Logs    │    │  │                               │    │
│  │  ─────────────── │    │  │                               │    │
│  │  • Settings      │    │  │                               │    │
│  ├──────────────────┤    │  │                               │    │
│  │  Admin Profile   │    │  │                               │    │
│  └──────────────────┘    │  └──────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

- **Sidebar:** Fixed left, 240px wide, dark bg (`slate-900`), scrollable nav items
- **Content area:** `calc(100vw - 240px)`, white bg, scrollable independently
- **Top bar:** Sticky within content area, 56px height, white + border-bottom
- **Sidebar collapse:** Not in V1 (complexity vs gain for desktop-only tool)

### 2.2 Sidebar Component

```
┌──────────────────────────┐
│  ⬡  WorkForce Pro        │  ← Logo + company name
│     Acme Corp            │    (from companySettings.companyName)
├──────────────────────────┤
│  ▪  Dashboard            │  ← Active: blue-600 bg, white text
│  ▪  Employees        (45)│  ← Badge: active employee count
│  ▪  Attendance           │
│  ▪  Leave             (3)│  ← Badge: pending leave count
│  ▪  Regularization    (2)│  ← Badge: pending reg count
│  ▪  Payroll              │
│  ▪  Reports              │
│  ──────────────────────  │
│  ▪  Notifications     (5)│  ← Unread count
│  ▪  Audit Logs           │
│  ──────────────────────  │
│  ⚙  Settings             │
├──────────────────────────┤
│  ○  Admin Name           │  ← Current admin's name
│     View Profile · Logout│
└──────────────────────────┘
```

**Badge counts:** Fetched once on portal load via:
- Pending leaves: `GET /leaves/pending?limit=1` → `meta.total`
- Pending regularizations: `GET /regularizations/pending?limit=1` → `meta.total`
- Unread notifications: `GET /notifications?isRead=false&limit=1` → `meta.total`

Badges refresh every 5 minutes (client-side interval). No WebSocket in V1.

### 2.3 Top Bar Component

```
┌──────────────────────────────────────────────────────────────────┐
│  Employees / Create Employee          [🔔 3]  [? Help]  [Admin ▾]│
└──────────────────────────────────────────────────────────────────┘
```

- **Breadcrumb:** Reflects current route hierarchy (e.g. `Employees / Edit / John Doe`)
- **Notification bell:** Links to `/notifications`; shows unread count badge
- **Admin dropdown:** `View Profile` | `Change Password` | `Logout`

### 2.4 Full Sitemap

```
/                          → Redirect → /dashboard
/login                     → Login page (unauthenticated)
/dashboard                 → Dashboard

/employees                 → Employee list
/employees/new             → Create employee (drawer opens over list)
/employees/[id]            → Employee profile (read-only admin view)
/employees/[id]/edit       → Edit employee (drawer opens over profile)

/attendance                → Attendance daily view (today, all employees)
/attendance/weekly         → Weekly view
/attendance/monthly        → Monthly view
/attendance/employee/[id]  → Single employee attendance history

/leave                     → Leave pending approvals (default tab)
/leave/history             → Leave history (all statuses)
/leave/balances            → Leave balance summary (all employees)

/regularization            → Pending regularizations (default tab)
/regularization/history    → Regularization history

/payroll                   → Payroll list (current month default)
/payroll/[yearMonth]       → Month payroll overview
/payroll/[yearMonth]/[id]  → Single employee payslip detail

/reports/attendance        → Attendance report
/reports/leave             → Leave report
/reports/payroll           → Payroll report

/notifications             → Notification history

/audit-logs                → Audit log list
/audit-logs/[id]           → Single audit log detail

/settings                  → Company settings (default tab)
/settings/working-days     → Working days & shift
/settings/holidays         → Holiday calendar
/settings/leave            → Leave configuration
/settings/geofence         → Geo-fence configuration
```

### 2.5 User Flow — First-Time Admin Login

```
Login page
  → POST /auth/login
  → requiresPasswordChange: true?
      YES → /change-password (forced; no sidebar nav accessible)
      NO  → /dashboard
```

---

## 3. Global Patterns

### 3.1 Page Layout Template

Every authenticated page uses this structure:

```tsx
<SidebarLayout>
  <TopBar breadcrumb={[...]} />
  <PageContent>
    <PageHeader title="Employees" actions={<Button>Create Employee</Button>} />
    <PageBody>
      {/* page-specific content */}
    </PageBody>
  </PageContent>
</SidebarLayout>
```

`PageHeader` contains:
- Left: `<h1>` (page title) + optional description text
- Right: Primary action button(s) — max 2 at top level; more via dropdown

### 3.2 Table Pattern

All data tables use **shadcn/ui DataTable** (TanStack Table v8 underneath).

**Standard table anatomy:**

```
┌──────────────────────────────────────────────────────────────────┐
│  [🔍 Search...] [Filter ▾] [Status ▾] [Date Range]    [Export ↓]│  ← Toolbar
├────────┬──────────────────┬───────────┬─────────────┬────────────┤
│  ☐     │  Employee Name   │  Dept     │  Status     │  Actions   │  ← Header
├────────┼──────────────────┼───────────┼─────────────┼────────────┤
│  ☐     │  John Doe        │  Eng      │  ● Active   │  ⋮         │  ← Row
│  ☐     │  Jane Smith      │  HR       │  ○ Inactive │  ⋮         │
├────────┴──────────────────┴───────────┴─────────────┴────────────┤
│  Showing 1–20 of 45                    ← 1  2  3  →              │  ← Pagination
└──────────────────────────────────────────────────────────────────┘
```

**Standard props per table:**

| Property | Implementation |
|---|---|
| Search | Debounced `?search=` query param (300ms); clears to page 1 |
| Filters | `<Select>` dropdowns; each updates URL search params |
| Date range | `<DateRangePicker>` (shadcn/ui Calendar); ISO date strings in URL |
| Sort | Column header click; `?sortBy=&sortOrder=` in URL |
| Pagination | `?page=&limit=` in URL; default limit 20; options: 10/20/50 |
| Row actions | `<DropdownMenu>` via `⋮` (3-dot) button in Actions column |
| Bulk selection | Checkbox column; bulk actions appear in toolbar when rows selected |
| Empty state | Centered illustration + message + optional CTA |
| Loading state | Skeleton rows (10 rows × column structure) |
| Error state | Error alert with retry button |

**URL state:** All table state (search, filters, sort, page) lives in URL query params. Browser back/forward navigates table state. Deep-linkable.

### 3.3 Form Pattern

All forms use **React Hook Form + Zod** with shadcn/ui `<Form>` components.

```tsx
// Standard form field
<FormField
  control={form.control}
  name="firstName"
  render={({ field }) => (
    <FormItem>
      <FormLabel>First Name <span aria-hidden>*</span></FormLabel>
      <FormControl>
        <Input placeholder="Enter first name" {...field} />
      </FormControl>
      <FormMessage />  {/* Zod error message */}
    </FormItem>
  )}
/>
```

**Validation display:**
- Inline error below field (`<FormMessage>` — red text, 12px)
- Field border turns red on error
- First error field scrolled into view on submit
- Submit button shows spinner + disabled state while pending

**Required field indicator:** `*` in field label; `aria-required="true"` on input; footer note: "* Required fields"

**Form submit states:**
1. Idle — button enabled
2. Submitting — button disabled + spinner + "Saving…" text
3. Error — toast error + form re-enabled + server error shown above submit
4. Success — toast success + form closes (drawer) or redirects (page)

### 3.4 Drawer Strategy

**Drawers (`<Sheet>`)** are used for create and edit forms that layer over the current page without navigation.

| Use Case | Drawer Size |
|---|---|
| Create/Edit Employee | `size="lg"` (640px) |
| Create Holiday | `size="md"` (480px) |
| Register Device | `size="sm"` (400px) |
| Approve/Reject with reason | `size="sm"` (400px) |

**Drawer anatomy:**
```
┌────────────────────────────────────────────────────────┐ 640px
│  Create Employee                                [✕]    │  ← Header
├────────────────────────────────────────────────────────┤
│  (scrollable form content)                             │  ← Body
│                                                        │
│                                                        │
├────────────────────────────────────────────────────────┤
│  [Cancel]                          [Create Employee]   │  ← Footer
└────────────────────────────────────────────────────────┘
```

Drawer opens from the right. Clicking outside or pressing Escape closes it (with confirmation if form is dirty).

### 3.5 Modal Strategy

**Modals (`<Dialog>`)** are used for confirmations and quick-action forms.

| Use Case | Modal Width |
|---|---|
| Destructive confirmation (Deactivate, Delete) | 480px |
| Approve/Reject reason form | 480px |
| Finalize/Unfinalize confirmation | 480px |
| View payslip details | 640px |

**Confirmation modal pattern:**
```
┌──────────────────────────────────────────┐
│  Deactivate Employee                     │  ← Title (icon + label)
├──────────────────────────────────────────┤
│  This will immediately revoke all active │
│  sessions for John Doe. They will not    │
│  be able to log in until reactivated.    │
│                                          │
│  Reason (optional) _____________________ │
├──────────────────────────────────────────┤
│  [Cancel]            [Deactivate]        │  ← Destructive button is red
└──────────────────────────────────────────┘
```

Destructive confirm buttons use `variant="destructive"` (red). Non-destructive use `variant="default"`.

### 3.6 Toast Strategy

All toasts use **Sonner** (`import { toast } from 'sonner'`).

| Event Type | Toast Type | Duration | Message Pattern |
|---|---|---|---|
| Create success | `toast.success` | 4s | "Employee created successfully." |
| Update success | `toast.success` | 4s | "Changes saved." |
| Delete/destructive | `toast.success` | 4s | "Employee deactivated. All sessions revoked." |
| API error | `toast.error` | 6s | Error `message` from API response |
| Validation error | `toast.error` | 5s | "Please fix the form errors before saving." |
| Warning (e.g. payroll finalised) | `toast.warning` | 8s | Warning text from API `warnings[]` |
| Network error | `toast.error` | 6s | "Connection error. Check your network and try again." |

Toasts appear at bottom-right. Max 3 stacked. Long warning toasts have a `[Dismiss]` action button.

### 3.7 Loading States

Three tiers:

| Tier | Pattern | When |
|---|---|---|
| Page load | Skeleton layout (full page structure with shimmer) | Initial navigation to route |
| Table refetch | Table skeleton rows (preserves column headers) | Filter/search/page changes |
| Button action | Button spinner + disabled | Form submit, approve, deactivate actions |

Never show a full-page spinner for table operations — skeleton rows preserve layout stability.

### 3.8 Empty States

Every list/table has a defined empty state:

```
┌──────────────────────────────────┐
│                                  │
│          [illustration]          │
│                                  │
│        No employees yet          │  ← Title
│                                  │
│   Create your first employee     │  ← Description
│   to get started.                │
│                                  │
│      [Create Employee]           │  ← Optional CTA
│                                  │
└──────────────────────────────────┘
```

Illustrations: simple SVG icons (Lucide icons at 64px, `text-muted-foreground`). No third-party illustration packs in V1.

**Filtered empty state** (when search/filter returns no results):
```
          🔍
     No results found
  Try adjusting your search
  or filters to find what
     you're looking for.
     [Clear Filters]
```

---

### 3.9 Session Expired State

Global pattern. Not a page — a non-dismissible overlay rendered by root layout when `AuthContext.sessionExpired === true`.

```
┌──────────────────────────────────────────────────────────────────┐
│  (page content — blurred, pointer-events: none)                  │
│                                                                  │
│         ┌────────────────────────────────────┐                  │
│         │                                    │                  │
│         │  🔒  Session Expired               │                  │
│         │                                    │                  │
│         │  Your session has expired or was   │                  │
│         │  revoked. Please sign in again     │                  │
│         │  to continue.                      │                  │
│         │                                    │                  │
│         │  [       Sign In Again       ]     │                  │
│         │                                    │                  │
│         └────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────────────┘
```

**Trigger conditions:**
1. `POST /auth/refresh` returns `401` — refresh token invalid, expired, or revoked
2. Any API call returns `401` AND silent refresh has already been attempted once

**Behavior:**
- Non-dismissible: no X button, no Escape, no outside-click close
- Background: `backdrop-blur-sm` + `pointer-events-none` prevents all interaction
- `[Sign In Again]` → `/login?redirect=<current-pathname>`
- After re-login: redirected back to `?redirect` path
- ARIA: `role="alertdialog"`, `aria-modal="true"`, `aria-label="Session expired"`, focus trapped
- CSS: `position: fixed; inset: 0; z-index: 9999`

**Implementation:** Global Axios/fetch response interceptor in `src/lib/api-client.ts` catches `401` after one silent refresh attempt, sets `sessionExpired: true` in `AuthContext`. `<SessionExpiredOverlay>` component in root layout renders conditionally.

**Do NOT** use shadcn/ui `<Dialog>` — Radix Dialog is closeable via Escape. Use a custom fixed overlay.

---

## 4. Dashboard

### 4.1 Purpose

Landing page after login. Real-time attendance overview, pending action counts, and monthly summary KPIs. Gives the admin an at-a-glance view of workforce status without navigating to individual modules.

### 4.2 Layout

```
┌──────────────────────────────────────────────────────────────────────┐
│  Dashboard                                         Today: 14 Jun 2026│
├──────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ Checked In │  │  Absent    │  │ On Leave   │  │ Pending    │     │
│  │   32 / 45  │  │     8      │  │     5      │  │  Actions   │     │
│  │            │  │            │  │            │  │    3 + 2   │     │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────┐  ┌──────────────────────────┐  │
│  │  Live Attendance                │  │  Pending Approvals       │  │
│  │  (Employee checkin list         │  │  • 3 Leave Requests      │  │
│  │   with check-in times)          │  │  • 2 Regularizations     │  │
│  │                                 │  │                          │  │
│  │  [View All Attendance →]        │  │  [Review →]              │  │
│  └─────────────────────────────────┘  └──────────────────────────┘  │
├──────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │  Monthly Attendance Summary (June 2026)                         │ │
│  │  [Bar chart: Present / Half-day / Absent / Leave by week]       │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

### 4.3 Components

**KPI Cards (row of 4)**

| Card | Value Source | Link |
|---|---|---|
| Checked In | `GET /attendance/today?status=checked-in&limit=1` → `meta.total` / total active employees | `/attendance` |
| Absent Today | Derived: total active − checked-in − on leave | `/attendance` |
| On Leave Today | `GET /leaves?status=approved&startDate=today&endDate=today&limit=1` → `meta.total` | `/leave/history` |
| Pending Actions | Sum of pending leaves + pending regularizations | First pending item |

KPI card design:
```
┌─────────────────────────┐
│  ↗ 32 checked in        │  ← large number (30px semibold)
│  of 45 active employees │  ← subtext (12px muted)
│                          │
│  [icon]  Checked In     │  ← label + icon (14px)
└─────────────────────────┘
```

**Live Attendance Panel**
- List of today's check-ins (most recent first)
- Columns: Employee name + avatar initials | Check-in time | Duration (live) | Status badge
- Max 10 rows displayed; "View All →" links to `/attendance`
- **Live duration:** Client-side timer updates `elapsedMinutes` from `checkInTimestamp` (computed in browser, not from API per R-API-015 fix decision)
- Refresh: SWR with 30-second revalidation

**Pending Approvals Panel**
- Two sub-sections: Leave (count + first 3 pending) | Regularization (count + first 3 pending)
- Each row: Employee name | Type | Date(s) | [Approve] [View] quick actions
- Quick approve from dashboard opens confirmation modal; on success refreshes both panel and sidebar badge

**Monthly Attendance Chart**
- Recharts `<BarChart>` grouped by week (4–5 bars per month)
- Series: Present (green), Half-day (amber), Absent (red), Leave (blue)
- X-axis: week labels ("Week 1", "Week 2", etc.)
- Y-axis: employee-day count
- Data: `GET /reports/attendance?yearMonth=YYYY-MM`
- Legend below chart; hover tooltip showing exact counts

### 4.4 Actions
- Click KPI card → navigate to relevant section with pre-applied filter
- Click employee name in Live Attendance → `/attendance/employee/[id]`
- Click [Approve] on pending items → confirmation modal → PATCH API → refresh
- Date shown as IST date (from `companySettings.timezone`)

### 4.5 Permissions
- Admin only. No employee role access to admin portal.

### 4.6 Loading State
- KPI cards: 4 skeleton cards (pulse animation)
- Live attendance panel: 6 skeleton rows
- Chart: skeleton rectangle (200px height)

### 4.7 Empty State
- No attendance today (weekend/holiday): KPI cards show `0` with a note "Today is a non-working day."
- No pending actions: Pending Actions panel shows "All caught up! No pending approvals." with a ✓ icon.

---

## 5. Employees

### 5.1 Employee List (`/employees`)

**Purpose:** Browse all employees, search, filter by department/status, create new employees.

**Layout:**
```
┌──────────────────────────────────────────────────────────────────────┐
│  Employees                              [+ Create Employee]          │
├──────────────────────────────────────────────────────────────────────┤
│  [🔍 Search name or ID...]  [Department ▾]  [Status ▾]              │
├─────┬──────────────────┬───────────┬───────────────┬────────────────┤
│  ☐  │  Employee        │  Dept     │  Status        │  Joined       │  Actions
├─────┼──────────────────┼───────────┼───────────────┼────────────────┤
│  ☐  │  ◉ John Doe      │  Eng      │  ● Active      │  01 Jan 2025  │    ⋮
│     │  EMP001          │           │                │               │
│  ☐  │  ◉ Jane Smith    │  HR       │  ○ Inactive    │  15 Mar 2025  │    ⋮
│     │  EMP002          │           │                │               │
└─────┴──────────────────┴───────────┴───────────────┴────────────────┘
│  Showing 1–20 of 45                              ← 1  2  3  →       │
```

**Columns:**

| Column | Data | Sortable | Width |
|---|---|---|---|
| Checkbox | Bulk select | — | 40px |
| Employee | `firstName lastName` + `employeeId` in subtext + initials avatar | Yes (`firstName`) | flex |
| Department | `department` or `—` | Yes | 160px |
| Status | Badge: Active / Inactive | Yes (`isActive`) | 120px |
| Date Joined | `dateOfJoining` formatted `DD MMM YYYY` | Yes | 140px |
| Actions | `⋮` dropdown | — | 64px |

**Row Actions (`⋮` dropdown):**
- View Profile
- Edit Employee
- ──────
- Register Device (only if no device registered)
- Reset Device (only if device registered)
- ──────
- Deactivate (only if active)
- Activate (only if inactive)

**Filters:**
- `Department`: multi-select dropdown of unique departments from employee list
- `Status`: All / Active / Inactive

**Search:** Debounced on `name` OR `employeeId` (case-insensitive partial match)

**Bulk Actions:** When ≥1 row selected, toolbar shows:
- `Activate Selected` (only when all selected are inactive)
- `Deactivate Selected` (only when all selected are active)
- Mixed selection: no bulk action (tooltip: "Select employees of the same status to use bulk actions")

**Pagination:** `?page=&limit=` defaults 1/20

**Sort defaults:** `dateOfJoining` desc (newest first)

**Loading State:** 10 skeleton rows

**Empty State:** "No employees yet. Create your first employee to get started." + [Create Employee]

**Filtered Empty:** "No employees match your filters." + [Clear Filters]

---

### 5.2 Create Employee (Drawer)

**Purpose:** Admin creates a new employee account. Drawer slides in over the list.

**Trigger:** [+ Create Employee] button → `Sheet` opens from right

**Layout (640px drawer):**

```
Create Employee                                         [✕]
─────────────────────────────────────────────────────────
Personal Information
  First Name *                   Last Name *
  [_________________________]    [_________________________]

  Email Address *                Employee ID *
  [_________________________]    [_________________________]

  Phone                          Role *
  [_________________________]    [Employee ▾]

  Department                     Designation
  [_________________________]    [_________________________]

Employment Details
  Date of Joining *              Monthly Salary *
  [📅 __________________]       [₹ _____________________]

─────────────────────────────────────────────────────────
* Required fields
                              [Cancel]  [Create Employee]
```

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| First Name | Text input | Yes | Max 50 chars |
| Last Name | Text input | Yes | Max 50 chars |
| Email Address | Email input | Yes | Valid email; unique |
| Employee ID | Text input | Yes | Max 20 chars; unique; alphanumeric + dash |
| Phone | Tel input | No | E.164 format or blank |
| Role | Select | Yes | Employee / Admin |
| Department | Text input | No | Max 100 chars |
| Designation | Text input | No | Max 100 chars |
| Date of Joining | Date picker | Yes | Cannot be future date |
| Monthly Salary | Number input | Yes | ≥ 0; numeric only |

**Validation (Zod):**
- All required fields show inline error on first submit attempt
- Email validated as RFC 5321 format
- Date of Joining: max today's date
- Monthly Salary: non-negative number

**Success State:**
- Drawer closes
- Toast: "Employee created. Temporary password: `[password]`"
- Toast persists 15 seconds with a [Copy] button (copies temp password to clipboard)
- Employee list refreshes
- After toast closes, password is gone — admin cannot retrieve it from UI again

**Error States:**
- `GEN_006` (duplicate email/ID): field-level error inline under the conflicting field
- Other API errors: toast error

---

### 5.3 Employee Profile (`/employees/[id]`)

**Purpose:** Admin views all employee data in one place including leave balances, device status, and quick action buttons.

**Layout:**

```
← Employees   /   John Doe
──────────────────────────────────────────────────────────────────────
┌────────────────────────────────┐  ┌───────────────────────────────┐
│  ◉ John Doe                    │  │  Leave Balances               │
│  EMP001 · Engineering          │  │  Paid Leave:    12 + 3 CF     │
│  john@acme.com                 │  │  Sick Leave:    8              │
│  +91 98765 43210               │  │  Casual Leave:  3              │
│                                │  │  (as of Jun 2026)             │
│  Joined: 01 Jan 2025           │  └───────────────────────────────┘
│  Salary: ₹50,000/month         │
│  Status: ● Active              │  ┌───────────────────────────────┐
│  Device: ✓ Registered          │  │  Quick Actions                │
│                                │  │  [Edit Profile]               │
│  [Edit] [Deactivate]           │  │  [Register Device]            │
└────────────────────────────────┘  │  [Reset Device]               │
                                    │  [Reset Password]             │
                                    └───────────────────────────────┘
──────────────────────────────────────────────────────────────────────
│  [Attendance History]  [Leave History]  [Payroll History]  [Regs]  │
└──────────────────────────────────────────────────────────────────────
```

**Tabs below profile card:**
- **Attendance History** — table of recent attendance days (last 30 days default)
- **Leave History** — list of all leave requests for this employee
- **Payroll History** — list of all payroll summaries for this employee
- **Regularizations** — list of all regularization requests

Each tab is a mini-table with the standard table pattern (limited columns relevant to context).

**Actions available on this page:**

| Action | Button Location | Modal/Drawer |
|---|---|---|
| Edit Profile | Primary button + Quick Actions | Drawer |
| Deactivate / Activate | Button (label changes) | Confirmation modal |
| Register Device | Quick Actions | Drawer (fingerprint input) |
| Reset Device | Quick Actions | Confirmation modal |

---

### 5.4 Edit Employee (Drawer)

**Trigger:** Edit Profile button on Employee Profile page

**Layout:** Same as Create Employee drawer but pre-filled.

**Differences from Create:**
- `employeeId`, `email`, `dateOfJoining`, `role` are **read-only** (displayed as text, not inputs) — documented in BR-EMP-08
- Additional field: `Date of Leaving` (optional; for resigned employees)
- Submit label: "Save Changes"

**Date of Leaving field:**
- Date picker; min date = `dateOfJoining + 1`
- When set, shown as `Resigned on: [date]` in the profile header
- Can be cleared (set to null)

**Success State:** Drawer closes; toast "Employee profile updated."; profile page refreshes.

---

### 5.5 Activate / Deactivate Employee

**Trigger:** Action button on Employee List row menu or Employee Profile page

**Deactivate Modal:**
```
⚠ Deactivate Employee

Deactivating John Doe will:
• Immediately revoke all active sessions
• Prevent login on all devices
• Preserve all attendance and leave records

John Doe can be reactivated at any time. They
will need to log in fresh on each device after
reactivation.

Reason (optional)
[___________________________________________]

                    [Cancel]   [Deactivate]
```

`[Deactivate]` button = `variant="destructive"` (red).

**Activate Modal:**
```
Activate Employee

Reactivate John Doe's account?

Note: Existing device sessions are not
restored. They must log in fresh on their
registered device.

            [Cancel]   [Activate]
```

**Success toasts:**
- Deactivate: "John Doe's account deactivated. All sessions revoked."
- Activate: "John Doe's account activated. They must log in on their device."

---

### 5.6 Register / Reset Device (Drawer)

**Register Device Drawer (400px):**
```
Register Device for John Doe                          [✕]
──────────────────────────────────────────────────────
Device Fingerprint *
[____________________________________________]

Device Name (optional)
[____________________________________________]

The device fingerprint is a 64-character hex string
generated by the mobile app. Ask the employee to
share it from the app's device registration screen.

──────────────────────────────────────────────────────
                        [Cancel]  [Register Device]
```

**Validation:**
- Fingerprint: required, exactly 64 hex characters (`/^[0-9a-f]{64}$/i`)
- Device Name: optional, max 100 chars

**Success:** Toast "Device registered for John Doe. They can now log in."

**Reset Device Modal:**
```
⚠ Reset Device

This will:
• Remove the registered device for John Doe
• Revoke ALL active sessions
• Prevent login until a new device is registered

You will need to register a new device afterwards.

            [Cancel]   [Reset Device]
```

---

### 5.7 Reset Password Flow

**Purpose:** Admin does NOT manually reset employee passwords. The employee uses self-service password reset. This screen is a guided instruction panel, not a form.

**"Reset Password" action** (in Employee Profile quick actions) opens a small modal:

```
Reset Employee Password

To reset John Doe's password:

1. Share this link with John Doe:
   [https://yourapp.com/login]

2. They should click "Forgot Password"
   on the login screen.

3. A reset link will be sent to:
   john@acme.com

Alternatively, you can share their registered
email and they can initiate the reset themselves.

                              [Close]
```

This design avoids giving admins the ability to set employee passwords directly (security decision from R-API-004). The admin portal provides NO "set password" form.

---

## 6. Attendance

### 6.1 Attendance Daily View (`/attendance`)

**Purpose:** Real-time view of today's attendance across all employees. Primary use: see who is currently checked in, who is absent, handle ad-hoc queries.

**Layout:**

```
Attendance                                   Today: Mon, 14 Jun 2026
──────────────────────────────────────────────────────────────────────
[🔍 Search employee...]  [Department ▾]  [Status ▾]    [📅 Jun 14 ]

[Daily]  [Weekly]  [Monthly]                              (tab strip)
──────────────────────────────────────────────────────────────────────
┌───────────────────┬──────────┬──────────┬─────────┬───────────────┐
│  Employee         │  Check In│  Duration│  Status  │  Day Status   │
├───────────────────┼──────────┼──────────┼─────────┼───────────────┤
│  ◉ John Doe       │  09:02   │  5h 32m  │  In      │  —           │
│  ◉ Jane Smith     │  08:55   │  —       │  Out     │  ● Present   │
│  ◉ Raj Patel      │  —       │  —       │  Absent  │  ○ Absent    │
│  ◉ Priya K.       │  —       │  —       │  Leave   │  ◈ Leave     │
└───────────────────┴──────────┴──────────┴─────────┴───────────────┘
│  Showing 1–20 of 45                              ← 1  2  3  →      │
```

**Columns:**

| Column | Data | Notes |
|---|---|---|
| Employee | Name + department | Clickable → `/attendance/employee/[id]` |
| Check In | `checkInTimestamp` formatted as `HH:mm` (IST) | `—` if not checked in |
| Duration | Live elapsed since check-in (browser-computed) | `—` if checked out or absent |
| Live Status | In / Out / Absent / Leave / Holiday | Current real-time state |
| Day Status | Badge for computed day status | Populated after checkout or midnight |

**Date Picker:** Single date picker (defaults to today). When admin picks a past date, shows historical data (no "Duration" column — replaced with "Total Minutes"). Check-in/check-out times shown as actual values.

**Filters:**
- Department: multi-select
- Status: All / Checked In / Checked Out / Absent / On Leave

**No bulk actions** on attendance view (read-only).

**Permissions:** Admin only.

**Loading:** Skeleton table with 20 rows.

**Empty State (holiday/weekend):** "No attendance expected today — [Holiday Name] / Weekend. Historical data shown if date is changed."

---

### 6.2 Weekly View (`/attendance/weekly`)

**Purpose:** View attendance by week across all employees. Grid format showing each employee × day of week.

**Layout:**

```
Attendance                                     Week: 9–14 Jun 2026
──────────────────────────────────────────────────────────────────
[🔍 Search employee...]  [Department ▾]   [← Prev Week]  [Next Week →]

[Daily]  [Weekly]  [Monthly]
──────────────────────────────────────────────────────────────────
┌────────────────┬─────┬─────┬─────┬─────┬─────┬─────┬──────────┐
│  Employee      │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │  Total   │
│                │  9  │ 10  │ 11  │ 12  │ 13  │ 14  │          │
├────────────────┼─────┼─────┼─────┼─────┼─────┼─────┼──────────┤
│  John Doe      │  ✓  │  ✓  │  ✓  │  H  │  ½  │  —  │ 4.5 days │
│  Jane Smith    │  ✓  │  ✓  │  L  │  L  │  ✓  │  —  │ 3 days   │
└────────────────┴─────┴─────┴─────┴─────┴─────┴─────┴──────────┘
```

**Cell legend (small badge with color):**

| Symbol | Meaning | Color |
|---|---|---|
| ✓ | Present | green |
| ½ | Half-day | amber |
| ✗ | Absent | red |
| L | Leave | blue |
| H | Holiday | purple |
| — | Weekend / Non-working | gray |

Cell is clickable → opens a small tooltip/popover with: total minutes, check-in/out times, session count.

**Navigation:** `← Prev Week` / `Next Week →` buttons; URL has `?week=YYYY-Www`.

**No pagination** — all employees shown (virtual scrolling if >50 employees).

---

### 6.3 Monthly View (`/attendance/monthly`)

**Purpose:** Month-level summary showing aggregated stats per employee. Used for payroll preparation review.

**Layout:**

```
Attendance — June 2026                     [← May]   [Jul →]
──────────────────────────────────────────────────────────────
[🔍 Search...]  [Department ▾]                  [Export XLSX ↓]

[Daily]  [Weekly]  [Monthly]
──────────────────────────────────────────────────────────────
┌────────────┬───────┬───────┬───────┬───────┬────────┬──────┐
│  Employee  │Present│ Half  │Absent │ Leave │Holiday │Total │
│            │  Days │  Days │  Days │  Days │  Days  │ Mins │
├────────────┼───────┼───────┼───────┼───────┼────────┼──────┤
│  John Doe  │   18  │    2  │    0  │    1  │   1    │ 9870 │
│  Jane Smith│   16  │    1  │    2  │    2  │   1    │ 8640 │
└────────────┴───────┴───────┴───────┴───────┴────────┴──────┘
```

**Columns:**
- Employee name + ID
- Present Days
- Half Days
- Absent Days
- Leave Days
- Holiday Days
- Total Minutes (formatted as `Xh Ym`)
- Overtime Minutes (optional column, toggle visibility)

**Export:** `GET /reports/attendance/export?yearMonth=YYYY-MM` → triggers download of XLSX.

---

### 6.4 Employee Attendance View (`/attendance/employee/[id]`)

**Purpose:** Deep-dive into one employee's attendance history. Includes session-level detail.

**Layout:**

```
← Attendance / John Doe — Attendance History
──────────────────────────────────────────────────────────────
[📅 01 Jun 2026 — 30 Jun 2026]  [Status ▾]   [Export ↓]

┌────────────┬──────────┬──────────┬──────────┬──────────────┐
│  Date      │ Check In │ Check Out│  Hours   │  Status       │
├────────────┼──────────┼──────────┼──────────┼──────────────┤
│  14 Jun    │  09:02   │  18:15   │  9h 13m  │  ● Present   │
│  13 Jun    │  —       │  —       │  —       │  ◈ Holiday   │
│  12 Jun    │  09:15   │  13:00   │  3h 45m  │  ½ Half-Day  │
└────────────┴──────────┴──────────┴──────────┴──────────────┘
```

Row expansion: clicking a date row expands to show all sessions for that day (for employees with multiple sessions).

**Date range:** defaults to current month. Calendar date picker for custom range (max 31 days).

---

### 6.5 Attendance Corrections

**Purpose:** Attendance corrections are handled through the **Regularization module** (Section 8). No separate "corrections" screen exists — admin approves regularization requests which updates attendance records.

Cross-link: "To correct attendance records, go to [Regularization →]" shown in `/attendance/employee/[id]` header when the date range contains `isRegularized: true` records.

---

## 7. Leave Management

### 7.1 Leave Pending Approvals (`/leave`)

**Purpose:** Primary leave management screen. Default tab shows pending requests requiring action.

**Layout:**

```
Leave Management
──────────────────────────────────────────────────────────────────
[Pending (3)]  [History]  [Balances]                  (tab strip)
──────────────────────────────────────────────────────────────────
[🔍 Search employee...]  [Leave Type ▾]  [Dates ▾]

┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  John Doe · EMP001                  Submitted 3 days ago  │  │
│  │  Paid Leave · 20–22 Jun 2026 (3 days, Full Day)           │  │
│  │  Reason: Annual family vacation                           │  │
│  │  Balance after: 9 days remaining                          │  │
│  │                            [Reject]  [Approve]            │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Jane Smith · EMP002                Submitted 1 day ago   │  │
│  │  Sick Leave · 14 Jun 2026 (1 day, Full Day)               │  │
│  │  Reason: Fever                                            │  │
│  │  Balance after: 7 days remaining                          │  │
│  │                            [Reject]  [Approve]            │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                           [Bulk Approve Selected]│
└─────────────────────────────────────────────────────────────────┘
```

**Card components:**
- Employee name + ID + avatar
- Leave type badge
- Date range + total days + duration (Full Day / Half Day Morning / Half Day Afternoon)
- Reason text (truncated to 2 lines; "Show more" expands)
- Balance after approval (calculated from current balance)
- `[Reject]` (outline) + `[Approve]` (primary) buttons

**Approve Action:**
- Direct click → confirmation modal: "Approve 3 days of paid leave for John Doe (20–22 Jun)?"
- If approved leave overlaps with an active session → confirmation modal includes warning: "⚠ John Doe is currently checked in. Attendance session will be preserved."
- POST → PATCH `/leaves/:id/approve`
- Success: card removed from pending list; toast "Leave approved for John Doe."
- Warning from API → toast.warning displayed after card removal

**Reject Action:**
- Click → small modal with reason textarea (optional, max 500 chars)
- PATCH `/leaves/:id/reject`
- Success: card removed; toast "Leave request rejected."

**Bulk Actions:**
- Checkbox on each card
- Select All checkbox at top
- "Bulk Approve Selected (2)" button; confirmation modal listing all selected
- Bulk reject not provided (rejections should include individual reasons)

**Sort:** Oldest first (FIFO — most urgent first)

**Empty State:** "All caught up! No pending leave requests." with ✓ icon

---

### 7.2 Leave History (`/leave/history`)

**Purpose:** Full audit trail of all leave requests across all statuses and employees.

**Layout:** Standard table.

**Columns:**

| Column | Data |
|---|---|
| Employee | Name + ID |
| Leave Type | Badge (Paid / Sick / Casual / LWP) |
| Dates | `startDate` – `endDate` |
| Days | `totalDays` |
| Duration | Full / Half Day |
| Status | Status badge (pending/approved/rejected/cancelled/revoked) |
| Actioned By | Admin name or `—` |
| Submitted | `createdAt` relative time |
| Actions | `⋮` (View Detail, Revoke if approved) |

**Filters:**
- Employee search
- Leave Type: All / Paid / Sick / Casual / LWP
- Status: All / Pending / Approved / Rejected / Cancelled / Revoked
- Leave Year: dropdown of available years
- Date range: custom date picker

**Revoke Action (from row ⋮ menu):**
- Only available when `status: 'approved'`
- Before opening modal: client checks SWR payroll cache for affected month's finalization status
- Opens one of two modal variants based on result:

**Variant A — Payroll NOT finalized (standard):**
```
⚠ Revoke Approved Leave

Revoke 3 days of Paid Leave for John Doe
(20–22 Jun 2026)?

This will restore 3 days to John Doe's
paid leave balance.

Reason * (required, min 10 chars)
[___________________________________________]

              [Cancel]  [Revoke Leave]
```

**Variant B — Payroll IS finalized (amber warning):**
```
⚠  Revoke Leave — Payroll Already Finalised

  Revoking John Doe's leave (20–22 Jun 2026)
  affects a month with finalised payroll.

  After revoking, you must:
  ┌─────────────────────────────────────────┐
  │  1. Revoke the leave (this action)     │
  │  2. Unfinalize June 2026 payroll       │
  │  3. Recompute June 2026 payroll        │
  │  4. Re-finalize June 2026 payroll      │
  └─────────────────────────────────────────┘

  Reason * (required, min 10 chars)
  [___________________________________________]

  [Cancel]   [Revoke & Open Payroll Workflow]
```

`[Revoke & Open Payroll Workflow]`:
- Submits `PATCH /leaves/:id/revoke`
- On success → navigate to `/payroll/2026-06?action=recompute-required&employee=:id`
- Payroll page renders `PayrollStaleBanner` and `⚠ Stale` badge on affected row
- Standard `[Revoke Leave]` navigates back to leave history with success toast only

**Payroll Stale Banner** (appears on payroll list when `meta.staleEmployeeIds` is non-empty):
```
┌────────────────────────────────────────────────────────────────────┐
│  ⚠  Action Required: Payroll Update Needed                     [×] │
│                                                                    │
│  John Doe's approved leave was revoked after this payroll was     │
│  finalised. The amounts below are outdated.                       │
│                                                                    │
│  To correct: Unfinalize → Recompute → Re-finalize.               │
│  Affected: John Doe (EMP001)         [Unfinalize & Fix →]         │
└────────────────────────────────────────────────────────────────────┘
```
- Color: `bg-amber-50 border border-amber-300`
- `[×]` dismisses for this session; banner reappears on next load until resolved
- `[Unfinalize & Fix →]` opens 3-step `PayrollReopenModal`

**⚠ Stale badge** on payroll list row: amber badge beside Finalised status; tooltip "Leave revoked after finalization. Payroll requires recomputation."

**PayrollReopenModal — 3-step wizard:**
- Step 1: Unfinalize — pre-fills reason "Leave revoked post-finalization"; `PATCH /payroll/:id/:yearMonth/unfinalize`
- Step 2: Recompute — shows what will change (absent days); `POST /payroll/compute` single employee
- Step 3: Review & Re-finalize — shows previous vs updated amount; `PATCH /payroll/:id/:yearMonth/finalize`
- Cannot dismiss mid-flow without explicit Cancel confirmation: "Cancel workflow? Payroll remains unfinalised."
- On completion: banner dismissed, `⚠ Stale` cleared

**Admin Override (skip recompute):** Row `⋮` → "Mark as Reviewed (No Changes)" when `⚠ Stale`. Confirmation → clears stale flag without recomputation. Logged in audit trail as `PAYROLL_STALE_DISMISSED`.

- Reason is required (min 10 chars, validated in Zod)

---

### 7.3 Leave Balances (`/leave/balances`)

**Purpose:** View current leave balances for all employees. Useful for HR before approving requests.

**Layout:** Standard table.

**Columns:**

| Column | Data |
|---|---|
| Employee | Name + ID + department |
| Paid Leave | `currentYear + carriedForward` total; sub-columns on hover |
| Sick Leave | Total remaining |
| Casual Leave | Total remaining |
| LWP Taken | Year-to-date LWP days |
| CF Expiry | Carry-forward expiry date (amber badge if within 30 days) |

**Hover tooltip on balance cell:** Shows `currentYear / carriedForward / total` breakdown.

**Filter:** Department, Employee search

**No pagination** — typically ≤200 employees; all loaded.

**Export:** `GET /reports/leave/export` with current year filter

**Empty State:** "No employees found."

---

## 8. Regularization

### 8.1 Pending Regularizations (`/regularization`)

**Purpose:** Review and action pending regularization requests.

**Layout:**

```
Regularization
──────────────────────────────────────────────────────────────────
[Pending (2)]  [History]                              (tab strip)
──────────────────────────────────────────────────────────────────
[🔍 Search employee...]  [Type ▾]

┌─────────────────────────────────────────────────────────────────┐
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  John Doe · EMP001                  Submitted 1 hour ago  │  │
│  │  Forgot Check-In · 12 Jun 2026                            │  │
│  │  Requested check-in: 09:00                                │  │
│  │  Reason: Left phone at reception, checked in at laptop     │  │
│  │  Attendance on that day: Absent (0 min recorded)          │  │
│  │                            [Reject]  [Approve]            │  │
│  └───────────────────────────────────────────────────────────┘  │
```

**Card components:**
- Employee name + ID
- Regularization type badge: `Forgot Check-In` / `Forgot Check-Out` / `Work Away From Office` / `Official Travel` / `Client Visit`
- Date of regularization
- Requested time(s): check-in and/or check-out
- Reason text
- Current attendance on that day: badge + minutes (if any)
- `[Reject]` (outline) + `[Approve]` (primary)

**Approve Action:**
- Confirmation modal: "Approve regularization for John Doe on 12 Jun?"
- Shows what will change: "Attendance for 12 Jun will be updated to **Present** (calculated from 09:00 to 18:00 = 9h 0m)"
- PATCH `/regularizations/:id/approve`
- Success: card removed; toast "Regularization approved. Attendance updated."

**Reject Action:**
- Small modal with optional reason (max 500 chars)
- PATCH `/regularizations/:id/reject`

**Type Filter:** All / Forgot Check-In / Forgot Check-Out / Work Away / Official Travel / Client Visit

**Sort:** Oldest request first (FIFO)

**Empty State:** "All caught up! No pending regularization requests." with ✓ icon

---

### 8.2 Regularization History (`/regularization/history`)

**Purpose:** Full audit of all regularization requests.

**Columns:**

| Column | Data |
|---|---|
| Employee | Name + ID |
| Type | Type badge |
| Date | Regularization date |
| Status | pending / approved / rejected / withdrawn |
| Requested Time(s) | Check-in / check-out times |
| Actioned By | Admin or `—` |
| Submitted | Relative time |
| Actions | `⋮` (View Detail only — no further actions on history) |

**Filters:** Employee search, Type, Status, Date range

---

## 9. Payroll

### 9.1 Payroll List (`/payroll`)

**Purpose:** Admin views all payroll records, triggers computation, finalizes monthly payroll.

**Layout:**

```
Payroll                                    [Generate Payroll ▾]
──────────────────────────────────────────────────────────────────
[📅 Jun 2026 ▾]   [Status ▾]  [🔍 Search employee...]

┌────────────────┬──────────┬──────────┬─────────┬──────────────┐
│  Employee      │ Working  │  Present │Payable  │  Status      │  Actions
│                │  Days    │   Days   │ Amount  │              │
├────────────────┼──────────┼──────────┼─────────┼──────────────┤
│  John Doe      │   22     │  21.0    │₹47,727  │ ● Draft      │    ⋮
│  Jane Smith    │   22     │  20.5    │₹46,591  │ ✓ Finalised  │    ⋮
└────────────────┴──────────┴──────────┴─────────┴──────────────┘
│  Showing 1–45 of 45       Total Payable: ₹12,45,000            │
│                    [Finalize All Draft]  [Export Month ↓]      │
└─────────────────────────────────────────────────────────────────
```

**Columns:**

| Column | Data | Notes |
|---|---|---|
| Employee | Name + ID | Clickable → `/payroll/[yearMonth]/[id]` |
| Working Days | `effectiveWorkingDays` | Days employee should have worked |
| Present Days | `effectivePresentDays` | Actual (including half-days as 0.5) |
| Payable Amount | `payableAmount` in ₹ | Formatted with Indian number system |
| Status | Draft / Finalised badge | |
| Actions | `⋮` menu | |

**Row Actions (`⋮`):**
- View Payslip
- ──────
- Finalize (if draft)
- Unfinalize (if finalised; with reason required)
- ──────
- Export Payslip (PDF / XLSX)

**Month Selector:** `<Select>` showing last 13 months (current + 12 past). Defaults to current month.

**Bulk Actions:**
- "Finalize All Draft" at bottom — opens confirmation modal listing count of draft payrolls
- Bulk finalize: calls `PATCH /payroll/:id/:yearMonth/finalize` for each draft in sequence

**Footer Summary:** Total payable amount for the month across all employees (sum of payable amounts).

**Generate Payroll button (dropdown):**
- "Compute for All Employees" → triggers bulk compute modal
- "Compute for Specific Employee" → opens employee search modal

---

### 9.2 Generate/Compute Payroll Modal

**Trigger:** `[Generate Payroll ▾]` → `[Compute for All Employees]`

`[Generate Payroll]` button checks `meta.isComputeLocked` from the payroll list SWR data before opening:
- `isComputeLocked: true` → button renders as disabled amber "🔒 Computing…" — modal does not open
- `isComputeLocked: false` → opens modal in State B (Confirmation)

`PayrollComputeModal` is a single `<Dialog>` with a 6-state internal machine. State is `useState` — modal does not close/reopen between states.

**State B — Confirmation:**
```
Generate Payroll for June 2026

  Employees to compute:   43 (Draft)
  Skipped (Finalised):     2
  Total active employees: 45

  ⚠ Existing draft records will be overwritten.
    Finalised records are protected.

  Computation takes 10–30 seconds.
  Keep this tab open during processing.

                   [Cancel]  [Start Computation]
```

`[Start Computation]`: disabled immediately on first click (double-submit guard). No API call yet triggered by button disable — this is a client guard only.

**State C — In Progress:**
```
Computing Payroll for June 2026...

  ⏳ Processing employees...

  This may take up to 30 seconds.
  Please keep this tab open.

  [    Running — Please Wait    ]  ← disabled, spinner
```

Note: `POST /payroll/compute` is a single API call with no progress stream. UI shows indeterminate spinner — no fake progress bar.

**State D — Success:**
```
✓  Payroll Computed

  June 2026 payroll computation complete.

  ✓ Computed:   43
  ⊘ Skipped:     2  (already finalised)
  ✗ Failed:      0

                             [View Payroll →]
```
`[View Payroll →]` closes modal, refreshes payroll list. `[Generate Payroll]` button re-enabled.

**State E — Locked (Concurrency Conflict):**

Triggered when API returns a concurrency conflict (another admin's compute is running):
```
⚠  Computation Already In Progress

  Another admin is computing payroll for
  June 2026. Only one computation can run
  at a time.

  Please wait approximately 30 seconds and
  try again.

                [Close]   [Refresh Status]
```

**PayrollLockBanner** (shown on payroll list page when `meta.isComputeLocked: true`):
```
⚠  Payroll computation for June 2026 is in progress. List will refresh automatically.
```
- SWR `refreshInterval: 10_000` active while banner is visible
- Banner disappears when lock clears; `[Generate Payroll]` button re-enables; toast: "Computation complete."

**State F — Partial Failure:**
```
⚠  Payroll Computed with Errors

  ✓ Computed:   41
  ⊘ Skipped:     2
  ✗ Failed:      2

  Failed employees:
  • Raj Patel (EMP012) — Missing attendance data
  • Sunita Roy (EMP028) — Salary not configured

  Prior records for failed employees unchanged.

  [Dismiss]   [View Affected Employees →]
```
`[View Affected Employees →]` → `/payroll/2026-06?status=error`. Failed rows show `✗ Error` badge; row `⋮` → "Retry Computation" for single-employee retry.

**State G — All Finalised:**

When compute triggered but all employees already finalized:
```
⚠  All Records Already Finalised

  All 45 employees have finalised payroll for
  June 2026. Computation is not available.

  Unfinalize the affected employee(s) first.

  [Find Finalised Records →]         [Close]
```

---

### 9.3 Payslip Detail (`/payroll/[yearMonth]/[id]`)

**Purpose:** Full payslip breakdown for one employee for one month.

**Layout:**

```
← Payroll   /   Jun 2026   /   John Doe
──────────────────────────────────────────────────────────────────
┌────────────────────────────────────────────────────────────────┐
│  John Doe · EMP001                              June 2026      │
│  Engineering · Software Engineer                               │
│  Monthly Salary: ₹50,000        Status: ● Draft               │
├────────────────────────────────────────────────────────────────┤
│  Attendance                    Payroll Calculation             │
│  Working Days:  22             Monthly Salary:  ₹50,000       │
│  Present Days:  21.0           Per Day Rate:   ₹2,272.73      │
│  Half Days:      1             Deductions:    -₹2,272.73      │
│  Leave Days:     0             ─────────────────────────────  │
│  Absent Days:    0             Payable Amount: ₹47,727.27     │
│  LWP Days:       1                                            │
├────────────────────────────────────────────────────────────────┤
│  Computed: 14 Jun 2026 09:00                                  │
│  Finalised: —                                                  │
└────────────────────────────────────────────────────────────────┘
          [← Previous Employee]    [Finalize]   [Export ↓]  [Next Employee →]
```

**Finalize Button:**
- Opens confirmation modal: "Finalize payroll for John Doe (June 2026)? Amount: ₹47,727.27. This will lock this payslip from further changes."
- PATCH `/payroll/:id/:yearMonth/finalize`
- On success: Status badge updates to "Finalised"; Finalize button becomes "Unfinalize"

**Unfinalize Button (when finalised):**
- Opens modal with required reason textarea
- PATCH `/payroll/:id/:yearMonth/unfinalize`
- On success: Status badge updates to "Draft"; recompute becomes available

**Navigation:** `← Previous Employee` / `Next Employee →` cycles through employees in the same month's payroll list.

**Export Dropdown:** PDF / XLSX — triggers file download.

---

### 9.4 Finalize Payroll

**Finalize All Draft:**
- Button at bottom of `/payroll` list page
- Confirmation modal showing count: "Finalize 42 draft payroll records for June 2026?"
- Warning if any employees have warnings (e.g. leave revocation pending)
- On confirm: bulk finalize API calls
- Progress shown as spinner count "Finalizing 42 records..."
- Toast on completion: "42 payroll records finalized for June 2026."

---

### 9.5 Unfinalize Payroll

**Unfinalize** is done per-employee from the Payslip Detail page (9.3) or from the row `⋮` menu on the Payroll List.

**Unfinalize Modal:**
```
⚠ Unfinalize Payroll

Unfinalizing John Doe's June 2026 payroll will:
• Set status back to Draft
• Allow payroll recomputation
• Require re-finalization afterwards

This is typically needed when:
• A leave was revoked after finalization
• Salary was corrected retroactively

Reason * (required for audit trail)
[___________________________________________]
[___________________________________________]

Min 10 characters.

            [Cancel]   [Unfinalize]
```

---

### 9.6 Payroll Conflict Resolution (Post-Revocation Workflow)

Cross-module workflow triggered when a leave is revoked for a month with finalized payroll. Accessed via `PayrollStaleBanner → [Unfinalize & Fix →]` or row `⋮ → Unfinalize` on a `⚠ Stale` row.

**`PayrollReopenModal` — 3-step wizard. Single `<Dialog>`, internal state machine.**

**Step 1 — Unfinalize:**
```
Step 1 of 3 — Unfinalize Payroll

Unfinalize June 2026 payroll for John Doe?

This is required to update payroll after
the leave revocation.

Reason (pre-filled, editable)
[Leave revoked post-finalization__________]

        [Cancel]    [Unfinalize — Step 1]
```
API: `PATCH /payroll/:id/2026-06/unfinalize`. On success → Step 2.

**Step 2 — Recompute:**
```
Step 2 of 3 — Recompute Payroll

John Doe's June 2026 status: Draft ✓

John Doe was absent on 20–22 Jun (leave
revoked). Recompute with updated data?

         [Cancel]    [Recompute — Step 2]
```
API: `POST /payroll/compute` (single employee `{ employeeId, yearMonth }`). On success → Step 3.

**Step 3 — Review & Re-finalize:**
```
Step 3 of 3 — Review & Finalize

June 2026 payroll for John Doe recomputed.

  Previous:  ₹47,727  (finalised 01 Jun)
  Updated:   ₹41,136  (−₹6,591 · 3 absent days)

  [View Full Payslip ↗]    [Finalize Now]
```
`[View Full Payslip ↗]` opens payslip in new tab (modal stays open).
`[Finalize Now]` → `PATCH /payroll/:id/2026-06/finalize`.

**Completion state:**
```
✓  Payroll Updated & Finalised

June 2026 for John Doe corrected and
finalised. Amount: ₹41,136.

                          [Done]
```
`[Done]` → modal closes, stale banner dismissed, `⚠ Stale` badge removed from row.

**Cancel mid-flow confirmation:**
```
Cancel Workflow?

Payroll for John Doe remains unfinalised
until the workflow is completed.

      [Keep Going]    [Cancel Anyway]
```
`[Cancel Anyway]` → closes modal; payroll stays in draft; `⚠ Stale` badge remains.

**Admin Override (no recompute path):**
Row `⋮` → "Mark as Reviewed (No Changes)" when row has `⚠ Stale`:
```
Confirm No Changes Needed

You've reviewed June 2026 payroll for John Doe
and confirmed no payroll changes are required
following the leave revocation.

This will clear the stale indicator without
recomputing payroll.

        [Cancel]   [Confirm — No Changes]
```
Audit trail: `PAYROLL_STALE_DISMISSED`. Stale badge cleared; banner dismissed for this employee.

---

## 10. Reports

### 10.1 Attendance Report (`/reports/attendance`)

**Purpose:** Cross-employee attendance data with filters; preview before download.

**Layout:**

```
Reports
──────────────────────────────────────────────────────────────────
[Attendance]  [Leave]  [Payroll]                      (tab strip)
──────────────────────────────────────────────────────────────────
Filters:
  Date Range *  [01 Jun 2026] — [30 Jun 2026]
  Department    [All Departments ▾]
  Employee      [All Employees ▾]
  Status        [All Statuses ▾]

                               [Generate Report]   [Download XLSX ↓]
──────────────────────────────────────────────────────────────────
(table preview appears after Generate Report is clicked)
──────────────────────────────────────────────────────────────────
┌────────────────┬──────────┬──────────┬─────────┬───────────────┐
│  Date          │ Employee │  Dept    │ Hours   │  Status        │
├────────────────┼──────────┼──────────┼─────────┼───────────────┤
│  14 Jun        │ John Doe │  Eng     │  9h 13m │  ● Present    │
└────────────────┴──────────┴──────────┴─────────┴───────────────┘
Showing 1–50 of 990 records
```

**[Generate Report]** — calls `GET /reports/attendance?...` with filters; renders table preview (max 50 visible rows in preview).

**[Download XLSX]** — calls `GET /reports/attendance/export?...` with same filters; downloads file. No row-count limit in download.

**Date range validation:** Max 90 days for preview; 366 days for export. Zod validation shows inline error: "Maximum date range for preview is 90 days."

---

### 10.2 Leave Report (`/reports/leave`)

**Layout:** Same tab strip as Attendance. Filter set: Employee, Department, Leave Type, Status, Leave Year, Date Range.

**Table columns:** Employee, Leave Type, Dates, Days, Duration, Status, Actioned By.

**[Download XLSX]:** `GET /reports/leave/export?...`

---

### 10.3 Payroll Report (`/reports/payroll`)

**Layout:** Same tab strip. Primary filter: `Year-Month` (required) + Status filter.

**Table columns:** Employee, Working Days, Present Days, Leave Days, LWP Days, Payable Amount, Status.

**Summary row at bottom:** Total payable amount for the month.

**[Download XLSX]:** `GET /reports/payroll/export?yearMonth=YYYY-MM`

---

## 11. Notifications

### 11.1 Notification List (`/notifications`)

**Purpose:** Admin views all their own notifications. System notifications about leave approvals, errors, and actions they performed.

**Layout:**

```
Notifications                         [Mark All as Read]
──────────────────────────────────────────────────────────
[All]  [Unread]                               (tab strip)
──────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────┐
│  ● Leave Approved — John Doe                3 mins ago  │
│    Paid Leave (20–22 Jun 2026) approved by you.         │
│                                                         │
│    Leave Rejected — Jane Smith             1 hour ago   │  (read — no ●)
│    Sick Leave (14 Jun 2026) rejected.                   │
└─────────────────────────────────────────────────────────┘
│  Showing 1–20 of 45                   ← 1  2  3  →      │
```

**Row design:**
- Unread: left blue dot indicator + slightly elevated background
- Read: no dot + flat background
- Clicking row: marks as read + navigates to related entity (e.g. `/leave/history?id=xxx`)
- `relatedEntityId` used for navigation when present

**[Mark All as Read]:** Calls `PATCH /notifications/read-all`. Updates all visible items.

**Tabs:** All / Unread — `?isRead=false` filter applied for Unread tab.

**Pagination:** 20 per page.

**Empty State (Unread tab):** "No unread notifications. You're all caught up!"

---

## 12. Audit Logs

### 12.1 Audit Log List (`/audit-logs`)

**Purpose:** Compliance and investigation tool. Full record of all admin actions.

**Layout:**

```
Audit Logs
──────────────────────────────────────────────────────────────────
[🔍 Search action...]  [Action ▾]  [Entity ▾]  [Employee ▾]
[📅 Date Range: Last 30 days]

┌──────────────┬──────────────────┬──────────────┬─────────────┐
│  Timestamp   │  Action          │  Entity      │  Actor      │  Actions
├──────────────┼──────────────────┼──────────────┼─────────────┤
│  14 Jun 09:05│ LEAVE_APPROVED   │ leaveRequest │ Admin User  │  →
│  14 Jun 09:01│ EMPLOYEE_UPDATED │ Employee     │ Admin User  │  →
│  14 Jun 08:55│ PAYROLL_FINALISED│ payroll      │ Admin User  │  →
└──────────────┴──────────────────┴──────────────┴─────────────┘
│  Showing 1–20 of 1,247                       ← 1  2  3  →    │
```

**Columns:**

| Column | Data | Notes |
|---|---|---|
| Timestamp | `createdAt` formatted `DD MMM HH:mm` (IST) | Tooltip: full ISO timestamp |
| Action | `action` string | Color-coded: creates=green, updates=blue, deletes=red, security=amber |
| Entity | `entityType` + `entityId` (truncated) | |
| Actor | Admin display name | |
| `→` | Link to detail | |

**Filters:**
- Action: dropdown of common action types (LEAVE_APPROVED, PAYROLL_FINALISED, EMPLOYEE_CREATED, etc.)
- Entity type: Employee / Leave / Payroll / Regularization / Settings / Device
- Employee: search by employee (filters where entityId or actorId = employee)
- Date range: default last 30 days; max 90 days

**Row click → `/audit-logs/[id]`**

**No bulk actions** (read-only)

**No export in V1** (audit logs are sensitive; add in V1.1 with access controls)

---

### 12.2 Audit Log Detail (`/audit-logs/[id]`)

**Purpose:** Full detail of one audit event including `before`/`after` snapshots.

**Layout:**

```
← Audit Logs  /  LEAVE_APPROVED  — 14 Jun 2026 09:05

┌────────────────────────────────────────────────────────────────┐
│  Action: LEAVE_APPROVED                                        │
│  Entity: leaveRequest / 6826a1b3c4d5e6f7a8b9c0d1             │
│  Actor:  Admin User (admin@acme.com)                          │
│  Time:   14 Jun 2026 09:05:23 IST                             │
├────────────────────────────────────────────────────────────────┤
│  Before                        After                           │
│  {                             {                               │
│    status: "pending"             status: "approved",           │
│    approvedBy: null              approvedBy: "[id]",           │
│    approvedAt: null              approvedAt: "2026-06-14..."   │
│  }                             }                               │
└────────────────────────────────────────────────────────────────┘
```

`before`/`after` rendered as diff-style code blocks (gray bg, monospace, key-value pairs, changed keys highlighted in amber).

---

## 13. Settings

### 13.1 Settings Navigation

Settings uses a **nested left nav** (secondary sidebar within the settings content area):

```
Settings
─────────────────────────────────────────────────────────────────────
│  ▪ Company            │  (settings content area)                   │
│  ▪ Working Days       │                                            │
│  ▪ Holidays           │                                            │
│  ▪ Leave Config       │                                            │
│  ▪ Geo-Fence          │                                            │
└──────────────────────────────────────────────────────────────────  │
```

Secondary sidebar: 200px wide, `border-r`, within the content area. Clicking a settings section updates the right panel without full page navigation.

---

### 13.2 Company Settings (`/settings`)

**Purpose:** Core platform configuration — company name, timezone, work hours, payroll settings.

**Layout:** Single-page form with sections.

```
Company Settings                                   [Save Changes]
──────────────────────────────────────────────────────────────────
General
  Company Name *                Timezone *
  [Acme Corp________________]   [Asia/Kolkata (IST) ▾]

  Currency                      Payroll Cutoff Day *
  [INR ▾]                       [1 ▾]  (day of month)

Work Hours
  Work Start Time *    Work End Time *    Grace Period
  [09:00]              [18:30]            [30 min ▾]

  Required Daily Hours *   Half-Day Threshold *
  [9h 0m ▾]               [4h 30m ▾]

  Attendance Reminder     Reminder Time
  [✓ Enabled]             [09:30]

Regularization
  Lookback Window *
  [7 days ▾]  (max days in past for regularization requests)

  Checkin Timestamp Window
  [2 minutes ▾]  (server/client clock drift tolerance)

Leave Year
  Leave Year Start Month *
  [January ▾]

──────────────────────────────────────────────────────────────────
                                              [Cancel]  [Save Changes]
```

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Company Name | Text | Yes | Max 100 chars |
| Timezone | Select (IANA zones) | Yes | Valid timezone string |
| Currency | Select (ISO 4217) | Yes | |
| Payroll Cutoff Day | Select (1–28) | Yes | |
| Work Start Time | Time picker (HH:mm) | Yes | < Work End Time |
| Work End Time | Time picker (HH:mm) | Yes | > Work Start Time |
| Grace Period Minutes | Select (0–120) | Yes | |
| Required Daily Minutes | Number → displayed as hours | Yes | > half-day threshold |
| Half-Day Threshold | Number → displayed as hours | Yes | < required daily |
| Attendance Reminder | Toggle | No | |
| Reminder Time | Time picker | No | Required if reminder enabled |
| Lookback Window Days | Select (1–30) | Yes | |
| Checkin Timestamp Window | Select (1–10 min) | Yes | |
| Leave Year Start Month | Select (Jan–Dec) | Yes | |

**Cross-field validation (Zod refine):**
- `halfDayThresholdMinutes < requiredDailyMinutes` — error: "Half-day threshold must be less than required daily hours"
- `workStartTime < workEndTime` — error: "Work start must be before work end time"
- `reminderTime` required when `attendanceReminderEnabled: true`

**Save behavior:**
- `PUT /settings` called with changed fields only
- On `SET_001` from API: field-level inline errors under the cross-field pairs
- On success: toast "Company settings updated."
- `leaveYearStartMonth` change: additional warning modal BEFORE save: "Changing the leave year start month affects all future leave year boundaries. Ensure cron schedules in `vercel.ts` are updated accordingly. Continue?"

---

### 13.3 Working Days (`/settings/working-days`)

**Purpose:** Configure which days of the week are working days.

**Layout:**

```
Working Days
──────────────────────────────────────────────────────────────────
Select the working days for your company:

[✓] Monday      [✓] Tuesday    [✓] Wednesday
[✓] Thursday    [✓] Friday     [ ] Saturday
[ ] Sunday

────────────────────────────────────────────────────────────
GPS & Attendance
  Allow Mock GPS         [ ] Disabled (recommended)
  GPS Accuracy Threshold [100 meters ▾]

                                    [Cancel]  [Save Working Days]
```

**Working Days:** Checkbox group; min 1 day required. Validation: at least 1 day selected.

**Mock GPS Toggle:** If enabled, checkins with `accuracy: 0` are allowed with a flag. If disabled, `ATT_006` returned.

**GPS Accuracy Threshold:** Select from: 50m / 100m / 150m / 200m / unlimited.

**Save:** `PUT /settings` with `workingDays` and `gpsAccuracyThresholdMeters`.

---

### 13.4 Holiday Calendar (`/settings/holidays`)

**Purpose:** Manage public holidays. Holidays affect leave and attendance computation.

**Layout:**

```
Holiday Calendar                    2026 ▾        [+ Add Holiday]
──────────────────────────────────────────────────────────────────
┌───────────────┬──────────────────────────────────────────────┐
│  Date         │  Holiday Name                                │  Actions
├───────────────┼──────────────────────────────────────────────┤
│  26 Jan 2026  │  Republic Day                                │  ✕
│  01 May 2026  │  Maharashtra Day                             │  ✕
│  15 Aug 2026  │  Independence Day                            │  ✕
│  02 Oct 2026  │  Gandhi Jayanti                              │  ✕
└───────────────┴──────────────────────────────────────────────┘
│  18 holidays in 2026                                         │
```

**Year Selector:** Switch between years; `?year=2026` in URL.

**[+ Add Holiday] → small drawer (400px):**
```
Add Holiday                                         [✕]
──────────────────────────────────────────────
Date *
[📅 ____________________]

Holiday Name *
[_________________________________]

Description (optional)
[_________________________________]

──────────────────────────────────────────────
                     [Cancel]  [Add Holiday]
```

**Validation:**
- Date: required; cannot be duplicate (validated server-side → `GEN_006`)
- Name: required; max 100 chars

**Delete (✕ button):** Confirmation modal: "Remove Independence Day (15 Aug 2026)? Attendance and leave records on this date will NOT be automatically updated." → DELETE `/settings/holidays/:id`

**Bulk import (V1.1 roadmap):** Not in V1; admin adds one by one.

---

### 13.5 Leave Configuration (`/settings/leave`)

**Purpose:** Configure leave types, annual allocations, carry-forward rules.

**Layout:**

```
Leave Configuration
──────────────────────────────────────────────────────────────────
Leave Types                                    [+ Add Leave Type]
──────────────────────────────────────────────────────────────────
┌─────────────────────────────────────────────────────────────────┐
│  Paid Leave                                            [Edit]   │
│  Annual Allocation: 15 days                                     │
│  Carry Forward: ✓ Enabled · Max 5 days · Expires in 3 months   │
│  Encashable: ✗ No                                               │
├─────────────────────────────────────────────────────────────────┤
│  Sick Leave                                            [Edit]   │
│  Annual Allocation: 10 days                                     │
│  Carry Forward: ✗ Disabled                                     │
│  Encashable: ✗ No                                               │
├─────────────────────────────────────────────────────────────────┤
│  Casual Leave                                          [Edit]   │
│  Annual Allocation: 5 days                                      │
│  Carry Forward: ✗ Disabled                                     │
│  Encashable: ✗ No                                               │
│                                                                 │
│  LWP (Loss of Pay)                    (built-in, not editable) │
└─────────────────────────────────────────────────────────────────┘
                                              [Save Configuration]
```

**Edit Leave Type (inline expand or small drawer):**
```
Edit: Paid Leave
  Annual Allocation * [15] days
  Carry Forward       [✓] Enabled
    Max Days          [5] days
    Expires After     [3] months
  Encashable          [ ] No
```

**Validation:**
- Annual allocation: 0–365
- Max carry forward days: 0–annual allocation
- Expiry months: 1–12

**Note:** LWP (Loss of Pay) is a built-in type — not editable, not deletable. Always available as a leave type.

**`PUT /settings`** called with `leaveTypes` object on save.

---

### 13.6 Geo-Fence Configuration (`/settings/geofence`)

**Purpose:** Set office location and radius for GPS-based attendance validation.

**Layout:**

```
Geo-Fence Configuration
──────────────────────────────────────────────────────────────────
Attendance Location Check           [✓ Enabled / ○ Disabled]
──────────────────────────────────────────────────────────────────
Office Location

  Latitude *           Longitude *
  [19.0760]            [72.8777]

  Radius *             GPS Accuracy Threshold *
  [200 meters ▾]       [100 meters ▾]

Coordinates Helper
  Enter your office address to find coordinates:
  [_____________________________________________] [Find Coordinates]

  (A static map preview is NOT shown in V1 — coordinates entry only)
──────────────────────────────────────────────────────────────────
⚠ Changing geo-fence settings takes effect immediately for all
  future checkin attempts.
                                   [Cancel]  [Save Geo-Fence]
```

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Enabled | Toggle | — | |
| Latitude | Number input | Yes if enabled | -90 to 90; 6 decimal places |
| Longitude | Number input | Yes if enabled | -180 to 180; 6 decimal places |
| Radius | Select | Yes if enabled | 50 / 100 / 150 / 200 / 300 / 500 m |
| GPS Accuracy Threshold | Select | Yes | 50 / 100 / 150 / 200 / unlimited m |

**Coordinates Helper:** Input for address search (V1: shows message "Use Google Maps to find coordinates for your office address and paste them here."). Full geocoding in V1.1.

**`PUT /settings/geofence`** on save.

**Warning banner** (shown when geo-fence is disabled): "⚠ Geo-fence validation is disabled. Employees can check in from any location."

---

## 14. Accessibility Requirements

### 14.1 Keyboard Navigation

| Requirement | Implementation |
|---|---|
| All interactive elements keyboard-reachable | Radix UI primitives (used by shadcn/ui) ensure this |
| Tab order follows visual order | Avoid `tabindex > 0`; use DOM order |
| Focus visible | Never remove `:focus-visible` outline; use `ring-2 ring-primary` |
| Modal traps focus | Radix Dialog auto-traps focus on open; returns to trigger on close |
| Drawer traps focus | Radix Sheet same behavior |
| Table navigation | `Tab` moves between focusable cells; arrow keys for row navigation (TanStack Table) |
| Dropdown menus | Arrow keys navigate items; `Escape` closes; `Enter` selects |

### 14.2 Screen Reader Support

| Requirement | Implementation |
|---|---|
| Page title updated on navigation | `<title>` via Next.js `metadata` per route |
| Status badges have text alternatives | Badge text IS the label; no icon-only status indicators |
| Action buttons have descriptive labels | "Approve leave for John Doe" not just "Approve" for sr-only versions |
| Form errors announced | `aria-describedby` on inputs pointing to error messages; `role="alert"` on error containers |
| Loading states announced | `aria-busy="true"` on loading regions; `aria-label="Loading..."` |
| Live data updates | Dashboard attendance panel: `aria-live="polite"` on the employee count |
| Table sort state | `aria-sort="ascending|descending|none"` on column headers |
| Required fields | `aria-required="true"` on required inputs |
| Confirmation modals | `role="alertdialog"` for destructive confirmations |

### 14.3 Color & Contrast

| Requirement | Standard |
|---|---|
| Normal text contrast | WCAG AA: ≥ 4.5:1 |
| Large text contrast | WCAG AA: ≥ 3:1 |
| Status badges | Never rely on color alone — always include text label |
| Error states | Red color + error icon + text message (not color-only) |
| Focus indicators | 3:1 contrast against adjacent colors |

Status badges all include text labels (e.g. "● Present", not just a green dot). Color is supplementary.

### 14.4 ARIA Landmarks

```html
<body>
  <nav aria-label="Main navigation">    <!-- sidebar -->
  <header>                              <!-- top bar -->
  <main>                                <!-- page content -->
    <nav aria-label="Breadcrumb">
    <section aria-labelledby="page-title">
```

### 14.5 Responsive Considerations (Desktop-First)

Minimum supported width: **1366px**. At 1366px:
- Sidebar: 240px (fixed)
- Content: 1126px
- Max content column width: `max-w-screen-xl` within content
- Table: horizontal scroll within content area if columns overflow

At 1920px:
- Sidebar: 240px (fixed)
- Content: 1680px
- Dashboard KPI cards: remain 4-column grid
- Tables: column widths expand; `flex-1` columns absorb extra space

### 14.6 Animation & Motion

- All transitions: 150ms ease-out (shadcn/ui defaults)
- `prefers-reduced-motion`: Disable transitions and auto-refresh polling; provide manual refresh button
- No auto-playing videos or GIFs
- Loading skeletons: gentle pulse animation (disabled under `prefers-reduced-motion`)

---

## 15. Error & Edge Case Pages

### 15.1 404 Not Found

File: `app/(admin)/not-found.tsx`. Rendered by Next.js App Router when no route matches.

```
┌──────────────────────────────────────────────────────────────────┐
│  [Full authenticated shell if logged in / AuthShell if not]      │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│              ┌─────────────────────────────────┐               │
│              │        404                      │               │
│              │  Page Not Found                 │               │
│              │                                 │               │
│              │  The page you're looking for    │               │
│              │  doesn't exist or has been      │               │
│              │  moved.                         │               │
│              │                                 │               │
│              │  [← Go to Dashboard]            │               │
│              │  [← Go Back]                    │               │
│              └─────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

- Authenticated: full sidebar shell. Unauthenticated: `AuthShell`.
- `[← Go Back]`: `router.back()` — only shown when `window.history.length > 1`.
- `<title>`: "Page Not Found — WorkForce Pro"

---

### 15.2 500 Server Error

File: `app/(admin)/error.tsx` (route-level) + `app/global-error.tsx` (root-level fallback).

```
│              │  500                            │               │
│              │  Something Went Wrong           │               │
│              │                                 │               │
│              │  An unexpected error occurred.  │               │
│              │                                 │               │
│              │  Error ID: a3f9b2c1             │               │
│              │                                 │               │
│              │  [← Go to Dashboard]            │               │
│              │  [↺ Try Again]                  │               │
```

- **Error ID:** `error.digest` from Next.js error boundary — short hash, never a stack trace.
- `[↺ Try Again]`: calls `reset()` from Next.js error boundary props.
- Full error + stack logged server-side to Vercel logs. Never exposed in UI.
- `global-error.tsx`: minimal HTML shell (in case root layout itself crashed). Same visual design, no sidebar.
- `<title>`: "Error — WorkForce Pro"

---

### 15.3 Maintenance Page

File: `public/maintenance.html` (static HTML — zero dependencies, no React).

Served by Next.js middleware when `process.env.MAINTENANCE_MODE === 'true'`:
```typescript
// middleware.ts
if (process.env.MAINTENANCE_MODE === 'true') {
  return NextResponse.rewrite(new URL('/maintenance.html', request.url));
}
```

```
┌──────────────────────────────────────────────────────────────────┐
│                    ⬡  WorkForce Pro                             │
│                                                                  │
│              ┌─────────────────────────────────┐               │
│              │  🔧  Scheduled Maintenance      │               │
│              │                                 │               │
│              │  WorkForce Pro is temporarily   │               │
│              │  unavailable for maintenance.   │               │
│              │                                 │               │
│              │  Expected back:                 │               │
│              │  14 Jun 2026, 10:00 AM IST      │               │
│              │                                 │               │
│              │  [↺ Refresh Page]               │               │
│              └─────────────────────────────────┘               │
└──────────────────────────────────────────────────────────────────┘
```

- Expected-back time from `MAINTENANCE_END_TIME` env var (ISO string, rendered into HTML at build/deploy).
- Auto-refresh: `<meta http-equiv="refresh" content="30">` in static HTML.
- No JavaScript required — works even if Next.js runtime is down.

---

### 15.4 Unauthorized (No Session)

Not a page — a middleware redirect. No UI needed.

```typescript
// middleware.ts
if (isAdminRoute(pathname) && !hasValidSession(request)) {
  return NextResponse.redirect(
    new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url)
  );
}
```

Admin reaches an authenticated route without a session → instant redirect to `/login?redirect=<path>`. After login, redirected back to original destination.

---

### 15.5 Access Denied (Wrong Role)

File: `app/unauthorized/page.tsx`. Shown when authenticated user has role ≠ `admin` on an admin route.

```typescript
// middleware.ts
if (isAdminRoute(pathname) && jwt?.role !== 'admin') {
  return NextResponse.redirect(new URL('/unauthorized', request.url));
}
```

```
│              │  Access Denied                  │               │
│              │                                 │               │
│              │  You don't have permission to   │               │
│              │  access this page.              │               │
│              │                                 │               │
│              │  This portal is for Company     │               │
│              │  Admins and HR Staff only.      │               │
│              │                                 │               │
│              │  [Contact your administrator]   │               │
│              │  [Sign in with another account] │               │
```

- `[Contact your administrator]`: `mailto:` using `companySettings.adminEmail` (fallback to generic if not set).
- `[Sign in with another account]`: `POST /auth/logout` → clear session → `/login`.
- Rendered in `AuthShell` (no sidebar — user may not be an admin).

---

### 15.6 Middleware Routing Summary

```typescript
// middleware.ts — full guard order
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // 1. Maintenance mode (highest priority)
  if (process.env.MAINTENANCE_MODE === 'true') {
    return NextResponse.rewrite(new URL('/maintenance.html', request.url));
  }

  const jwt = getJwtFromCookie(request); // decode __session cookie

  // 2. Forced password change guard
  if (jwt?.requiresPasswordChange && isAdminRoute(pathname)
      && pathname !== '/change-password') {
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  // 3. Unauthenticated guard
  if (isAdminRoute(pathname) && !jwt) {
    return NextResponse.redirect(
      new URL(`/login?redirect=${encodeURIComponent(pathname)}`, request.url)
    );
  }

  // 4. Role guard
  if (isAdminRoute(pathname) && jwt?.role !== 'admin') {
    return NextResponse.redirect(new URL('/unauthorized', request.url));
  }

  // 5. CSRF guard (SameSite=Strict + Origin validation for cookie-auth routes)
  // Bearer token routes skip this (Flutter mobile)
}
```

---

## Appendix A — Screen Inventory

| # | Screen | Route | Purpose | Added |
|---|---|---|---|---|
| 1 | Login | `/login` | Authentication | R-UI-001 |
| 2 | Forgot Password | `/forgot-password` | Self-service reset request | R-UI-001 |
| 3 | Reset Password | `/reset-password` | Token + new password form | R-UI-001 |
| 4 | Forced Change Password | `/change-password` | Temp-password replacement | R-UI-001 |
| 5 | Session Expired Overlay | Global (overlay) | Non-dismissible re-auth prompt | R-UI-001 |
| 6 | Dashboard | `/dashboard` | Overview | v1.0 |
| 7 | Employee List | `/employees` | Browse/search employees | v1.0 |
| 8 | Create Employee | `/employees` (drawer) | Create new employee | v1.0 |
| 9 | Employee Profile | `/employees/[id]` | View employee detail | v1.0 |
| 10 | Edit Employee | `/employees/[id]/edit` (drawer) | Update employee data | v1.0 |
| 11 | Activate/Deactivate | Modal | Manage employee status | v1.0 |
| 12 | Register Device | Drawer | Register employee device | v1.0 |
| 13 | Reset Device | Modal | Clear registered device | v1.0 |
| 14 | Reset Password Info | Modal | Guide admin on reset path | v1.0 |
| 15 | Attendance Daily | `/attendance` | Today's live attendance | v1.0 |
| 16 | Attendance Weekly | `/attendance/weekly` | Week grid view | v1.0 |
| 17 | Attendance Monthly | `/attendance/monthly` | Month summary | v1.0 |
| 18 | Employee Attendance | `/attendance/employee/[id]` | Individual history | v1.0 |
| 19 | Leave Pending | `/leave` | Pending approvals queue | v1.0 |
| 20 | Leave History | `/leave/history` | All leave records | v1.0 |
| 21 | Leave Balances | `/leave/balances` | Balance summary | v1.0 |
| 22 | Regularization Pending | `/regularization` | Pending queue | v1.0 |
| 23 | Regularization History | `/regularization/history` | All records | v1.0 |
| 24 | Payroll List | `/payroll` | Month payroll overview | v1.0 |
| 25 | Compute Payroll | Modal (6-state) | Trigger computation | R-UI-002 |
| 26 | Payroll Stale Banner | Inline (payroll list) | Post-revocation conflict alert | R-UI-003 |
| 27 | Payroll Reopen Wizard | Modal (3-step) | Unfinalize → Recompute → Re-finalize | R-UI-003 |
| 28 | Payslip Detail | `/payroll/[yearMonth]/[id]` | Single payslip | v1.0 |
| 29 | Finalize Payroll | Modal | Lock payroll | v1.0 |
| 30 | Unfinalize Payroll | Modal | Unlock for correction | v1.0 |
| 31 | Attendance Report | `/reports/attendance` | Report with download | v1.0 |
| 32 | Leave Report | `/reports/leave` | Report with download | v1.0 |
| 33 | Payroll Report | `/reports/payroll` | Report with download | v1.0 |
| 34 | Notifications | `/notifications` | Notification history | v1.0 |
| 35 | Audit Log List | `/audit-logs` | Compliance trail | v1.0 |
| 36 | Audit Log Detail | `/audit-logs/[id]` | Event detail | v1.0 |
| 37 | Company Settings | `/settings` | Core configuration | v1.0 |
| 38 | Working Days | `/settings/working-days` | Day config + GPS | v1.0 |
| 39 | Holiday Calendar | `/settings/holidays` | Holiday management | v1.0 |
| 40 | Leave Configuration | `/settings/leave` | Leave type config | v1.0 |
| 41 | Geo-Fence Config | `/settings/geofence` | Location config | v1.0 |
| 42 | 404 Not Found | `not-found.tsx` | Missing route | R-UI-004 |
| 43 | 500 Server Error | `error.tsx` | Unhandled exception | R-UI-004 |
| 44 | Maintenance | `/maintenance.html` (static) | Scheduled downtime | R-UI-004 |
| 45 | Access Denied | `/unauthorized` | Wrong-role guard | R-UI-004 |

**Total: 45 screens** (was 36; +9 from R-UI-001 and R-UI-004; items 25–27 redesigned from R-UI-002 / R-UI-003)

---

## Appendix B — API Mapping

| Screen | API Calls |
|---|---|
| Dashboard | `GET /attendance/today`, `GET /leaves/pending`, `GET /regularizations/pending`, `GET /reports/attendance?yearMonth` |
| Employee List | `GET /employees` |
| Create Employee | `POST /employees` |
| Employee Profile | `GET /employees/:id`, `GET /attendance/history?employeeId`, `GET /leaves?employeeId`, `GET /payroll?employeeId` |
| Edit Employee | `PUT /employees/:id` |
| Activate/Deactivate | `PATCH /employees/:id/activate`, `PATCH /employees/:id/deactivate` |
| Register Device | `PATCH /employees/:id/register-device` |
| Reset Device | `PATCH /employees/:id/reset-device` |
| Attendance Daily | `GET /attendance/today` |
| Attendance Weekly | `GET /attendance/weekly` |
| Attendance Monthly | `GET /attendance/monthly` |
| Employee Attendance | `GET /attendance/history?employeeId=:id` |
| Leave Pending | `GET /leaves/pending`, `PATCH /leaves/:id/approve`, `PATCH /leaves/:id/reject` |
| Leave History | `GET /leaves`, `PATCH /leaves/:id/revoke` |
| Leave Balances | `GET /leaves/balance?employeeId` (per employee) |
| Reg Pending | `GET /regularizations/pending`, `PATCH /regularizations/:id/approve`, `PATCH /regularizations/:id/reject` |
| Reg History | `GET /regularizations` |
| Payroll List | `GET /payroll`, `POST /payroll/compute`, `PATCH /payroll/:id/:yearMonth/finalize` |
| Payslip Detail | `GET /payroll/:id/:yearMonth`, `PATCH /payroll/:id/:yearMonth/finalize`, `PATCH /payroll/:id/:yearMonth/unfinalize`, `GET /payroll/:id/:yearMonth/export` |
| Reports | `GET /reports/attendance`, `GET /reports/attendance/export`, `GET /reports/leave`, `GET /reports/leave/export`, `GET /reports/payroll/export` |
| Notifications | `GET /notifications`, `PATCH /notifications/read-all` |
| Audit Logs | `GET /audit-logs`, `GET /audit-logs/:id` |
| Settings | `GET /settings`, `PUT /settings`, `PUT /settings/geofence`, `GET /settings/holidays`, `POST /settings/holidays`, `DELETE /settings/holidays/:id` |

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-06-14 | Initial Admin Portal UI/UX Design — 36 screens, all modules |
| v1.1 | 2026-06-14 | R-UI-001: auth screens (Login/ForgotPw/ResetPw/ForcedChange/SessionExpired); R-UI-002: payroll concurrency 6-state modal + lock banner; R-UI-003: leave-payroll conflict UX (stale badge + 3-step reopen wizard); R-UI-004: error pages (404/500/Maintenance/Unauthorized/AccessDenied) + middleware routing summary. Total: 45 screens |
