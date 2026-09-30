# Pantryhouse project context

Last updated: 30 September 2026

## Current state

Pantryhouse v1 is implemented and deployed at [prahaladvathsan.github.io/Pantryhouse](https://prahaladvathsan.github.io/Pantryhouse/). The production app uses Supabase; a seeded in-memory demo is used when the two public Supabase environment variables are absent.

The core loop is present: create or join a household, maintain pantry inventory, populate the Next Order list automatically or manually, snapshot an order, hand it to ChatGPT or Claude, import the assistant’s exact product result, mark the reviewed order as placed, update inventory, learn product preferences, and track equal expense splits.

## Architecture

- Vite, React, and TypeScript single-page app with hash routing
- Supabase anonymous authentication, PostgreSQL, RPC functions, RLS, and Postgres Changes
- GitHub Pages deployment from `.github/workflows/deploy-pages.yml`
- Zod validation at form and API boundaries
- Vitest and Testing Library for domain and UI tests
- Feature-detected WebMCP tools for listing inventory, adjusting quantity, and adding to Next Order

The database source of truth is `supabase/migrations/`. Apply every migration with `npx supabase db push`; the second migration is required for authenticated inventory writes through the synchronization trigger.

## Product and interface decisions

- Household access is deliberately flat-trust: anyone holding the invite link can join and can select an existing member identity.
- Anonymous sessions are device-local and recover through the invite link rather than email/password recovery.
- Money is stored as integer paise and split equally; remainder paise are assigned deterministically.
- Only one draft order may be active. Starting an order snapshots the current list so later additions remain queued.
- The app never confirms payment or directly modifies a Swiggy cart. It copies a prompt first, then opens an experimental ChatGPT or Claude prefill URL.
- The visual direction is **Fresh Signal + Shelf Map**: deep green, high-visibility fresh-green accents, restrained warm shelf materials, and inventory grouped by category.
- Pantry consumption uses the whole item card: hold and drag to the consumption target to subtract one, or double-tap to add one. Durable item settings live under the overflow menu; “Stop tracking” is intentionally distinct from consumption.
- Placed-order items retain the generic pantry tag plus exact product name, brand, pack size, unit and line prices, and thumbs feedback. Future AI prompts derive preferences from this history immediately.
- The four primary destinations remain in an equal-width top tab bar on all screen sizes.
- Pantry filters are also equal-width and show their counts inline. The previous summary cards, large pantry heading, and “Kitchen · upper/lower” labels were intentionally removed.

## Deployment configuration

GitHub repository: [prahaladvathsan/Pantryhouse](https://github.com/prahaladvathsan/Pantryhouse)

Repository variables required by the Pages workflow:

- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

Never put a Supabase service-role key in the frontend, repository variables used by Vite, or committed files.

## Verification coverage

The Pages workflow currently runs `npm test` and `npm run build` before deployment. Domain tests cover normalization, expiry and replenishment behavior, inventory merge rules, and split rounding. A Supabase RLS test script exists at `supabase/tests/rls.sql`, but it requires a local Supabase stack and is not part of the hosted Pages workflow.

## Known boundaries and likely next work

- Chat provider prefill URLs are best-effort and may change; the clipboard fallback is the reliable path. Since an external provider tab cannot write cross-origin state back into Pantryhouse, exact product details return through the structured `PANTRYHOUSE_ORDER_RESULT` paste/import step.
- There is no direct Swiggy Instamart or payment integration. Revisit only when an official, suitably scoped API or MCP capability is available.
- Browser-level end-to-end coverage, two-session realtime testing, and a broader accessibility audit remain worthwhile hardening work.
- Future visual work should extend the Fresh Signal + Shelf Map language to Next Order, Orders, and Household without restoring dashboard-style metric cards or generic AI-generated gradients.
