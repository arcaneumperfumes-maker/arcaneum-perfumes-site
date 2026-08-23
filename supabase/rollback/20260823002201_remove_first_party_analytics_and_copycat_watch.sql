-- Explicit rollback for 20260823002201_add_first_party_analytics_and_copycat_watch.sql.
-- Running this removes collected analytics and Copycat Watch records.
-- Revert the corresponding website commit first so browsers stop sending events.

begin;

drop view if exists arcaneum_reporting.visitor_summary;
drop view if exists arcaneum_reporting.countries;
drop view if exists arcaneum_reporting.referrers;
drop view if exists arcaneum_reporting.popular_pages;
drop view if exists arcaneum_reporting.daily_traffic;
drop schema if exists arcaneum_reporting;

drop table if exists public.arcaneum_page_views;

drop table if exists copycat_watch.findings;
drop table if exists copycat_watch.monitored_domains;
drop table if exists copycat_watch.repository_baselines;
drop table if exists copycat_watch.protected_assets;
drop table if exists copycat_watch.protected_phrases;
drop schema if exists copycat_watch;

commit;
