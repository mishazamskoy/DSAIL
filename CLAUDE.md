# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DSAIL is a strategy city-building game where users grow their city by logging health and wellness activities. Users submit activity logs as free-form text, Claude processes the input and awards points, and those points are spent to construct structures in the user's city.

## Tech Stack

- **Frontend**: React + Vite
- **Routing**: React Router (client-side)
- **Styling**: Tailwind CSS
- **Backend/Auth/DB**: Supabase (PostgreSQL, Auth, real-time)
- **Login**: GitHub OAuth (configured in Supabase)
- **Migrations**: Supabase CLI (`npx supabase db execute`)

## Development Commands

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run preview   # Preview production build
```

## Environment Variables

Stored in `.env` (gitignored — never commit it):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...
```

## Database Migrations

All schema changes must be written as SQL files in `supabase/migrations/` and applied with:

```bash
npx supabase db query --linked -f supabase/migrations/<filename>.sql
```

Never ask the user to paste SQL into the Supabase dashboard manually.

## Security Rules (non-negotiable)

- **RLS on every table** — every database table must have Row Level Security enabled with appropriate policies
- **Session check on every protected page** — verify an active Supabase session before rendering any authenticated view
- **No cross-user data leakage** — RLS policies must strictly scope data to the authenticated user
- **Secrets via env vars** — all keys and secrets must come from environment variables, never hardcoded
