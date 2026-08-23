-- Evaluate request headers once per statement instead of once per inserted row.

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
