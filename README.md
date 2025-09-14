# Tiling Smart v3 (minimal)

Next.js (Pages Router) + Supabase + Resend.

## Setup
1. Create Supabase project and run the provided SQL (v3 schema).
2. In Supabase Auth, create a user and add them to `app.user_roles` as 'admin'.
3. Set env vars in Vercel: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RESEND_API_KEY`.
4. Deploy.

## Local dev (optional)
```bash
npm install
cp .env.example .env.local  # fill values
npm run dev
```
