# ARCANEUM Perfumes Site

Public site source for ARCANEUM Perfumes.

## Private Preview intake

The homepage Private Preview form submits directly to the connected Supabase Data API table `public.private_preview_requests` using the project's publishable browser key. Row Level Security permits the anonymous browser role to `INSERT` only; it has no anonymous read, update, or delete access. The direct email link remains available as a fallback.

The publishable key is intentionally browser-visible and is not a secret. Database permissions and Row Level Security are the authorization boundary. Never place a Supabase secret/service-role key in this repository or client-side code.
