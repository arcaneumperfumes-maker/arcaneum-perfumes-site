-- Make the private Copycat Watch service-role access model explicit to RLS advisors.

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
