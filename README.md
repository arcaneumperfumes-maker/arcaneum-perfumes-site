# ARCANEUM Perfumes Site

Public site source for ARCANEUM Perfumes.

## Private Preview intake

The homepage form submits directly to Supabase using a publishable browser key. The `private_preview_requests` table has Row Level Security enabled; the anonymous browser role can insert requests but cannot read, update, or delete them. The direct email link remains available as a fallback.

The publishable key is intentionally browser-visible and is not a secret. Database permissions and RLS are the authorization boundary. Never place a secret/service-role key in client-side code.
