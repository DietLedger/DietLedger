# Settings Unification Plan

> Status: Complete (Phases 1–5). Templates read-only-on-global in the /settings/templates editor is the one remaining refinement.
> Original plan: 2026-07-02. Reset scope revised by user approval on 2026-11-17; see `../specs/complete-custom-data-reset.md`.

## Root cause (why admin cards were invisible)

Two parallel settings UIs with divergent content:
- **Cog popup** (`src/components/app-nav.tsx` tabbed `<Dialog>`) — what everyone uses.
- **`/settings` page** (`src/app/(app)/settings/page.tsx`) — **orphaned** (no nav link to its root; only `/settings/templates`). Reachable only by URL, so Administration + Danger Zone cards there were unreachable.

Also "API key" is overloaded: the **USDA FoodData Central key** (live search, per-user secret) vs the **scoped developer API keys** (`api_keys` table) — unrelated features.

## Decisions (locked)

- **A. Admin page layout**: tabs on the **left**, content on the **right**.
- **B. Non-admin popup content**: the explicit list below (everything else is admin-only).
- **C. Developer API keys**: admin-only (not in the user list).
- **D. Templates**: user-accessible — global templates read-only, custom templates per-account.

## Content matrix

### Non-admin popup (tabs, in-site dialog)
- **General**: USDA FoodData Central API key (optional), Theme, Account summary (recipe count, signed-in-as), About DietLedger (version).
- **Meal Times**: default meal times (account-specific, seeded from global defaults).
- **Library**: Categories (**read-only**), Staples (**global read-only** + account-specific editable), Custom Foods (account), Location.
- **Templates**: global read-only + account-specific custom.
- **Data**: Export Account Data, Import Account Data, **Delete My Data** (password-gated), **Delete My Account** (password-gated; auto-downloads a backup zip first).

### Admin `/settings` page (left tabs → right content) — superset
Everything above **except the personal data-delete shortcut** (the administrator Data tab instead offers the explicitly instance-wide **Reset all custom data**) **plus** admin-only:
- **Food Database** (`FoodDatabasePanel`).
- **Developer API Keys** (scoped).
- **Administration**: registration toggle, demo cookbook install.
- **Danger Zone**: Reset all custom data (instance-wide; same action as the Data tab), Factory reset (instance-wide). Custom-data reset preserves accounts/settings/sessions and imported standard nutrition data, clears all custom content/import receipts, and does not reseed staples.
- Categories / Staples / Templates gain **write access to global** items (admin manages the global taxonomy + global staples + global templates).

## New work required

### Backend — per-account self-service deletes (password-gated)
Both verify the requesting user's password (reuse `AuthService.VerifyUserPassword`), scoped to the caller — distinct from the instance-wide admin resets.
- `POST /api/account/delete-data` `{password}` — deletes all content owned by the caller; keeps the account + settings.
- `POST /api/account/delete` `{password}` — deletes the account + all its data + settings. (Client downloads the backup zip **before** calling this, then logs out.)

### Backend — global pantry staples (new concept)
Today `pantry_staples` is per-user only. Add a global/default set:
- Migration: mark or seed global staples (e.g. `is_global` flag, or a system `user_id = NULL` set).
- Seed a sensible default staple list on migration.
- `ListPantryStaples` returns global + the user's own; panel renders global as read-only and the user's as editable. Admin (on the page) can edit global.

### Panels — read-only / scoping modes
- `CategoriesPanel`: add a read-only mode (non-admin can view the global taxonomy but not create/edit/delete). Categories are already global (no `user_id`).
- Templates UI: gate `is_default` (global) templates as read-only for non-admins; admin may edit them. (Listing already returns user + defaults.)
- `PantryStaplesPanel`: split global (read-only) vs account (editable).
- Custom Foods, Location, Meal Times, Theme, USDA key: already account-scoped — reuse as-is.

### Frontend — IA
- `/settings` page: rebuild as left-tab nav + right content pane; render the superset (account tabs + admin tabs, admin tabs hidden for non-admin — but non-admin uses the popup, so the page is effectively admin-only via routing).
- `app-nav.tsx` cog: role-aware — admin → `router.push('/settings')`; non-admin → open the reduced popup.
- Popup: re-tab to the non-admin content list; remove admin-only tabs (Food Database, etc.); add the Data tab (export/import/delete-self).

## Phased tasks

1. **Backend**: add `/api/account/delete-data` + `/api/account/delete` (password-gated, caller-scoped) + store methods; global pantry staples migration + seed + list change.
2. **Panels**: read-only modes for Categories / Templates; global-vs-account split in Staples.
3. **Admin page**: rebuild `/settings` as left-tabs + right content (superset), reusing panels; wire Administration + Danger Zone (already present).
4. **Cog routing**: role-aware (admin → page, non-admin → popup).
5. **Non-admin popup**: re-tab to the locked content list; add Data tab with Export/Import + Delete My Data + Delete My Account (the latter downloads backup zip then deletes).
6. **Cleanup**: remove orphaned/duplicate controls; rename the two API-key concepts; fix breadcrumbs.

## Risks / notes
- Per-account deletes must be **caller-scoped** (`WHERE user_id = $1`) — never instance-wide. Reuse the password-challenge dialog.
- "Delete My Account" must download the backup **before** the irreversible delete call; on success, logout + redirect to `/login` (or `/setup` if instance becomes empty).
- Global staples seeding is a one-time migration; pick a small default list.
- No change to data ownership model — all user content stays user-scoped; only Categories move to "global taxonomy" semantics (they already are global).
- Lazy-mount admin tabs (Food Database, etc.) to keep the page snappy.
