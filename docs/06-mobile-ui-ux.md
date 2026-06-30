# 06 — Employee Mobile App UI/UX Design
**Workforce Management Platform — Flutter Android App**
Version: 1.0
Date: 2026-06-14
Platform: Flutter · Android-first · FCM · Single Registered Device

---

## Table of Contents

0. [Pre-Authentication Screens](#0-pre-authentication-screens)
1. [Design System](#1-design-system)
2. [Navigation Architecture](#2-navigation-architecture)
3. [Home Dashboard](#3-home-dashboard)
4. [Attendance](#4-attendance)
5. [Leave](#5-leave)
6. [Regularization](#6-regularization)
7. [Notifications](#7-notifications)
8. [Profile](#8-profile)
9. [Device Security UX](#9-device-security-ux)
10. [Offline Strategy](#10-offline-strategy)
11. [Accessibility](#11-accessibility)
12. [Appendix A — Screen Inventory](#appendix-a--screen-inventory)
13. [Appendix B — API Mapping](#appendix-b--api-mapping)

---

## 0. Pre-Authentication Screens

### 0.1 Splash Screen

**Purpose:** App initialization. Check stored tokens, determine routing.

**Layout:**
```
┌────────────────────────────┐
│                            │
│                            │
│         ⬡                 │
│    WorkForce Pro           │
│                            │
│    ████████████ (loading)  │
│                            │
│                            │
└────────────────────────────┘
```

**Logic (no user interaction):**
1. Check `flutter_secure_storage` for `accessToken` + `refreshToken`
2. No tokens → `/login`
3. Tokens found → `POST /auth/refresh`
   - Success + `requiresPasswordChange: false` → `/home`
   - Success + `requiresPasswordChange: true` → `/change-password`
   - Failure (401) → clear tokens → `/login`
4. No network → tokens found → `/home` (offline mode with cached data)
5. No network → no tokens → `/login` (show offline login error on attempt)

**Duration:** Max 2 seconds. No artificial delay.

---

### 0.2 Login Screen (`/login`)

**Purpose:** Employee authenticates with email + password. Device fingerprint sent in body (pre-auth — no Bearer token yet).

**Layout:**
```
┌────────────────────────────┐
│  (status bar)              │
├────────────────────────────┤
│                            │
│       ⬡ WorkForce Pro      │
│          Acme Corp         │
│                            │
│  Email                     │
│  ┌──────────────────────┐  │
│  │ john@acme.com        │  │
│  └──────────────────────┘  │
│                            │
│  Password              [👁]│
│  ┌──────────────────────┐  │
│  │ ••••••••             │  │
│  └──────────────────────┘  │
│                            │
│  [     Sign In     ]       │
│                            │
│  Forgot your password?     │
│                            │
│  v1.0.0 · Build 42         │  ← app version (bottom)
└────────────────────────────┘
```

**Fields:**

| Field | Keyboard | Autocomplete | Required |
|---|---|---|---|
| Email | `TextInputType.emailAddress` | `autofillHints: [AutofillHints.email]` | Yes |
| Password | `TextInputType.visiblePassword`, obscured | `autofillHints: [AutofillHints.password]` | Yes |

**Actions:**
- Password visibility toggle `[👁]` — `IconButton`, `Semantics(label: 'Show/hide password')`
- `[Sign In]` — `ElevatedButton`, full width
- `Forgot your password?` — `TextButton`, navigates to `/forgot-password`

**API call:** `POST /auth/login`
```json
{
  "email": "john@acme.com",
  "password": "••••••••",
  "deviceFingerprint": "<64-char hex stored in SecureStorage>"
}
```
Device fingerprint read from `flutter_secure_storage`. If no fingerprint exists (new install): generate via `SHA-256(deviceId + model + brand + androidId)`, store it, send it. Server registers it on first successful login if no device is registered yet — **or** rejects if a different device is already registered (see Section 9).

**Error States:**

| API Error | UI Display |
|---|---|
| `AUTH_001` / `AUTH_004` | SnackBar error: "Invalid email or password." |
| `AUTH_002` rate limited | SnackBar: "Too many attempts. Try again in 60s." + countdown on button |
| `AUTH_007` inactive | SnackBar: "Account deactivated. Contact your admin." |
| `ATT_003` device mismatch | Navigate to `/device-mismatch` screen (Section 9.2) |
| Network error | SnackBar: "No connection. Check your network." |

**Success flow:**
- `requiresPasswordChange: false` → store tokens → `/home`
- `requiresPasswordChange: true` → store tokens → `/change-password`

**Loading State:** `[Sign In]` button shows `CircularProgressIndicator` inside button, disabled.

---

### 0.3 Forgot Password (`/forgot-password`)

**Purpose:** Employee requests a password reset link via email.

**Layout:**
```
┌────────────────────────────┐
│  ←  Forgot Password        │
├────────────────────────────┤
│                            │
│  Enter your email address  │
│  and we'll send a reset    │
│  link.                     │
│                            │
│  Email                     │
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  [  Send Reset Link  ]     │
│                            │
└────────────────────────────┘
```

**API:** `POST /auth/password-reset/request`

**Success state** (form replaced, same screen):
```
│  ✓  Check Your Email       │
│                            │
│  If an account exists for  │
│  that email, a link has    │
│  been sent. Check inbox    │
│  and spam folder.          │
│  Link expires in 1 hour.   │
│                            │
│  [  Back to Sign In  ]     │
```
Identical message whether email exists or not (no enumeration).

**Error:** `AUTH_002` rate limited → SnackBar: "Too many requests. Wait 1 hour."

---

### 0.4 Reset Password (Deep Link Handler)

**Purpose:** Employee taps reset link in email → app opens via deep link. Handles `worforce://reset-password?token=xxx` or `https://app.acme.com/reset-password?token=xxx`.

**Layout:**
```
┌────────────────────────────┐
│  ←  Set New Password       │
├────────────────────────────┤
│                            │
│  New Password          [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  Confirm Password      [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  ○ At least 8 characters   │
│  ○ One uppercase letter    │
│  ○ One number              │
│                            │
│  [   Update Password   ]   │
│                            │
└────────────────────────────┘
```

**Validation (client-side):**
- Min 8 chars, ≥1 uppercase, ≥1 digit, max 128 chars
- Passwords must match — inline error under confirm field
- Requirements turn green ✓ live as conditions are met

**API:** `POST /auth/password-reset/confirm` with `{ token, newPassword }`

**`AUTH_009` invalid/expired token:** Replace form with:
```
│  ⚠  Link Expired           │
│                             │
│  This reset link has        │
│  expired or been used.      │
│                             │
│  [ Request New Link ]       │
```
`[Request New Link]` → `/forgot-password`.

**Success:** SnackBar "Password updated." → navigate to `/login`.

---

### 0.5 Forced Change Password (`/change-password`)

**Purpose:** `requiresPasswordChange: true` — employee must change temp password before accessing any other screen.

**Layout:**
```
┌────────────────────────────┐
│  WorkForce Pro    [Logout] │  ← No back button; Logout always visible
├────────────────────────────┤
│                            │
│  🔒 Password Change        │
│     Required               │
│                            │
│  Your admin set a          │
│  temporary password.       │
│  Set a new one to          │
│  continue.                 │
│                            │
│  New Password          [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  Confirm Password      [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  ○ At least 8 characters   │
│  ○ One uppercase letter    │
│  ○ One number              │
│                            │
│  [  Update Password  ]     │
│                            │
└────────────────────────────┘
```

**Routing guard:** `GoRouter` `redirect` checks `requiresPasswordChange` from stored JWT claim. Any route except `/change-password` and `/logout` redirects here.

**API:** `PATCH /auth/me/change-password` — no old password field.
Returns fresh `accessToken` with `requiresPasswordChange: false`.

**Success:** Replace token in SecureStorage → SnackBar "Password updated!" → `context.go('/home')`.

**`[Logout]` action:** `POST /auth/logout` → clear SecureStorage → `/login`. Back button disabled via `WillPopScope` (returns `false`).

---

### 0.6 Session Expired Screen

**Purpose:** Refresh token failed or was revoked. Non-navigable — replaces entire screen stack.

**Layout:**
```
┌────────────────────────────┐
│                            │
│         🔒                 │
│                            │
│    Session Expired         │
│                            │
│  Your session has expired  │
│  or was revoked. Please    │
│  sign in again.            │
│                            │
│  [    Sign In Again    ]   │
│                            │
└────────────────────────────┘
```

**Trigger:** Dio interceptor — after `POST /auth/refresh` fails with 401, call `context.go('/session-expired')` which clears the entire navigation stack.

**`[Sign In Again]`:** Clear SecureStorage tokens → `context.go('/login')`.

**Note:** This is a full screen replacement (not a dialog) because Dio interceptor may fire during background operations where no BuildContext dialog is safe to show.

---

### 0.7 Device Not Registered (`/device-not-registered`)

**Trigger:** `POST /auth/login` returns `AUTH_011 NO_DEVICE_REGISTERED` AND `SharedPreferences.hadRegisteredDevice === false`.

**Purpose:** New employee first login — no device registered in admin portal yet. Employee must share fingerprint with admin.

```
┌────────────────────────────┐
│                            │
│         📱                 │
│                            │
│  Device Not Registered     │
│                            │
│  Your device needs to be   │
│  registered before you can │
│  use this app.             │
│                            │
│  Share this code with your │
│  administrator:            │
│                            │
│  ┌──────────────────────┐  │
│  │ a3f9b2c1d4e5f6a7...  │  │
│  │       [Copy Code]    │  │
│  └──────────────────────┘  │
│                            │
│  Steps:                    │
│  1. Copy the code above    │
│  2. Send it to your admin  │
│  3. Ask them to register   │
│     this device            │
│  4. Tap Try Again below    │
│                            │
│  [ I've Notified My Admin ]│  → /device-awaiting-registration
│  [      Try Again        ] │  → /login (retry with fresh credentials)
│                            │
└────────────────────────────┘
```

**Fingerprint display:** First 16 chars + "…" for readability. `[Copy Code]` copies full 64-char hex via `Clipboard.setData()` + SnackBar "Fingerprint copied."

**No credentials stored** on this screen — `[Try Again]` returns to `/login` for security.

---

### 0.8 Device Awaiting Registration (`/device-awaiting-registration`)

**Trigger:** Employee taps `[I've Notified My Admin]` from Screen 0.7.

**Purpose:** Employee has shared fingerprint; waiting for admin to register it in admin portal.

```
┌────────────────────────────┐
│                            │
│         ⏳                 │
│                            │
│  Waiting for Device        │
│  Registration              │
│                            │
│  Your admin needs to enter │
│  your device code in the   │
│  admin portal.             │
│                            │
│  Your device code:         │
│  ┌──────────────────────┐  │
│  │ a3f9b2c1...  [Copy]  │  │
│  └──────────────────────┘  │
│                            │
│  Once registered, tap      │
│  Try Again to sign in.     │
│                            │
│  [       Try Again       ] │  → /login
│  [   Back to Sign In     ] │  → /login
│                            │
└────────────────────────────┘
```

No auto-polling. `[Try Again]` → `/login` (employee re-enters credentials). On `AUTH_011` again → returns to this screen. On success → normal login flow.

**Screen 9.3 (Device Reset Required) updated:** When `AUTH_011` AND `hadRegisteredDevice === true` (prior session existed) → show reset variant with same fingerprint display and "Your admin has reset your device registration" message.

---

## 1. Design System

### 1.1 Technology Stack

| Layer | Choice |
|---|---|
| Framework | Flutter 3.x (stable channel) |
| State management | Riverpod 2.x |
| Navigation | GoRouter |
| HTTP client | Dio (with interceptors for token refresh + device fingerprint injection) |
| Secure storage | `flutter_secure_storage` (tokens, device fingerprint) |
| Local cache | `hive` (offline data) |
| Push notifications | `firebase_messaging` (FCM) |
| Local notifications | `flutter_local_notifications` (foreground FCM display) |
| Permissions | `permission_handler` (location, notifications) |
| Location | `geolocator` |
| Date/time | `intl` package + Dart `DateTime` with IST timezone handling |
| Form validation | `flutter_form_builder` + `form_builder_validators` |
| Deep links | `app_links` |
| Icons | Material Icons (built-in) |

### 1.2 Typography

Base font: **Roboto** (Android system default; no custom font in V1).

| Role | Size | Weight | Flutter Style |
|---|---|---|---|
| App bar title | 20sp | 500 | `titleLarge` |
| Screen heading | 22sp | 700 | `headlineSmall` |
| Section label | 14sp | 600 | `labelLarge` |
| Body / list item | 16sp | 400 | `bodyLarge` |
| Secondary text | 14sp | 400 | `bodyMedium` |
| Caption / badge | 12sp | 400 | `bodySmall` |
| Button label | 14sp | 500 | `labelLarge` |

All sizes in **sp** (scale-independent pixels) — respect user font size settings.

### 1.3 Color System

Material Design 3 color scheme. Seed color: **Blue 600** (`#2563EB` — matches admin portal primary).

```dart
// theme.dart
ColorScheme.fromSeed(
  seedColor: const Color(0xFF2563EB),
  brightness: Brightness.light,
)
```

Custom semantic colors (defined as `ThemeExtension`):

| Token | Hex | Usage |
|---|---|---|
| `colorPresent` | `#16A34A` | Present day, checked-in state |
| `colorAbsent` | `#DC2626` | Absent day, error state |
| `colorLeave` | `#2563EB` | Leave day |
| `colorHalfDay` | `#D97706` | Half-day |
| `colorHoliday` | `#7C3AED` | Holiday |
| `colorWeekend` | `#6B7280` | Weekend / non-working |
| `colorPending` | `#D97706` | Pending approval |
| `colorApproved` | `#16A34A` | Approved status |
| `colorRejected` | `#DC2626` | Rejected status |
| `colorWarning` | `#D97706` | Warning states |
| `colorSurface` | `#F9FAFB` | Card backgrounds |

### 1.4 Status Colors

Used in `Chip`, `Badge`, and status row indicators:

| Status | Background | Text/Icon |
|---|---|---|
| `present` | `green-100` | `green-700` |
| `absent` | `red-100` | `red-700` |
| `half-day` | `amber-100` | `amber-700` |
| `leave` | `blue-100` | `blue-700` |
| `holiday` | `purple-100` | `purple-700` |
| `weekend` | `gray-100` | `gray-500` |
| `pending` | `amber-100` | `amber-700` |
| `approved` | `green-100` | `green-700` |
| `rejected` | `red-100` | `red-700` |
| `checked-in` | `green-100` | `green-700` |

### 1.5 Spacing

8px base grid.

| Token | Value | Use |
|---|---|---|
| `xs` | 4px | Icon-text gap, badge padding |
| `sm` | 8px | Card internal padding (compact) |
| `md` | 16px | Standard card padding, list item padding |
| `lg` | 24px | Section spacing |
| `xl` | 32px | Screen top padding |

### 1.6 Icon System

Material Icons (outlined style for inactive, filled for active states).

| Icon | Usage |
|---|---|
| `home_outlined` / `home` | Home tab |
| `calendar_today_outlined` / `calendar_today` | Attendance tab |
| `beach_access_outlined` / `beach_access` | Leave tab |
| `notifications_outlined` / `notifications` | Notifications tab |
| `person_outlined` / `person` | Profile tab |
| `login` | Check in action |
| `logout` | Check out action |
| `timer` | Running timer |
| `location_on` | GPS / location |
| `location_off` | GPS disabled |
| `gps_not_fixed` | GPS searching |
| `gps_fixed` | GPS acquired |
| `wifi_off` | Offline state |
| `warning_amber` | Warning |
| `check_circle` | Success |
| `error` | Error |
| `phone_android` | Device |
| `lock` | Security / password |
| `add` | Create / apply |

### 1.7 Component Library

| Component | Flutter Widget | Notes |
|---|---|---|
| Primary button | `ElevatedButton` | Full-width in most screens |
| Secondary button | `OutlinedButton` | |
| Text button | `TextButton` | Navigation, secondary actions |
| Status chip | `Chip` with custom colors | Status badges |
| Card | `Card` with `elevation: 0`, border | `shape: RoundedRectangleBorder` |
| List tile | `ListTile` | Standard list items |
| Bottom nav | `NavigationBar` (Material 3) | |
| App bar | `AppBar` | |
| Bottom sheet | `showModalBottomSheet` | Forms, confirmations |
| Date picker | `showDatePicker` (Material 3) | |
| Time picker | `showTimePicker` | Regularization times |
| Snack bar | `ScaffoldMessenger.showSnackBar` | Toast-equivalent |
| Dialog | `AlertDialog` / `showDialog` | Confirmations |
| Refresh | `RefreshIndicator` | Pull-to-refresh on all list screens |
| Shimmer | `shimmer` package | Loading skeletons |

---

## 2. Navigation Architecture

### 2.1 Bottom Navigation

5-tab bottom navigation bar (`NavigationBar` — Material 3):

```
┌────────────────────────────────────────────────────┐
│  🏠        📅        🌿        🔔        👤        │
│  Home   Attendance  Leave  Notifications  Profile  │
└────────────────────────────────────────────────────┘
```

- **Home:** Dashboard with check-in/out
- **Attendance:** Weekly calendar + history
- **Leave:** Balances + history + apply
- **Notifications:** FCM notification history (badge count)
- **Profile:** Personal info + settings + logout

Regularization accessed via:
- FAB `[+]` on the Attendance tab (swipe from weekly view)
- Quick action on Home dashboard

### 2.2 Screen Hierarchy (GoRouter)

```
/ (splash)
/login
/forgot-password
/reset-password
/change-password              ← forced, blocks all other routes
/session-expired

/home                         ← ShellRoute (bottom nav)
  /home                       ← tab 0: dashboard
  /attendance                 ← tab 1
    /attendance/week          ← default weekly view
    /attendance/day/:dateStr  ← daily detail
  /leave                      ← tab 2
    /leave/balance            ← default: balances
    /leave/history            ← history list
    /leave/apply              ← apply form
    /leave/:id                ← leave detail
  /regularization             ← not in bottom nav; pushed on stack
    /regularization/create    ← create form
    /regularization/history   ← history list
    /regularization/:id       ← detail
  /notifications              ← tab 3
    /notifications            ← list
    /notifications/:id        ← detail
  /profile                    ← tab 4
    /profile                  ← view
    /profile/change-password  ← change password
    /profile/device           ← device info

/device-mismatch              ← full-screen, clears stack
/device-reset-required        ← full-screen, clears stack
```

### 2.3 Authentication Flow

```
App start
  → Splash (check tokens)
       No tokens → /login
       Has tokens → POST /auth/refresh
           success, requiresPasswordChange: false → /home
           success, requiresPasswordChange: true  → /change-password
           failure (401) → /session-expired
           failure (network) → /home (offline mode, cached data)

/home (any tab)
  → API call fails with 401
       → Dio interceptor: POST /auth/refresh
           success → retry original request
           failure → /session-expired
  → API call fails with device mismatch
       → /device-mismatch
```

### 2.4 Deep Link Routing (FCM)

| FCM Data Payload | Route |
|---|---|
| `type: 'leave_approved', leaveId: 'xxx'` | `/leave/xxx` |
| `type: 'leave_rejected', leaveId: 'xxx'` | `/leave/xxx` |
| `type: 'reg_approved', regId: 'xxx'` | `/regularization/xxx` |
| `type: 'reg_rejected', regId: 'xxx'` | `/regularization/xxx` |
| `type: 'attendance_reminder'` | `/home` (check-in prompt) |

FCM foreground: `flutter_local_notifications` displays notification. Tap → navigate via GoRouter.
FCM background/terminated: notification shown by OS. Tap → app opens → `getInitialMessage()` → route.

---

## 3. Home Dashboard

### 3.1 Purpose

Primary screen. Shows real-time attendance status, check-in/out action, today's session info, and quick links to leave and regularization.

### 3.2 Layout

```
┌────────────────────────────┐
│  WorkForce Pro    🔔 (3)   │  ← AppBar; bell navigates to /notifications
├────────────────────────────┤
│  Good morning, John!       │  ← Greeting (time-based)
│  Monday, 14 June 2026      │  ← Date in IST
│                            │
│  ┌──────────────────────┐  │
│  │  ● Checked In        │  │  ← Status card
│  │  Since 09:02 AM      │  │
│  │  ──────────────────  │  │
│  │  5h 32m elapsed      │  │  ← Live timer (updates every minute)
│  │  3h 28m remaining    │  │  ← Until required daily hours
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │   [ CHECK OUT ]      │  │  ← Primary action button (full width)
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  Today's Sessions          │
│  ┌──────────────────────┐  │
│  │ In: 09:02 · Out: —   │  │
│  └──────────────────────┘  │
│                            │
│  Quick Actions             │
│  ┌────────┐  ┌────────┐   │
│  │  Apply │  │  New   │   │
│  │  Leave │  │  Reg.  │   │
│  └────────┘  └────────┘   │
│                            │
│  This Month                │
│  Present: 18 · Leave: 1    │
│  Absent: 0 · WFH: 0        │
└────────────────────────────┘
│  🏠   📅   🌿   🔔   👤   │
└────────────────────────────┘
```

### 3.3 Components

**Status Card:**
- Dynamically rendered based on attendance state (see Section 4.1)
- Background: `colorPresent` when checked in; neutral `surface` when not checked in
- `requiresPasswordChange` check via `GET /auth/me` on home load (defensive)

**Greeting:**
- "Good morning" (5–11), "Good afternoon" (12–17), "Good evening" (18+) per IST hour
- Employee `firstName` from stored JWT payload `sub` → `GET /auth/me` response

**Live Timer:**
- `elapsed`: `now − checkInTimestamp`, updates every 60 seconds via `Timer.periodic`
- `remaining`: `requiredDailyMinutes − elapsed` from `companySettings`; turns amber when < 30 min, green when ≥ required
- Timer pauses when app goes to background (`AppLifecycleState.paused`)

**Primary Action Button:**
- Single button; label and color change with state:

| State | Label | Color |
|---|---|---|
| Not checked in | `CHECK IN` | `primary` (blue) |
| Checked in | `CHECK OUT` | `error` (red) |
| GPS loading | `GETTING LOCATION…` | disabled gray |
| API in progress | `[spinner]` | disabled |
| Already checked out | `CHECKED OUT TODAY` | disabled gray + day summary |

**Today's Sessions:**
- List of `AttendanceSession` objects for today
- Each row: `In: HH:mm · Out: HH:mm · Duration` or `In: HH:mm · Out: —` (ongoing)
- Multiple sessions possible if employee checks in/out multiple times

**Quick Actions:**
- 2 buttons: `Apply Leave` → `/leave/apply`; `New Regularization` → `/regularization/create`
- Shown only on working days (hidden on weekends/holidays with note "Today is a non-working day")

**This Month summary:**
- From `GET /attendance/monthly?yearMonth=YYYY-MM` cached data
- 4 counts: Present, Leave, Absent, WFH (WFH = regularized records; shown as 0 if N/A)

### 3.4 Loading State

Skeleton shimmer for: greeting area, status card, action button, today's sessions, quick actions, monthly summary. 6 distinct shimmer blocks. Pull-to-refresh triggers full reload.

### 3.5 Empty/Special States

**Weekend / Holiday:**
```
│  ┌──────────────────────┐  │
│  │  ○ Non-Working Day   │  │
│  │  Independence Day    │  │
│  │  No attendance today │  │
│  └──────────────────────┘  │
│  Check-In not available    │
```

**No active work session expected (daily hours already met):**
```
│  ✓ Daily hours complete    │
│  9h 15m recorded today     │
```
Button disabled: `CHECKED OUT TODAY`.

### 3.6 Error State

**General API failure:** Pull-to-refresh prompt: "Couldn't load data. Pull to retry."

---

## 4. Attendance

### 4.1 Attendance Check-In / Check-Out UX (Critical Path)

The check-in flow is the most critical user journey. Designed as a state machine.

#### State Machine (v2 — with recovery and re-check-in)

**Server reconciliation runs first on every app open and foreground resume.** Server state is always authoritative.

```
APP_OPEN / AppLifecycleState.resumed
  → RECONCILING (GET /attendance/today)
  → server response → correct state:

IDLE (no sessions today, not checked in)
  Button: [CHECK IN] blue · full width
  → tap (button disabled immediately — anti-spam guard)
  → GPS_REQUESTING
       DENIED → GPS_PERMISSION_DENIED
       GRANTED → GPS_ACQUIRING
           accuracy > threshold → GPS_LOW_ACCURACY
           location services off → GPS_DISABLED
           network offline → NETWORK_OFFLINE
           outside geo-fence → OUTSIDE_GEOFENCE
           all pass → CHECKIN_SUBMITTING
               API success → GET /attendance/today → CHECKED_IN
               API failure → error snackbar → IDLE

CHECKED_IN (active session)
  Button: [CHECK OUT] red · full width
  Timer: live elapsed + remaining (from server checkInTimestamp)
  → tap (early checkout warning if remaining > 2h)
  → CHECKOUT_SUBMITTING
       API success → GET /attendance/today
           totalMinutes >= required → CHECKED_OUT_COMPLETE
           totalMinutes <  required → CHECKED_OUT_PARTIAL
       API failure → error snackbar → CHECKED_IN

CHECKED_OUT_PARTIAL (sessions exist, hours incomplete)
  Button: [CHECK IN AGAIN] amber · full width
  Status: ◑ Partial Day · Xh Ym recorded · Yh Zm remaining
  → tap → same GPS flow as IDLE → CHECKIN_SUBMITTING → CHECKED_IN

CHECKED_OUT_COMPLETE (daily hours met or exceeded)
  Button: [DAILY HOURS COMPLETE] disabled gray
  Secondary: [+ Record Extra Hours] outline button (optional overtime)
  Status: ✓ Day Complete · Xh Ym recorded

RECONCILING (transient)
  Button: shimmer placeholder
  Status card: shimmer (max 300ms)
```

#### State Designs

**IDLE State:**
```
┌──────────────────────────┐
│  ○ Not Checked In        │
│  Tap to check in         │
│  ─────────────────────── │
│  Required: 9h 0m today   │
└──────────────────────────┘

[ CHECK IN ]   ← blue ElevatedButton, full width
```

**GPS_REQUESTING:**
```
[ GETTING LOCATION… ]   ← disabled, spinner inside button
```
Runs `Geolocator.requestPermission()` and `Geolocator.getCurrentPosition(desiredAccuracy: LocationAccuracy.high, timeLimit: Duration(seconds: 15))`.

**GPS_ACQUIRING:**
```
[ GETTING LOCATION… ]
  🛰 Acquiring GPS signal…
```

**CHECKIN_SUBMITTING:**
```
[ CHECKING IN… ]   ← disabled spinner
```
API payload:
```json
{
  "latitude": 19.0760,
  "longitude": 72.8777,
  "accuracy": 12.5,
  "nonce": "<UUID v4 generated client-side>",
  "timestamp": "2026-06-14T09:28:00.000Z"
}
```
Headers: `Authorization: Bearer <token>`, `X-Device-Fingerprint: <64-char hex>`.
Nonce stored in Hive — if API call fails and user retries, same nonce resent (idempotency guard server-side).

**CHECKED_IN State:**
```
┌──────────────────────────┐
│  ● Checked In            │
│  Since 09:02 AM          │
│  ─────────────────────── │
│  5h 32m elapsed          │
│  3h 28m remaining        │
└──────────────────────────┘

[ CHECK OUT ]   ← red ElevatedButton
```

**CHECKOUT_SUBMITTING:**
```
[ CHECKING OUT… ]   ← disabled spinner
```

**CHECKED_OUT_PARTIAL State:**
```
┌──────────────────────────┐
│  ◑ Partial Day           │
│  Checked Out · Lunch     │
│  ─────────────────────── │
│  4h 15m recorded         │
│  4h 45m remaining        │
│  🔄 Synced 13:01         │  ← last server sync timestamp
└──────────────────────────┘

[ CHECK IN AGAIN ]  ← amber ElevatedButton

Today's Sessions
┌──────────────────────┐
│ Session 1            │
│ In: 09:02 · Out:13:00│
│ Duration: 3h 58m     │
└──────────────────────┘
```

**CHECKED_OUT_COMPLETE State:**
```
┌──────────────────────────┐
│  ✓ Day Complete          │
│  9h 13m recorded today   │
│  🔄 Synced 18:16         │
└──────────────────────────┘

[ DAILY HOURS COMPLETE ]  ← disabled gray button
[+ Record Extra Hours  ]  ← outline button (rare; opens GPS flow)

Today's Sessions
┌──────────────────────┐
│ Session 1            │
│ In: 09:02 · Out:18:15│
│ Duration: 9h 13m     │
└──────────────────────┘
```

**RECONCILING State (shown for max 300ms on app open/resume):**
```
┌──────────────────────────┐
│  ▪▪▪▪▪▪▪▪▪▪▪▪▪▪          │  ← shimmer status card
│  ▪▪▪▪▪▪▪▪▪▪              │
└──────────────────────────┘
[          ▪▪▪▪          ]  ← shimmer button
```

**Early Checkout Warning** (shown when `CHECKED_IN` and remaining > 2h):
```
┌──────────────────────────────────────┐
│  Checking Out Early?                 │
│                                      │
│  You have 4h 45m remaining today.    │
│                                      │
│  [ Keep Working ]   [ Check Out ]    │
└──────────────────────────────────────┘
```

**"Synced" timestamp** in all status cards reassures employee that displayed state reflects actual server data, not stale local cache.

**State restoration logic:**
```dart
// On GET /attendance/today response:
if (today.isCheckedIn) → CHECKED_IN (timer from today.currentSessionStart)
else if (today.sessions.isNotEmpty) {
  if (today.totalMinutesToday >= settings.requiredDailyMinutes - 30)
    → CHECKED_OUT_COMPLETE
  else
    → CHECKED_OUT_PARTIAL
}
else → IDLE
```

---

#### GPS Error States (Bottom Sheets)

**GPS_PERMISSION_DENIED:**
```
┌──────────────────────────────────────┐
│  Location Permission Required        │
│                                      │
│  This app needs location access to   │
│  verify your workplace for check-in. │
│                                      │
│  [ Open Settings ]   [ Cancel ]      │
└──────────────────────────────────────┘
```
`[Open Settings]` → `openAppSettings()` from `permission_handler`.
If permanently denied: message changes to "Go to Settings → Permissions → Location and select 'Allow while using app'."

---

**GPS_DISABLED:**
```
┌──────────────────────────────────────┐
│  Location Services Disabled          │
│                                      │
│  Enable Location Services in your    │
│  Android settings to check in.       │
│                                      │
│  [ Open Location Settings ]  [ Cancel ]
└──────────────────────────────────────┘
```
`[Open Location Settings]` → `Geolocator.openLocationSettings()`.

---

**GPS_LOW_ACCURACY:**
```
┌──────────────────────────────────────┐
│  Poor GPS Signal                     │
│                                      │
│  GPS accuracy: 180m (need < 100m)    │
│                                      │
│  Try:                                │
│  • Move near a window                │
│  • Enable Wi-Fi for network location │
│  • Wait for GPS signal               │
│                                      │
│  [ Try Again ]       [ Cancel ]      │
└──────────────────────────────────────┘
```
Accuracy value shown dynamically. `[Try Again]` retriggers location acquisition.

---

**OUTSIDE_GEOFENCE:**
```
┌──────────────────────────────────────┐
│  ⚠ Outside Office Location           │
│                                      │
│  You're 450m from the office.        │
│  Check-in is only allowed within     │
│  200m of the office.                 │
│                                      │
│  If you're working remotely, submit  │
│  a regularization request instead.   │
│                                      │
│  [ Try Again ]   [ Regularization ]  │
└──────────────────────────────────────┘
```
Distance shown dynamically (calculated client-side from GPS coords + office coords from `companySettings`). `[Regularization]` → `/regularization/create`.

---

**NETWORK_OFFLINE:**
```
┌──────────────────────────────────────┐
│  No Internet Connection              │
│                                      │
│  Check-in requires an internet       │
│  connection to verify your location. │
│                                      │
│  [ Retry ]            [ Cancel ]     │
└──────────────────────────────────────┘
```

---

### 4.2 Weekly Attendance View (`/attendance/week`)

**Purpose:** Calendar grid showing employee's attendance status for each day of the week. Primary navigation for attendance history.

**Layout:**
```
┌────────────────────────────┐
│  ← Attendance         📋  │
├────────────────────────────┤
│  [← Prev]  Jun 9–14  [Next→]│  ← Week navigator
├────────────────────────────┤
│  Mo  Tu  We  Th  Fr  Sa   │
│  ──  ──  ──  ──  ──  ──   │
│  ✓   ✓   ✓   H   ½   —   │  ← Status symbols
│  9   10  11  12  13  14   │  ← Date numbers
├────────────────────────────┤
│  Week Summary              │
│  Present: 3 · Half: 1      │
│  Leave: 0 · Absent: 0      │
│  Hours: 27h 45m            │
├────────────────────────────┤
│  Daily List                │
│  ┌──────────────────────┐  │
│  │ Mon 9 Jun    ✓ Present│  │
│  │ In: 09:02 · 9h 13m  │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Tue 10 Jun   ✓ Present│  │
│  │ In: 08:55 · 8h 52m  │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Thu 12 Jun  🟣 Holiday│  │
│  │ Independence Day     │  │
│  └──────────────────────┘  │
└────────────────────────────┘
│  🏠   📅   🌿   🔔   👤   │
└────────────────────────────┘
```

**Week grid cells:**

| Symbol | Status | Color | Border |
|---|---|---|---|
| ✓ | Present | green dot | green |
| ½ | Half-day | amber dot | amber |
| ✗ | Absent | red dot | red |
| L | Leave | blue dot | blue |
| H | Holiday | purple dot | purple |
| — | Weekend | gray | none |
| · | Future | none | light gray |

**Tapping a day cell** → navigates to `/attendance/day/:dateStr`.

**Week navigation:**
- `[← Prev]` / `[Next →]` navigate one week back/forward
- `[Next →]` disabled for current week and future weeks
- Current week is default. URL state: `?week=2026-W24`
- "Future" days in current week: cells shown as empty dots (no navigation on tap — future)

**API:** `GET /attendance/weekly?week=2026-W24` or derived from `/attendance/history?startDate=&endDate=`.

**Loading:** Shimmer for week grid + list items.

**Empty State (full week off):** Shows all cells as `—` or `H` appropriately. No special empty state needed.

---

### 4.3 Daily Attendance Detail (`/attendance/day/:dateStr`)

**Purpose:** Full detail of attendance sessions for one specific date.

**Layout:**
```
┌────────────────────────────┐
│  ← Mon, 9 June 2026        │
├────────────────────────────┤
│  ● Present                 │
│  9 hours 13 minutes        │
│                            │
│  Sessions                  │
│  ┌──────────────────────┐  │
│  │ Session 1            │  │
│  │ In:  09:02:14 AM     │  │
│  │ Out: 18:15:30 PM     │  │
│  │ Duration: 9h 13m     │  │
│  └──────────────────────┘  │
│                            │
│  Regularization            │
│  ┌──────────────────────┐  │
│  │ No regularization    │  │
│  │ for this date.       │  │
│  └──────────────────────┘  │
│                            │
│  [  Apply Regularization ] │  ← only shown if date is within lookback window
│                            │
└────────────────────────────┘
```

**Components:**
- Status badge at top (colored chip)
- Total minutes formatted as `Xh Ym`
- Session cards: each with exact timestamps (IST) and duration
- Regularization section: shows existing regularization for this date if any
- `[Apply Regularization]` button: visible only if `date >= today - lookbackWindowDays` (from `companySettings`); navigates to `/regularization/create?date=YYYY-MM-DD`

**Holiday/Weekend:**
- Status shows `Holiday: [name]` or `Weekend`
- No sessions card shown
- No regularization button

**API:** `GET /attendance/history?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` (single-day range).

---

### 4.4 Attendance History (`/attendance/history`)

**Purpose:** Scrollable list of past attendance records, accessible via search or from the weekly view's `📋` icon.

**Layout:**
```
┌────────────────────────────┐
│  ← Attendance History  🔍  │
├────────────────────────────┤
│  [Month: Jun 2026 ▾]       │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ Fri 14 Jun   ● In    │  │
│  │ 09:02 → ongoing      │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Thu 13 Jun  🟣 Holiday│  │
│  │ Independence Day     │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Wed 12 Jun  ½ Half   │  │
│  │ 09:15 → 13:00 · 3h45m│  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

**Month selector:** Dropdown of last 12 months + current. Changes URL `?month=YYYY-MM`.

**List items tappable** → `/attendance/day/:dateStr`.

---

### 4.5 Server State Reconciliation (Cross-Cutting)

`GET /attendance/today` is the single source of truth. Called in these situations:

| Trigger | Call |
|---|---|
| App startup (Splash → Home) | Always |
| `AppLifecycleState.resumed` | Always |
| After `POST /attendance/checkin` success | Verify server accepted |
| After `POST /attendance/checkout` success | Get updated totals |
| Pull-to-refresh on Home | Always |

**`AppLifecycleObserver` (root widget):**
```dart
class AppLifecycleObserver extends StatefulWidget {
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.read(attendanceProvider.notifier).reconcileWithServer();
      ref.read(fcmTokenProvider.notifier).checkForTokenChange(); // R-MOB-003
    }
  }
}
```

**Timer restoration from server data:**
```dart
// When state restores to CHECKED_IN:
final checkInTime = DateTime.parse(today.currentSessionStart).toLocal();
final elapsed = DateTime.now().difference(checkInTime);
// Pass elapsed to timer widget — starts from correct point, not from 0
```

**Required `GET /attendance/today` response fields** (see `docs/06.2-api-gap-analysis.md`):
```typescript
{
  isCheckedIn: boolean;
  currentSessionStart?: string; // ISO timestamp if checked in
  totalMinutesToday: number;    // sum of all session durations today
  sessions: AttendanceSession[]; // all sessions today
}
```

**Pull to refresh.**

**Loading:** Shimmer list (10 items).

**Empty:** "No attendance records for this period."

---

## 5. Leave

### 5.1 Leave Tab Layout

Leave tab defaults to the **Leave Balance** view with a tab row at the top:

```
┌────────────────────────────┐
│  Leave                 [+] │  ← FAB navigates to /leave/apply
├────────────────────────────┤
│  [Balances] [History]      │  ← tab row
├────────────────────────────┤
│  (tab content)             │
└────────────────────────────┘
```

### 5.2 Leave Balances (`/leave/balance`)

**Purpose:** Show remaining leave entitlements for the current leave year.

**Layout:**
```
┌────────────────────────────┐
│  Leave             [Apply]  │
├────────────────────────────┤
│  [Balances] [History]      │
├────────────────────────────┤
│  Leave Year: 2026          │
│                            │
│  ┌──────────────────────┐  │
│  │ 🟢 Paid Leave        │  │
│  │ 12 days remaining    │  │
│  │ 3 days carried over  │  │
│  │ CF expires: Mar 2027 │  │  ← amber if within 30 days
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ 🔵 Sick Leave        │  │
│  │ 8 days remaining     │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ 🟡 Casual Leave      │  │
│  │ 3 days remaining     │  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ ⚪ LWP (Loss of Pay) │  │
│  │ Unlimited · deducted │  │
│  │ from salary          │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

**API:** `GET /leaves/balance`

**CF Expiry badge:** Amber `Chip` when `cfExpiryDate` is within 30 days. Red when already expired.

**Loading:** 4 shimmer cards.

**Error:** "Couldn't load balances. Pull to retry."

---

### 5.3 Leave History (`/leave/history`)

**Purpose:** List of all leave requests with status.

**Layout:**
```
┌────────────────────────────┐
│  Leave             [Apply]  │
├────────────────────────────┤
│  [Balances] [History]      │
├────────────────────────────┤
│  [Status: All ▾]           │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ Paid Leave           │  │
│  │ 20–22 Jun 2026 · 3d  │  │
│  │ Full Day             │  │
│  │         🟡 Pending   │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Sick Leave           │  │
│  │ 05 Jun 2026 · 1d     │  │
│  │ Full Day             │  │
│  │         🟢 Approved  │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

**Filter:** `[Status ▾]` dropdown: All / Pending / Approved / Rejected / Cancelled / Revoked.

**Tap → `/leave/:id` (Leave Detail).**

**Pull to refresh.**

**Empty State:**
```
│       🌿                   │
│  No leave requests yet.    │
│  [ Apply for Leave ]       │
```

---

### 5.4 Apply Leave (`/leave/apply`)

**Purpose:** Employee submits a new leave request.

**Layout:**
```
┌────────────────────────────┐
│  ← Apply Leave             │
├────────────────────────────┤
│  Leave Type *              │
│  ○ Paid Leave  (12 days)   │
│  ○ Sick Leave   (8 days)   │
│  ○ Casual Leave (3 days)   │
│  ○ LWP                     │
│                            │
│  Duration *                │
│  ○ Full Day                │
│  ● Half Day                │
│    ○ Morning Half          │
│    ○ Afternoon Half        │
│                            │
│  Start Date *              │
│  ┌──────────────────────┐  │
│  │ 20 June 2026    [📅] │  │
│  └──────────────────────┘  │
│                            │
│  End Date *                │
│  ┌──────────────────────┐  │
│  │ 22 June 2026    [📅] │  │
│  └──────────────────────┘  │
│  (hidden when Half Day)    │
│                            │
│  Days: 3 working days      │  ← calculated live, excludes weekends/holidays
│  Balance after: 9 days     │  ← calculated live from current balance
│                            │
│  Reason *                  │
│  ┌──────────────────────┐  │
│  │                      │  │
│  │                      │  │
│  └──────────────────────┘  │
│  Max 500 characters        │
│                            │
│  [    Submit Request   ]   │
│                            │
└────────────────────────────┘
```

**Fields:**

| Field | Type | Required | Validation |
|---|---|---|---|
| Leave Type | Radio group | Yes | One of: paid/sick/casual/lwp |
| Duration | Radio (Full / Half Day) | Yes | — |
| Half Day Period | Radio (Morning / Afternoon) | If Half Day | — |
| Start Date | Date picker | Yes | ≥ tomorrow for new requests; within leave year |
| End Date | Date picker | Yes if Full Day | ≥ Start Date; hidden for Half Day |
| Reason | Multi-line text | Yes | Min 3 chars, max 500 chars |

**Live calculations:**
- `Days` count: computed excluding weekends + holidays (fetched from cached holiday list)
- `Balance after`: `currentBalance − requestedDays`; shown red if balance would go negative (LWP still allowed)

**Half Day behavior:**
- End Date field hidden when Half Day selected
- Duration shows "0.5 days"
- Balance shows "−0.5"

**Leave type radio items:**
- Show remaining balance inline: "Paid Leave (12 days remaining)"
- LWP shows "Unlimited (deducted from salary)" — no balance check

**Validation errors:**

| Error | Display |
|---|---|
| Start date in past | "Leave start date must be today or future." (inline below field) |
| End date before start | "End date must be on or after start date." |
| Insufficient balance | "Insufficient balance. 3 days requested, 1 day remaining." (inline warning — does not block for LWP) |
| Overlap with existing leave | `LVE_004` from API — SnackBar: "You already have approved leave on these dates." |
| Reason too short | "Reason must be at least 3 characters." |

**API:** `POST /leaves`

**Loading State:** Submit button shows spinner, disabled.

**Success:** SnackBar "Leave request submitted." → navigate back to `/leave/history`.

**Error States:**
- `LVE_001` insufficient balance → SnackBar: "Insufficient leave balance."
- `LVE_004` overlap → SnackBar: "Leave already exists for these dates."
- Other → SnackBar: API error message

---

### 5.5 Leave Detail (`/leave/:id`)

**Purpose:** Full detail of a leave request. View status, reason, admin notes.

**Layout:**
```
┌────────────────────────────┐
│  ← Leave Request           │
├────────────────────────────┤
│  Paid Leave                │
│  🟡 Pending Approval       │
│                            │
│  Dates                     │
│  20 Jun – 22 Jun 2026      │
│  3 working days · Full Day │
│                            │
│  Reason                    │
│  Annual family vacation    │
│                            │
│  Submitted                 │
│  12 Jun 2026, 10:15 AM     │
│                            │
│  ─────────────────────── │
│                            │
│  Balance Impact            │
│  Paid Leave: 12 → 9 days   │
│  (if approved)             │
│                            │
│  ─────────────────────── │
│                            │
│  [  Cancel Request  ]      │  ← only if status = pending
│                            │
└────────────────────────────┘
```

**Cancel Request:**
- Only shown when `status: 'pending'`
- Confirmation dialog: "Cancel this leave request? This cannot be undone."
- `DELETE /leaves/:id` (or `PATCH /leaves/:id/cancel`)
- On success: SnackBar "Request cancelled." → navigate back to history

**Status → Approved:**
```
│  Admin Notes               │
│  Approved. Enjoy your      │
│  vacation!                 │
│                            │
│  Approved by: Admin User   │
│  Approved on: 13 Jun 2026  │
```
No cancel button when approved.

**Status → Rejected:**
```
│  🔴 Rejected               │
│                            │
│  Admin Notes               │
│  Conflict with project     │
│  deadline. Please rebook.  │
```

**Status → Revoked (post-approval):**
```
│  🟠 Revoked                │
│                            │
│  This approved leave was   │
│  revoked by your admin.    │
│  Contact HR for details.   │
```

---

## 6. Regularization

### 6.1 Create Regularization (`/regularization/create`)

**Purpose:** Employee submits a regularization request for a past attendance date.

**Layout:**
```
┌────────────────────────────┐
│  ← New Regularization      │
├────────────────────────────┤
│  Date *                    │
│  ┌──────────────────────┐  │
│  │ 12 June 2026    [📅] │  │
│  └──────────────────────┘  │
│  (max: today; min: today − lookbackDays)
│                            │
│  Attendance on this date:  │
│  ○ Absent (0 min recorded) │  ← fetched when date selected
│                            │
│  Type *                    │
│  ○ Forgot Check-In         │
│  ○ Forgot Check-Out        │
│  ○ Work Away From Office   │
│  ○ Client Visit            │
│  ○ Official Travel         │
│  ○ Management Duty         │
│                            │
│  Check-In Time *           │  ← shown for relevant types
│  ┌──────────────────────┐  │
│  │ 09:00 AM        [🕐] │  │
│  └──────────────────────┘  │
│                            │
│  Check-Out Time *          │  ← shown for relevant types
│  ┌──────────────────────┐  │
│  │ 06:00 PM        [🕐] │  │
│  └──────────────────────┘  │
│                            │
│  Reason *                  │
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  [    Submit Request   ]   │
└────────────────────────────┘
```

**Fields:**

| Field | Required | Condition | Validation |
|---|---|---|---|
| Date | Yes | Always | Within lookback window; cannot be future; cannot be a holiday or weekend |
| Type | Yes | Always | One of 6 types |
| Check-In Time | Yes | Forgot Check-In, Work Away, Client Visit, Official Travel, Management Duty | < Check-Out Time |
| Check-Out Time | Yes | Forgot Check-Out, Work Away, Client Visit, Official Travel, Management Duty | > Check-In Time |
| Reason | Yes | Always | Min 10 chars, max 500 chars |

**Field visibility by type:**

| Type | Check-In Field | Check-Out Field |
|---|---|---|
| Forgot Check-In | Shown (required) | Hidden |
| Forgot Check-Out | Hidden | Shown (required) |
| Work Away From Office | Shown | Shown |
| Client Visit | Shown | Shown |
| Official Travel | Shown | Shown |
| Management Duty | Shown | Shown |

**When date is selected:** Fetch attendance for that date (`GET /attendance/history?startDate=&endDate=`). Show preview: "Attendance on this date: Absent (0 min)" or "Present (4h 30m recorded)". Helps employee understand what they're correcting.

**Validation errors:**
- Date outside lookback window: "Regularization can only be submitted for the last N days." (inline)
- Check-in time >= check-out time: "Check-in must be before check-out." (inline)
- Weekend / holiday date: "Cannot submit regularization for weekends or holidays." (inline)
- Existing pending regularization for same date: `REG_002` from API → SnackBar: "You already have a pending regularization for this date."

**API:** `POST /regularizations`

**Success:** SnackBar "Regularization submitted." → `/regularization/history`.

---

### 6.2 Regularization History (`/regularization/history`)

**Layout:**
```
┌────────────────────────────┐
│  ← Regularizations    [+]  │
├────────────────────────────┤
│  [Status: All ▾]           │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ Forgot Check-In      │  │
│  │ 12 Jun 2026          │  │
│  │ Requested: 09:00 AM  │  │
│  │         🟡 Pending   │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ Work Away From Office│  │
│  │ 05 Jun 2026          │  │
│  │ 09:00 – 18:00        │  │
│  │         🟢 Approved  │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

**[+] FAB:** `/regularization/create`

**Tap → `/regularization/:id`**

**Empty State:**
```
│       📋                   │
│  No regularization         │
│  requests yet.             │
│  [ New Request ]           │
```

---

### 6.3 Regularization Detail (`/regularization/:id`)

**Layout:**
```
┌────────────────────────────┐
│  ← Regularization          │
├────────────────────────────┤
│  Work Away From Office     │
│  🟡 Pending Approval       │
│                            │
│  Date: 12 Jun 2026         │
│  Check-In: 09:00 AM        │
│  Check-Out: 06:00 PM       │
│                            │
│  Reason                    │
│  Client meeting in Pune,   │
│  worked from client office │
│                            │
│  Submitted: 13 Jun 10:15   │
│                            │
│  [ Withdraw Request ]      │  ← only if pending
└────────────────────────────┘
```

**Withdraw:** Confirmation dialog → `DELETE /regularizations/:id`. Only available while `status: 'pending'`.

**Approved:**
```
│  🟢 Approved               │
│  Approved by: Admin User   │
│  12 Jun 2026 attendance    │
│  updated to Present.       │
```

**Rejected:**
```
│  🔴 Rejected               │
│  Admin notes: Could not    │
│  verify client visit.      │
```

---

## 7. Notifications

### 7.1 Notification List (`/notifications`)

**Purpose:** History of all push notifications and system events for this employee.

**Layout:**
```
┌────────────────────────────┐
│  Notifications  [Mark All]  │
├────────────────────────────┤
│  ┌──────────────────────┐  │
│  │ ●  Leave Approved    │  │  ← unread: filled dot
│  │ Paid Leave (20–22    │  │
│  │ Jun) has been        │  │
│  │ approved.      3m ago│  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │    Leave Rejected    │  │  ← read: no dot, lighter bg
│  │ Sick Leave (5 Jun)   │  │
│  │ was rejected.    2h  │  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ ●  Reminder          │  │
│  │ Don't forget to      │  │
│  │ check in today.  9am │  │
│  └──────────────────────┘  │
└────────────────────────────┘
│  🏠   📅   🌿   🔔   👤   │
└────────────────────────────┘
```

**Unread indicator:** Blue `●` dot (8px) on left of unread items. Row background slightly elevated.

**`[Mark All]`:** `PATCH /notifications/read-all` → clears all `●` dots.

**Tap notification:**
- Mark as read (`PATCH /notifications/:id/read`)
- Navigate via FCM deep link routing (Section 2.4):
  - Leave notifications → `/leave/:id`
  - Regularization notifications → `/regularization/:id`
  - Attendance reminder → `/home`
  - Generic → `/notifications/:id`

**Bottom nav badge:** Shows unread count. Fetched from `meta.total` of unread notifications query. Updated on `AppLifecycleState.resumed`.

**Pull to refresh.**

**Empty State:**
```
│       🔔                   │
│  No notifications yet.     │
```

**Loading:** 5 shimmer list items.

---

### 7.2 Notification Detail (`/notifications/:id`)

**Purpose:** Full notification content for longer messages.

**Layout:**
```
┌────────────────────────────┐
│  ← Notification            │
├────────────────────────────┤
│  Leave Approved            │
│  14 Jun 2026, 09:05 AM     │
│                            │
│  Your Paid Leave request   │
│  for 20–22 Jun 2026 (3     │
│  days) has been approved.  │
│                            │
│  [ View Leave Details ]    │
│                            │
└────────────────────────────┘
```

`[View Leave Details]` → navigates to related entity if `relatedEntityId` exists.

---

### 7.3 FCM Notification UX by Type

**Leave Approved:**
- FCM title: "Leave Approved ✓"
- FCM body: "Your [type] leave (dates) has been approved."
- Tap → `/leave/:leaveId`
- In-app: notification list item with green status chip

**Leave Rejected:**
- FCM title: "Leave Rejected"
- FCM body: "Your [type] leave request was not approved."
- Tap → `/leave/:leaveId`

**Regularization Approved:**
- FCM title: "Regularization Approved ✓"
- FCM body: "Your regularization for [date] has been approved. Attendance updated."
- Tap → `/regularization/:regId`

**Regularization Rejected:**
- FCM title: "Regularization Rejected"
- FCM body: "Your regularization request for [date] was not approved."
- Tap → `/regularization/:regId`

**Attendance Reminder:**
- FCM title: "Don't forget to check in!"
- FCM body: "You haven't checked in yet today."
- Tap → `/home` (check-in prompt visible)
- Only sent if employee has not checked in by `companySettings.reminderTime`
- Scheduled via Vercel cron; sent only on working days

---

### 7.4 FCM Token Lifecycle

FCM token must be sent to server after login and refreshed whenever it changes.

**Registration (after login success):**
```dart
// Step 1: Show rationale screen (first time only)
if (!prefs.getBool('notificationPermissionRequested', false)) {
  await Navigator.push(context, NotificationPermissionScreen());
}

// Step 2: Get token (if permission granted)
final settings = await FirebaseMessaging.instance.requestPermission();
if (settings.authorizationStatus == AuthorizationStatus.authorized) {
  final token = await FirebaseMessaging.instance.getToken();
  if (token != null) {
    await api.updateFcmToken(token);          // PATCH /auth/me/fcm-token
    prefs.setString('lastFcmToken', token);
  }
}
prefs.setBool('notificationPermissionRequested', true);
```

**Token refresh listener (root widget init):**
```dart
FirebaseMessaging.instance.onTokenRefresh.listen((newToken) async {
  await api.updateFcmToken(newToken);
  prefs.setString('lastFcmToken', newToken);
});
```

**On app foreground (`AppLifecycleState.resumed`):**
```dart
final stored = prefs.getString('lastFcmToken');
final current = await FirebaseMessaging.instance.getToken();
if (current != null && current != stored) {
  await api.updateFcmToken(current);
  prefs.setString('lastFcmToken', current);
}
```

**On logout:**
```dart
await api.updateFcmToken(null);  // PATCH /auth/me/fcm-token { fcmToken: null }
prefs.remove('lastFcmToken');
// then POST /auth/logout
```

**Notification Permission Rationale Screen (one-time, after first login):**
```
┌────────────────────────────┐
│                            │
│         🔔                 │
│                            │
│  Stay Updated on Leave     │
│  & Attendance              │
│                            │
│  Enable notifications to   │
│  receive:                  │
│  • Leave approval results  │
│  • Attendance reminders    │
│  • Regularization updates  │
│                            │
│  [ Enable Notifications ]  │  → system permission dialog
│  [      Not Now          ] │  → skip; available via Profile → Settings
│                            │
└────────────────────────────┘
```

Shown only once (`notificationPermissionRequested` flag). Not shown again even if denied.

**Permission Denied — Profile indicator:**
Profile screen shows in Account section:
```
│ 🔕 Notifications: Disabled  │
│    [Enable in Settings →]   │
```
`[Enable in Settings]` → `openAppSettings()`. No persistent app-wide banner.

**API dependency:** `PATCH /auth/me/fcm-token` — see `docs/06.2-api-gap-analysis.md`.

---

## 8. Profile

### 8.1 Profile View (`/profile`)

**Purpose:** Employee views personal information and accesses account settings.

**Layout:**
```
┌────────────────────────────┐
│  Profile                   │
├────────────────────────────┤
│         ○                  │
│      John Doe              │
│      EMP001                │
│    john@acme.com           │
│                            │
│  ┌──────────────────────┐  │
│  │ Department: Eng      │  │
│  │ Designation: SWE     │  │
│  │ Joined: 01 Jan 2025  │  │
│  │ Role: Employee       │  │
│  └──────────────────────┘  │
│                            │
│  Account                   │
│  ┌──────────────────────┐  │
│  │ 🔒 Change Password  ›│  │
│  └──────────────────────┘  │
│  ┌──────────────────────┐  │
│  │ 📱 Device Info      ›│  │
│  └──────────────────────┘  │
│                            │
│  ┌──────────────────────┐  │
│  │ 🚪 Sign Out          │  │
│  └──────────────────────┘  │
│                            │
└────────────────────────────┘
│  🏠   📅   🌿   🔔   👤   │
└────────────────────────────┘
```

**Avatar:** Circle with initials (first letter of first + last name). No photo upload in V1.

**Data source:** `GET /auth/me` (employee's own profile).

**[Sign Out]:**
- Confirmation dialog: "Sign out? You'll need to sign in again on this device."
- `POST /auth/logout` → clear SecureStorage (tokens + nonce) → `context.go('/login')`
- Device fingerprint retained (don't clear — employee may log back in on same device)

**Pull to refresh** on profile data.

---

### 8.2 Change Password (`/profile/change-password`)

**Purpose:** Employee changes their own password while logged in.

**Layout:**
```
┌────────────────────────────┐
│  ← Change Password         │
├────────────────────────────┤
│                            │
│  Current Password      [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  New Password          [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  Confirm Password      [👁]│
│  ┌──────────────────────┐  │
│  │                      │  │
│  └──────────────────────┘  │
│                            │
│  ○ At least 8 characters   │
│  ○ One uppercase letter    │
│  ○ One number              │
│                            │
│  [   Update Password   ]   │
│                            │
└────────────────────────────┘
```

**Fields:** Current Password (required), New Password (required, same rules), Confirm Password (must match New).

**API:** `PATCH /auth/me/change-password` — returns fresh `accessToken`.

**Note:** This endpoint does require current password (as opposed to `/change-password` forced screen which does not — employee is re-authenticated at this point).

Wait — actually from the API spec, `PATCH /auth/me/change-password` may or may not require current password. From the approved API spec context: the change-password endpoint in forced mode doesn't need old password (temp password already verified at login). For voluntary change (from Profile), it SHOULD require current password for security. Check API spec.

Based on approved API: `PATCH /auth/me/change-password` — the spec says "no old password required" for forced change. For voluntary change from profile, the same endpoint is used but we should include current password for security. This is a note for implementation: if the API doesn't support current password verification, omit the field and document the security decision.

**Implementation note:** If API does not verify current password (single endpoint for both forced and voluntary change), omit "Current Password" field and document that this is a known security gap (MEDIUM finding in review doc). For V1, show only New Password + Confirm.

**Success:** SnackBar "Password changed. Other sessions logged out." Replace stored `accessToken`. Navigate back to Profile.

**Error:** `AUTH_001` wrong current password → inline error under Current Password field: "Incorrect current password."

---

### 8.3 Device Information (`/profile/device`)

**Purpose:** Employee can see their registered device info. No editing allowed — device management is admin-only.

**Layout:**
```
┌────────────────────────────┐
│  ← Device Information      │
├────────────────────────────┤
│                            │
│  📱 This Device            │
│  ┌──────────────────────┐  │
│  │ Status: Registered ✓ │  │
│  │                      │  │
│  │ Model: Samsung S24   │  │
│  │ Android: 15          │  │
│  │ App: v1.0.0 (42)     │  │
│  └──────────────────────┘  │
│                            │
│  About Device Security     │
│                            │
│  Only one device can be    │
│  registered per account.   │
│  Contact your admin to     │
│  change your registered    │
│  device.                   │
│                            │
└────────────────────────────┘
```

**Status variants:**
- `Registered ✓` (green) — device fingerprint on server matches this device
- `Not Registered` (amber) — no device registered (shouldn't happen post-login; log this state)

**Device info:** Populated from Flutter's `device_info_plus` package (model, Android version, app version from `package_info_plus`).

**No API call** on this screen — purely informational, device fingerprint comparison happened at login.

---

## 9. Device Security UX

### 9.1 Device Registered (Normal Flow)

Device fingerprint generated at first install via:
```dart
// Computed once, stored in SecureStorage
final fingerprint = sha256
  .convert(utf8.encode('$deviceId$model$brand$androidId'))
  .toString(); // 64-char hex
```

Sent in:
- `POST /auth/login` body: `deviceFingerprint` field
- All authenticated API calls: `X-Device-Fingerprint` header (injected by Dio interceptor)

No user-visible UX for this state — it is transparent.

---

### 9.2 Device Mismatch Screen (`/device-mismatch`)

**Trigger:** `POST /auth/login` returns `ATT_003` DEVICE_MISMATCH — server's registered device hash does not match the fingerprint sent.

**Purpose:** This device is not the registered device. Employee cannot log in.

**Layout:**
```
┌────────────────────────────┐
│                            │
│         ⚠                  │
│                            │
│  Device Not Recognized     │
│                            │
│  This device is not the    │
│  registered device for     │
│  your account.             │
│                            │
│  Only one device can be    │
│  registered per account.   │
│                            │
│  To log in:                │
│  Contact your admin to     │
│  reset your registered     │
│  device, then try again.   │
│                            │
│  [ Try Again ]             │
│  [ Contact Admin ]         │
│                            │
└────────────────────────────┘
```

**No back stack** — `context.go('/device-mismatch')` replaces stack.

**`[Try Again]`:** Navigate to `/login` (employee may have logged into wrong account).

**`[Contact Admin]`:** `mailto:` with company admin email from cached `companySettings.adminEmail`, pre-filled subject: "Device registration issue — [employee name]".

---

### 9.3 Device Reset Required Screen (`/device-reset-required`)

**Trigger:** Server returns a device-reset state after admin resets the device (existing session invalidated; next API call returns specific error). Distinct from mismatch — employee's device WAS registered but admin reset it.

**Layout:**
```
┌────────────────────────────┐
│                            │
│         🔄                 │
│                            │
│  Device Registration       │
│  Reset                     │
│                            │
│  Your admin has reset your │
│  device registration.      │
│                            │
│  To re-register:           │
│  1. Sign in on this device │
│  2. Your admin will        │
│     confirm registration   │
│                            │
│  [ Sign In Again ]         │
│                            │
└────────────────────────────┘
```

`[Sign In Again]` → clear tokens → `/login`.

On next login: device fingerprint sent again. Admin must re-register this device via admin portal (Section 5.6 of admin UI spec).

---

### 9.4 Forced Logout

**Trigger:** Active session invalidated server-side (employee deactivated, device reset, absolute 90-day token expiry, admin revokes sessions).

**Detection:** `POST /auth/refresh` returns `401` with specific error, OR next API call returns `401` and refresh fails.

**UX:** Navigate to `/session-expired` screen (Section 0.6). Message: "Your session has ended. Please sign in again."

If employee is deactivated (`AUTH_007` returned on login attempt): show deactivation message from Screen 0.2 error states.

---

## 10. Offline Strategy

### 10.1 Read-Only Offline Mode

When no network is available, the app shows cached data with an offline banner.

**Offline Banner (global):**
```
┌────────────────────────────┐
│  📵 Offline — Cached data  │  ← amber banner at top of each screen
└────────────────────────────┘
```

**Cached screens (read-only):**

| Screen | Cache Source | Staleness Threshold |
|---|---|---|
| Home — today's attendance | Hive (from last successful fetch) | 24 hours |
| Home — monthly summary | Hive | 7 days |
| Attendance weekly | Hive | 7 days |
| Attendance history | Hive | 7 days |
| Leave balances | Hive | 24 hours |
| Leave history | Hive | 7 days |
| Notifications | Hive | 24 hours |
| Profile | Hive | 30 days |

**Stale data warning:** If cached data is older than threshold, show additional note: "Data may be outdated. Last updated 3 days ago."

### 10.2 Write Operations Offline

Write operations (check-in, check-out, apply leave, submit regularization) require network:

```
[CHECK IN] tapped → network check fails → NETWORK_OFFLINE bottom sheet (Section 4.1)
```

No offline write queue in V1. All mutations require connectivity. User shown clear error with `[Retry]` button.

### 10.3 Retry Pattern

All API calls use Dio interceptor with retry on network error:
- Retry: 1 automatic retry after 2 seconds on `DioExceptionType.connectionError`
- No retry on 4xx or 5xx (not transient)
- On all failures: show retry button in UI (pull-to-refresh or explicit button)

### 10.4 Cache Strategy

```dart
// Hive cache key pattern
'attendance_weekly_2026-W24'
'leave_history_page_1'
'leave_balance'
'notifications_page_1'
'profile'
'company_settings'   ← used for geo-fence, working days, holidays offline
```

`companySettings` cached on login and refreshed on each app foreground. Critical for:
- Offline display of working day indicators
- Geo-fence radius (used client-side before API call)
- Holiday list (for leave day count calculation)

Cache cleared on logout.

---

### 10.5 Duplicate Submission Protection (Idempotency)

All write operations use client-side idempotency keys persisted in Hive to survive app kills.

**Idempotency key lifecycle:**
```
FORM SUBMIT TAPPED
  → Check Hive 'pending_submissions' for this endpoint
      Found (status: pending) → reuse existing key (retry)
      Not found → generate UUID v4 → store in Hive as 'pending'
  → Disable submit button ("Submitting… Don't close this screen")
  → API call with header: X-Idempotency-Key: <UUID>

  200/201 → mark Hive record 'confirmed' → clear after 60s → success UI
  409 Conflict → server already processed → treat as 200 → success UI
  Network error → status stays 'pending' → show [Retry] → same key reused
  4xx (non-409) → mark 'failed' → clear after 5min → re-enable form

APP KILLED during submission
  → On restart: check Hive for 'pending' records
  → Found → show PendingSubmissionBanner on Home
```

**PendingSubmissionBanner (Home screen):**
```
┌────────────────────────────┐
│  ⏳ Unconfirmed Submission  │
│  Leave request may not have│
│  been sent (14 Jun, 10:15) │
│  [ Check Status ] [Dismiss]│
└────────────────────────────┘
```

`[Check Status]` → `GET /leaves?status=pending` → found → success, clear Hive → not found → `[Retry Now]` (resubmit with same key).

**Operations with idempotency:**

| Endpoint | Mechanism |
|---|---|
| `POST /attendance/checkin` | `nonce` field = UUID (same UUID as `X-Idempotency-Key`) |
| `POST /attendance/checkout` | `X-Idempotency-Key` header |
| `POST /leaves` | `X-Idempotency-Key` header |
| `POST /regularizations` | `X-Idempotency-Key` header |

**Submitting state UI (all forms):**
```
[ ⏳  Submitting… ]          ← disabled ElevatedButton with spinner
┌────────────────────────┐
│  Don't close this      │
│  screen yet.           │
└────────────────────────┘
```

**Retry state UI:**
```
[ Retry Submit ]             ← re-enabled (same idempotency key)
SnackBar: "Connection lost. Tap Retry to try again."
```

---

## 11. Accessibility

### 11.1 Font Scaling

All text uses `sp` units — automatically respects Android font size settings. UI tested at:
- Small (85%), Default (100%), Large (115%), Extra Large (130%)

Layouts use `Flexible` and `Expanded` widgets to accommodate text overflow. No hardcoded text heights. Long text wraps (no `overflow: ellipsis` on primary content).

### 11.2 Screen Reader Support (TalkBack)

| Requirement | Implementation |
|---|---|
| All interactive elements have labels | `Semantics(label: '...')` on custom widgets, `tooltip:` on `IconButton` |
| Status icons have text alternatives | Status chips include text ("Present", not just a green dot) |
| Check-in button label dynamic | `Semantics(label: 'Check in button')` / `'Check out button'` based on state |
| Error messages announced | `Semantics(liveRegion: true)` on error containers |
| Loading states announced | `Semantics(label: 'Loading...')` on shimmer placeholders |
| Form fields labeled | `InputDecoration(labelText: '...')` — Flutter provides this to TalkBack automatically |
| Bottom nav tabs | `NavigationBar` provides TalkBack labels automatically |
| GPS error sheets | `Semantics(label: 'Location error: ...')` |

### 11.3 Touch Target Guidelines

All interactive elements meet Android minimum:
- **Minimum tap target:** 48×48dp (Material Design guideline)
- Primary action button (CHECK IN/OUT): 56dp height full width
- Bottom navigation items: 48dp height (auto by `NavigationBar`)
- List item rows: minimum 56dp height (`ListTile` default)
- Icon buttons in app bar: 48×48dp (`IconButton` default)
- Checkbox / radio: 48×48dp tap area with `InkWell` wrapping

### 11.4 Color Contrast

| Text Use | Minimum Ratio | Implementation |
|---|---|---|
| Body text on white | 4.5:1 | `Colors.grey.shade900` on white |
| Disabled text | 3:1 (not required by WCAG for disabled) | `Colors.grey.shade500` |
| Status chip text | 4.5:1 | Dark text on light background chips |
| Error text | 4.5:1 | `Colors.red.shade700` on white |
| Amber warning text | 4.5:1 | `Colors.amber.shade800` on white |

Status badges always include text — color is supplementary, never the sole differentiator.

### 11.5 Reduced Motion

`MediaQuery.disableAnimations` check:
```dart
if (!MediaQuery.of(context).disableAnimations) {
  // animate
} else {
  // instant state change
}
```
Applied to: screen transitions, shimmer animations, live timer fade updates.

---

## Appendix A — Screen Inventory

| # | Screen | Route | Purpose |
|---|---|---|---|
| 1 | Splash | `/` | Init + routing |
| 2 | Login | `/login` | Authentication |
| 3 | Forgot Password | `/forgot-password` | Reset request |
| 4 | Reset Password | `/reset-password` | Token + new password |
| 5 | Forced Change Password | `/change-password` | Temp password replacement |
| 6 | Session Expired | `/session-expired` | Re-auth prompt |
| 7 | Home Dashboard | `/home` | Attendance + check-in/out |
| 8 | Attendance Weekly | `/attendance/week` | Week grid |
| 9 | Daily Attendance Detail | `/attendance/day/:dateStr` | Day sessions |
| 10 | Attendance History | `/attendance/history` | Month list |
| 11 | Leave Balances | `/leave/balance` | Remaining entitlements |
| 12 | Leave History | `/leave/history` | All requests |
| 13 | Apply Leave | `/leave/apply` | Create request |
| 14 | Leave Detail | `/leave/:id` | View / cancel request |
| 15 | Create Regularization | `/regularization/create` | Submit correction |
| 16 | Regularization History | `/regularization/history` | All requests |
| 17 | Regularization Detail | `/regularization/:id` | View / withdraw |
| 18 | Notification List | `/notifications` | History |
| 19 | Notification Detail | `/notifications/:id` | Full content |
| 20 | Profile | `/profile` | Personal info |
| 21 | Change Password | `/profile/change-password` | Voluntary change |
| 22 | Device Information | `/profile/device` | Device status |
| 23 | Device Mismatch | `/device-mismatch` | Wrong device error |
| 24 | Device Reset Required | `/device-reset-required` | Admin reset notice (updated) |
| 25 | Device Not Registered | `/device-not-registered` | New employee — share fingerprint |
| 26 | Device Awaiting Registration | `/device-awaiting-registration` | Waiting for admin to register |
| 27 | Notification Permission | (one-time, post-login) | FCM permission rationale |

**Total: 27 screens** (was 24; +3 from R-MOB-001 and R-MOB-003)

**Distinct UX states (not full screens but separately designed):**
- Attendance state machine: 11 states (Reconciling, Idle, GPS Requesting, GPS Acquiring, GPS Permission Denied, GPS Disabled, GPS Low Accuracy, Outside Geo-fence, Checkin Submitting, Checked In, Checkout Submitting, Checked Out Partial, Checked Out Complete) = 13 states
- FCM notification types: 5
- Leave detail statuses: 4 (Pending, Approved, Rejected, Revoked)
- Regularization detail statuses: 3 (Pending, Approved, Rejected)
- Offline banner: global
- Pending submission banner: global

---

## Appendix B — API Mapping

| Screen / Action | API Call |
|---|---|
| Splash (token refresh) | `POST /auth/refresh` |
| Login | `POST /auth/login` |
| Forgot Password | `POST /auth/password-reset/request` |
| Reset Password | `POST /auth/password-reset/confirm` |
| Forced Change / Change Password | `PATCH /auth/me/change-password` |
| Logout | `POST /auth/logout` |
| Home (load) | `GET /auth/me`, `GET /attendance/today`, `GET /attendance/monthly?yearMonth` |
| Check In | `POST /attendance/checkin` |
| Check Out | `POST /attendance/checkout` |
| Weekly Attendance | `GET /attendance/weekly?week=` or `GET /attendance/history?startDate=&endDate=` |
| Daily Detail | `GET /attendance/history?startDate=&endDate=` (single day) |
| Attendance History | `GET /attendance/history?yearMonth=` |
| Leave Balances | `GET /leaves/balance` |
| Leave History | `GET /leaves` |
| Apply Leave | `POST /leaves` |
| Leave Detail | `GET /leaves/:id` |
| Cancel Leave | `DELETE /leaves/:id` or `PATCH /leaves/:id/cancel` |
| Create Regularization | `POST /regularizations` |
| Regularization History | `GET /regularizations` |
| Regularization Detail | `GET /regularizations/:id` |
| Withdraw Regularization | `DELETE /regularizations/:id` |
| Notification List | `GET /notifications` |
| Mark Notification Read | `PATCH /notifications/:id/read` |
| Mark All Read | `PATCH /notifications/read-all` |
| Profile | `GET /auth/me` |
| Company Settings (cached) | `GET /settings` (on login, cached to Hive) |

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| v1.0 | 2026-06-14 | Initial Employee Mobile App UI/UX Design — 24 screens, all modules |
| v1.1 | 2026-06-14 | R-MOB-001–005 remediation; +3 screens; device registration lifecycle; server state reconciliation; FCM token lifecycle; re-check-in state machine (PARTIAL/COMPLETE); idempotency keys |
