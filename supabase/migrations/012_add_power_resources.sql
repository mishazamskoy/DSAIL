-- Add the four power-resource columns to user_data
alter table user_data
  add column if not exists grain_points      integer not null default 0,
  add column if not exists happiness_points  integer not null default 0,
  add column if not exists population_points integer not null default 0,
  add column if not exists money_points      integer not null default 0;

-- Add matching columns to activity_logs so history can show them
alter table activity_logs
  add column if not exists grain_points      integer not null default 0,
  add column if not exists happiness_points  integer not null default 0,
  add column if not exists population_points integer not null default 0,
  add column if not exists money_points      integer not null default 0;

-- Replace increment_points with a version that handles both old and new resources.
-- Old params still default to 0 so callers that haven't upgraded yet don't break.
create or replace function increment_points(
  p_user_id    uuid,
  p_food       integer default 0,
  p_knowledge  integer default 0,
  p_wood       integer default 0,
  p_total      integer default 0,
  p_grain      integer default 0,
  p_happiness  integer default 0,
  p_population integer default 0,
  p_money      integer default 0
) returns void
language sql
security definer
set search_path = public
as $$
  update user_data set
    food_points        = food_points        + p_food,
    knowledge_points   = knowledge_points   + p_knowledge,
    wood_points        = wood_points        + p_wood,
    total_points       = total_points       + p_total,
    grain_points       = grain_points       + p_grain,
    happiness_points   = happiness_points   + p_happiness,
    population_points  = population_points  + p_population,
    money_points       = money_points       + p_money,
    activities_count   = activities_count   + 1
  where user_id = p_user_id;
$$;

-- Drop old leaderboard function first (return type is changing)
drop function if exists get_leaderboard();

-- Replace get_leaderboard to rank by Power.
--
-- Power formula:
--   power = GREATEST(grain - population, 0) + happiness + population + money
--
-- Intuition:
--   • Surplus grain (grain > population) contributes directly.
--   • When grain < population the surplus term is 0 — a shortage hurts.
--   • Happiness and money always add to power unconditionally.
--   • Population always adds, but only benefits power fully when grain covers it.
create or replace function get_leaderboard()
returns table(
  rank          bigint,
  display_name  text,
  power         integer,
  grain         integer,
  happiness     integer,
  population    integer,
  money         integer,
  is_me         boolean
)
language sql
security definer
set search_path = public
as $$
  select
    row_number() over (
      order by
        greatest(ud.grain_points - ud.population_points, 0)
        + ud.happiness_points
        + ud.population_points
        + ud.money_points
      desc
    )::bigint                                                                   as rank,
    coalesce(
      nullif(trim(ud.user_name), ''),
      au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'user_name',
      'Anonymous'
    )::text                                                                     as display_name,
    (
      greatest(ud.grain_points - ud.population_points, 0)
      + ud.happiness_points
      + ud.population_points
      + ud.money_points
    )                                                                           as power,
    ud.grain_points                                                             as grain,
    ud.happiness_points                                                         as happiness,
    ud.population_points                                                        as population,
    ud.money_points                                                             as money,
    (ud.user_id = auth.uid())                                                   as is_me
  from user_data ud
  join auth.users au on au.id = ud.user_id
  where (
    ud.grain_points + ud.happiness_points + ud.population_points + ud.money_points
    + ud.total_points
  ) > 0
  order by 3 desc
  limit 10;
$$;
