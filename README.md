# Pantryhouse

A mobile-first shared pantry, grocery-order, and expense-split app for flatmates.

**Live app:** [prahaladvathsan.github.io/Pantryhouse](https://prahaladvathsan.github.io/Pantryhouse/)

## What is included

- Shared inventory with whole-card consumption/restock gestures, expiry warnings, search, and filters
- Automatic restocking for empty or expired recurring items
- Collaborative Next Order list with name-based deduplication
- Claude cart hand-off with a direct, single-order connector, learned product preferences, and a copy-first fallback
- Exact purchased-product history with brand, pack size, price, and thumbs up/down feedback
- Transactional placed-order review, pantry update, equal splits, and settlement tracking
- Invite-link household access through Supabase anonymous sessions
- Household-scoped row-level security and realtime refreshes
- A Fresh Signal visual system with equal-width top navigation and category-based pantry shelves
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
3. Link this folder to the project and apply all migrations:

   ```powershell
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

   This includes the initial schema, the trigger-function security fix, product history, and secure assistant hand-off.

4. Deploy the Pantryhouse connector:

   ```powershell
   npx supabase functions deploy pantryhouse-mcp --no-verify-jwt
   ```

   The endpoint is public so Claude can discover the tool, but it cannot read household data. Every write requires a random, two-hour, single-order code created by an authenticated Pantryhouse member. The service-role credential remains inside the Edge Function.

5. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key.
6. Restart the development server.

Only the public/publishable Supabase key belongs in the browser. Never add a service-role key to a Vite environment variable.

To refresh generated database types after linking a project:

```powershell
npx supabase gen types typescript --linked > src/database.types.ts
```

Use the generated file as the source of truth after future schema migrations.

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

The production deployment currently lives at [prahaladvathsan.github.io/Pantryhouse](https://prahaladvathsan.github.io/Pantryhouse/). Every push to `main` runs the tests and production build before Pages is updated.

## Important behavior

- The invite link is the household key. Anyone with it can join or select an existing member identity.
- Anonymous sessions are device-local. If browser data is cleared, use the invite link to rejoin.
- AI web-prefill URLs are best-effort. Pantryhouse copies the prompt before opening the provider, so the list can always be pasted manually.
- For direct return, add `https://<project-ref>.supabase.co/functions/v1/pantryhouse-mcp` once under Claude **Settings → Connectors → Add custom connector**. Opening Claude from an order creates an expiring capability that can populate only that draft.
- Claude can populate exact products and the cart total, but cannot place the purchase, confirm payment, or update pantry inventory. A household member must review and confirm the draft in Pantryhouse.
- If the connector is unavailable, the prompt asks for the existing structured `PANTRYHOUSE_ORDER_RESULT`; paste that block into the placed-order review to import the same details.
- Product feedback is retained against the pantry item type. Liked, disliked, and most recently purchased products are included in future order prompts immediately.
- Pantryhouse does not directly operate Swiggy or Instamart. The v1 integration is a copy-and-open hand-off; direct cart automation depends on official external support.
- Expense splitting is equal-only in v1; the payer’s own share is marked settled automatically.

## Common Supabase setup errors

- **Invalid path / auth 404:** check that `VITE_SUPABASE_URL` is the exact project URL, including `https://` and `.supabase.co`.
- **Anonymous sign-ins are disabled:** enable anonymous sign-ins in the project’s Authentication settings.
- **403 while saving inventory:** run `npx supabase db push` so both migrations are applied, including `202609300001_fix_trigger_function_security.sql`.

See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) for the implementation handoff, current product decisions, and sensible next work.
