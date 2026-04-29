-- Returns the top 10 users by total_points, with a flag marking the caller.
-- Uses security definer so it can join auth.users for display names without
-- exposing any PII beyond what the user set in their profile.

create or replace function get_leaderboard()
returns table(
  rank         bigint,
  display_name text,
  total_points integer,
  is_me        boolean
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (order by ud.total_points desc)::bigint,
    coalesce(
      nullif(trim(ud.user_name), ''),
      au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'user_name',
      'Anonymous'
    )::text,
    ud.total_points,
    (ud.user_id = auth.uid()) as is_me
  from user_data ud
  join auth.users au on au.id = ud.user_id
  where ud.total_points > 0
  order by ud.total_points desc
  limit 10;
$$;
