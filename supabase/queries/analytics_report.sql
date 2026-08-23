-- Run in Supabase SQL Editor as an owner to review ARCANEUM traffic.
-- Public website roles cannot read these views or the underlying event table.

select *
from arcaneum_reporting.daily_traffic
where day >= current_date - 30
order by day desc;

select *
from arcaneum_reporting.popular_pages
order by page_views desc, path
limit 25;

select *
from arcaneum_reporting.referrers
order by page_views desc, referrer_source, referrer_host nulls first
limit 25;

select *
from arcaneum_reporting.countries
order by page_views desc, country_code;

select
  count(*) as known_visitors,
  count(*) filter (where has_returned) as returning_visitors,
  sum(page_views) as page_views,
  sum(sessions) as sessions
from arcaneum_reporting.visitor_summary;
