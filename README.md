# ARCANEUM Perfumes Site

Public site source for ARCANEUM Perfumes.

## Private Preview intake

The homepage form submits directly to `public.private_preview_requests` in Supabase using the project's publishable browser key. Row Level Security gives the anonymous browser role `INSERT` only; it has no anonymous read, update, or delete access. The direct email link remains available as a fallback.

The publishable key is intentionally browser-visible and is not a secret. Database permissions and RLS are the authorization boundary. Never place a secret/service-role key in client-side code.
