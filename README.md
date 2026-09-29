# Pantryhouse

A mobile-first shared pantry, grocery-order, and expense-split app for flatmates.

## What is included

- Shared inventory with quantity controls, expiry warnings, search, and filters
- Automatic restocking for empty or expired recurring items
- Collaborative Next Order list with name-based deduplication
- ChatGPT and Claude cart hand-off with a copy-first fallback
- Transactional placed-order review, pantry update, equal splits, and settlement tracking
- Invite-link household access through Supabase anonymous sessions
- Household-scoped row-level security and realtime refreshes
- A realistic in-memory demo whenever Supabase variables are absent
- GitHub Pages deployment workflow

## Run locally

```powershell
npm install
npm run dev
```

Without environment variables, the app opens the seeded demo. Demo changes last only until the page is refreshed.

## Connect Supabase

1. Create a Supabase project and enable **Anonymous Sign-Ins** under Authentication settings.
2. Install the Supabase CLI or use `npx supabase`.
3. Link this folder to the project and apply `supabase/migrations/202609290001_initial_schema.sql`.
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
5. Restart the development server.

Only the public/publishable Supabase key belongs in the browser. Never add a service-role key to a Vite environment variable.

To refresh generated database types after linking a project:

```powershell
npx supabase gen types typescript --linked
```

Save the output as `src/database.types.ts` and use it as the source of truth after future schema migrations.

## Verify

```powershell
npm test
npm run build
```

With a local Supabase stack running, database policy tests can be run with:

```powershell
npx supabase test db
```

## Deploy to GitHub Pages

1. Push the project to a GitHub repository whose default branch is `main`.
2. In **Settings → Pages**, choose **GitHub Actions** as the source.
3. Add repository variables named `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`.
4. Run the **Deploy Pantryhouse to GitHub Pages** workflow or push to `main`.

Vite uses relative assets and hash routes, so invite links work under both repository subpaths and custom domains.

## Important behavior

- The invite link is the household key. Anyone with it can join or select an existing member identity.
- Anonymous sessions are device-local. If browser data is cleared, use the invite link to rejoin.
- AI web-prefill URLs are best-effort. Pantryhouse copies the prompt before opening the provider, so the list can always be pasted manually.
- Expense splitting is equal-only in v1; the payer’s own share is marked settled automatically.
