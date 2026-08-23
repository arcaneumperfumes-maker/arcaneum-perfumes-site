-- ARCANEUM first-party analytics and Copycat Watch foundation.
-- The browser sends a random first-party visitor UUID. Raw IP addresses,
-- query strings, form contents, and browser fingerprints are not stored.

create table if not exists public.arcaneum_page_views (
  event_id uuid primary key,
  visitor_id uuid not null,
  session_id uuid not null,
  path text not null,
  page_title text,
  referrer_host text,
  referrer_source text not null default 'direct',
  country_code text,
  returning_visit boolean not null default false,
  source text not null default 'website',
  captured_at timestamptz not null default now(),
  constraint arcaneum_page_views_path_check check (
    char_length(path) between 1 and 300
    and left(path, 1) = '/'
    and position('?' in path) = 0
    and position('#' in path) = 0
  ),
  constraint arcaneum_page_views_title_check check (
    page_title is null or char_length(page_title) <= 200
  ),
  constraint arcaneum_page_views_referrer_host_check check (
    referrer_host is null
    or (
      char_length(referrer_host) between 1 and 253
      and referrer_host = lower(referrer_host)
      and referrer_host ~ '^[a-z0-9.-]+$'
    )
  ),
  constraint arcaneum_page_views_referrer_source_check check (
    referrer_source in ('direct', 'internal', 'search', 'social', 'referral', 'email', 'other')
  ),
  constraint arcaneum_page_views_country_check check (
    country_code is null or country_code ~ '^[A-Z]{2}$'
  ),
  constraint arcaneum_page_views_source_check check (source = 'website')
);

comment on table public.arcaneum_page_views is
  'Privacy-minimized first-party page views. No raw IP, query string, form content, or fingerprint columns.';
comment on column public.arcaneum_page_views.visitor_id is
  'Random browser-local UUID; not derived from IP or device characteristics.';
comment on column public.arcaneum_page_views.country_code is
  'Optional ISO 3166-1 alpha-2 code only when an authoritative hosting signal is available.';

create index if not exists arcaneum_page_views_captured_at_idx
  on public.arcaneum_page_views (captured_at desc);
create index if not exists arcaneum_page_views_path_captured_at_idx
  on public.arcaneum_page_views (path, captured_at desc);
create index if not exists arcaneum_page_views_visitor_captured_at_idx
  on public.arcaneum_page_views (visitor_id, captured_at desc);
create index if not exists arcaneum_page_views_referrer_idx
  on public.arcaneum_page_views (referrer_host, captured_at desc)
  where referrer_host is not null;
create index if not exists arcaneum_page_views_country_idx
  on public.arcaneum_page_views (country_code, captured_at desc)
  where country_code is not null;

alter table public.arcaneum_page_views enable row level security;

revoke all on table public.arcaneum_page_views from public, anon, authenticated;
grant insert (
  event_id,
  visitor_id,
  session_id,
  path,
  page_title,
  referrer_host,
  referrer_source,
  country_code,
  returning_visit
) on table public.arcaneum_page_views to anon, authenticated;
grant select, insert, update, delete on table public.arcaneum_page_views to service_role;

drop policy if exists "ARCANEUM website may record minimized page views"
  on public.arcaneum_page_views;
create policy "ARCANEUM website may record minimized page views"
  on public.arcaneum_page_views
  for insert
  to anon, authenticated
  with check (
    lower(
      coalesce(
        (
          coalesce(
            nullif((select current_setting('request.headers', true)), ''),
            '{}'
          )::jsonb ->> 'origin'
        ),
        ''
      )
    ) = any (
      array[
        'https://arcaneumperfumes.com',
        'https://www.arcaneumperfumes.com',
        'https://arcaneumperfumes-maker.github.io'
      ]
    )
    and source = 'website'
    and char_length(path) between 1 and 300
    and left(path, 1) = '/'
    and position('?' in path) = 0
    and position('#' in path) = 0
  );

create schema if not exists arcaneum_reporting;
revoke all on schema arcaneum_reporting from public, anon, authenticated;
grant usage on schema arcaneum_reporting to service_role;

create or replace view arcaneum_reporting.daily_traffic
with (security_invoker = true)
as
select
  captured_at::date as day,
  count(*)::bigint as page_views,
  count(distinct visitor_id)::bigint as unique_visitors,
  count(distinct visitor_id) filter (where returning_visit)::bigint as returning_visitors
from public.arcaneum_page_views
group by captured_at::date;

create or replace view arcaneum_reporting.popular_pages
with (security_invoker = true)
as
select
  path,
  count(*)::bigint as page_views,
  count(distinct visitor_id)::bigint as unique_visitors,
  max(captured_at) as last_viewed_at
from public.arcaneum_page_views
group by path;

create or replace view arcaneum_reporting.referrers
with (security_invoker = true)
as
select
  referrer_source,
  referrer_host,
  count(*)::bigint as page_views,
  count(distinct visitor_id)::bigint as unique_visitors
from public.arcaneum_page_views
group by referrer_source, referrer_host;

create or replace view arcaneum_reporting.countries
with (security_invoker = true)
as
select
  country_code,
  count(*)::bigint as page_views,
  count(distinct visitor_id)::bigint as unique_visitors
from public.arcaneum_page_views
where country_code is not null
group by country_code;

create or replace view arcaneum_reporting.visitor_summary
with (security_invoker = true)
as
select
  visitor_id,
  min(captured_at) as first_seen_at,
  max(captured_at) as last_seen_at,
  count(*)::bigint as page_views,
  count(distinct session_id)::bigint as sessions,
  bool_or(returning_visit) as has_returned
from public.arcaneum_page_views
group by visitor_id;

grant select on all tables in schema arcaneum_reporting to service_role;

create schema if not exists copycat_watch;
revoke all on schema copycat_watch from public, anon, authenticated;
grant usage on schema copycat_watch to service_role;

create table if not exists copycat_watch.protected_phrases (
  id text primary key,
  phrase text not null unique,
  normalized_sha256 text not null unique,
  status text not null default 'active',
  added_at timestamptz not null default now(),
  constraint copycat_phrase_hash_check check (normalized_sha256 ~ '^[0-9a-f]{64}$'),
  constraint copycat_phrase_status_check check (status in ('active', 'retired'))
);

create table if not exists copycat_watch.protected_assets (
  path text primary key,
  sha256 text not null,
  media_type text not null,
  status text not null default 'active',
  last_verified_at timestamptz not null default now(),
  constraint copycat_asset_hash_check check (sha256 ~ '^[0-9a-f]{64}$'),
  constraint copycat_asset_status_check check (status in ('active', 'retired'))
);

create table if not exists copycat_watch.repository_baselines (
  repository text not null,
  commit_sha text,
  tree_sha256 text not null,
  created_at timestamptz not null default now(),
  primary key (repository, tree_sha256),
  constraint copycat_repository_hash_check check (tree_sha256 ~ '^[0-9a-f]{64}$')
);

create table if not exists copycat_watch.monitored_domains (
  domain text primary key,
  relationship text not null,
  status text not null default 'watching',
  first_seen_at timestamptz not null default now(),
  last_checked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  constraint copycat_domain_relationship_check check (
    relationship in ('canonical', 'lookalike', 'suspected_copy')
  ),
  constraint copycat_domain_status_check check (
    status in ('watching', 'clear', 'review', 'confirmed', 'retired')
  )
);

create table if not exists copycat_watch.findings (
  id uuid primary key default extensions.gen_random_uuid(),
  finding_type text not null,
  severity text not null,
  observed_url text,
  observed_repository text,
  protected_reference text,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'new',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  constraint copycat_finding_type_check check (
    finding_type in ('signature_phrase', 'exact_image', 'lookalike_domain', 'repository_duplication')
  ),
  constraint copycat_severity_check check (severity in ('low', 'medium', 'high', 'critical')),
  constraint copycat_finding_status_check check (
    status in ('new', 'reviewing', 'dismissed', 'confirmed', 'resolved')
  )
);

alter table copycat_watch.protected_phrases enable row level security;
alter table copycat_watch.protected_assets enable row level security;
alter table copycat_watch.repository_baselines enable row level security;
alter table copycat_watch.monitored_domains enable row level security;
alter table copycat_watch.findings enable row level security;

drop policy if exists "Copycat Watch service role manages protected phrases"
  on copycat_watch.protected_phrases;
create policy "Copycat Watch service role manages protected phrases"
  on copycat_watch.protected_phrases for all to service_role
  using (true) with check (true);

drop policy if exists "Copycat Watch service role manages protected assets"
  on copycat_watch.protected_assets;
create policy "Copycat Watch service role manages protected assets"
  on copycat_watch.protected_assets for all to service_role
  using (true) with check (true);

drop policy if exists "Copycat Watch service role manages repository baselines"
  on copycat_watch.repository_baselines;
create policy "Copycat Watch service role manages repository baselines"
  on copycat_watch.repository_baselines for all to service_role
  using (true) with check (true);

drop policy if exists "Copycat Watch service role manages monitored domains"
  on copycat_watch.monitored_domains;
create policy "Copycat Watch service role manages monitored domains"
  on copycat_watch.monitored_domains for all to service_role
  using (true) with check (true);

drop policy if exists "Copycat Watch service role manages findings"
  on copycat_watch.findings;
create policy "Copycat Watch service role manages findings"
  on copycat_watch.findings for all to service_role
  using (true) with check (true);

revoke all on all tables in schema copycat_watch from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema copycat_watch to service_role;

insert into copycat_watch.protected_phrases (id, phrase, normalized_sha256)
values
  ('house-sovereignty', 'SCENT WITH SOVEREIGNTY.', '7b69798267ccf88bd1f21fdc093336309800ab21897c13ab73c2f14c6c716eee'),
  ('house-transformation', 'Every ARCANEUM fragrance begins with one unforgettable tension—and follows it until the air remembers what changed.', 'dc3916cbf1ffd4a0080a703925921ed29680d85b902bb251d86cc88d1da999d6'),
  ('vesper-glass-body', 'A fragrance that begins like an object and ends like a body.', 'e8a93c3d7d0ea5ac18ee4fc9b3a1d4eafdc70ed8a2829f44e2a5525eb518d602'),
  ('rex-noctis-crown', 'Silence wears the crown.', '8459e675a5eea394e32c3d3cc901f4e901f58e66453b88e5361fbad2aa433390'),
  ('wild-sovereign-refinement', 'Refinement, undomesticated.', 'ff982324a8ffffc4332f0fa1bc50cdaa5327909f93030abb6824a4af6a7e16e7'),
  ('vermillionaire-salt', 'Sunlight, cut with salt.', 'aa982072f1dc0bf4f62385b7011789f25ab2e64f6fb0be7f9a34f7b6d4faaa62'),
  ('sovereign-tide-worlds', 'The sea meets the living floor of the forest.', '90a030a87773c79c6cf5a12673ed1b0446e5cf02f02d611224b08587cccdc960')
on conflict (id) do update
set phrase = excluded.phrase,
    normalized_sha256 = excluded.normalized_sha256,
    status = 'active';

insert into copycat_watch.protected_assets (path, sha256, media_type)
values
  ('assets/crest.webp', '1196e2c8d0816cff0bba37aff57604e59c97ae5aff708e0aebc8c8df535c52b0', 'image/webp'),
  ('assets/wordmark.webp', '0fc403f6a78900a896f43816ea0feeb7105fa4f1d5312df6d8fd162c2716c8b5', 'image/webp'),
  ('assets/rex-noctis.webp', '96302fca251969ab6a3fff115434d28e1b996c93dbfd75bb53a40d9a98c128cf', 'image/webp'),
  ('assets/wild-sovereign.webp', '4b47290ba5eadd1b615e9be28a2f7aca35348e4ea8148b93ef9e2dc2aa251121', 'image/webp'),
  ('assets/vesper-glass-signature.svg', '77caf1a47481a0f617e65e6876b17aa8a948f733f9fa47fee49cc099fdad8154', 'image/svg+xml'),
  ('assets/vermillionaire-signature.svg', '4e8863a88d6d82c3574c606c8640a36842343b28eeff51f124ed1ff9d83d30e4', 'image/svg+xml'),
  ('assets/velvet-jade.webp', '418aa75155986b6170cf6a523482c8ffe6019eb13d6cd970f6cd43624db03faa', 'image/webp')
on conflict (path) do update
set sha256 = excluded.sha256,
    media_type = excluded.media_type,
    status = 'active',
    last_verified_at = now();

insert into copycat_watch.monitored_domains (domain, relationship, status)
values ('arcaneumperfumes.com', 'canonical', 'clear')
on conflict (domain) do update
set relationship = 'canonical',
    status = 'clear',
    last_checked_at = now();

insert into copycat_watch.repository_baselines (repository, commit_sha, tree_sha256)
values (
  'arcaneumperfumes-maker/arcaneum-perfumes-site',
  '18142c1e3b9c1a510141873e1e008773cc060b26',
  '09f752460175ddf6159a8c77ef501f8fc53b3131c89999815c31472e6d935ac4'
)
on conflict (repository, tree_sha256) do nothing;

comment on schema copycat_watch is
  'Private evidence registry for ARCANEUM signature phrases, imagery, lookalike domains, repository baselines, and reviewed findings.';
