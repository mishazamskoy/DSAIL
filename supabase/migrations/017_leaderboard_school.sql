-- Migration 017: Update get_leaderboard() to include school contributions
--
-- School generates: grain +2, happiness +2, money +4
-- Updated formulas:
--   grain      = COUNT(granary) * 10 + COUNT(school) * 2
--   population = 20 + COUNT(house) * 4  (unchanged)
--   happiness  = 10 - FLOOR(population / 4) - GREATEST(population - grain, 0) + COUNT(school) * 2
--   money      = 20 + COUNT(market) * 10 + COUNT(school) * 4 - COUNT(territory cells)
--   power      = GREATEST(grain - population, 0) + happiness + population + money  (unchanged)

drop function if exists get_leaderboard();

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
  with city_metrics as (
    select
      ud.user_id,
      coalesce(s.num_granaries, 0) * 10 + coalesce(s.num_schools, 0) * 2    as grain,
      20 + coalesce(s.num_houses, 0) * 4                                      as population,
      20 + coalesce(s.num_markets, 0) * 10 + coalesce(s.num_schools, 0) * 4
         - coalesce(t.territory_count, 0)                                     as money,
      coalesce(s.num_schools, 0)                                              as num_schools
    from user_data ud
    left join (
      select
        user_id,
        count(*) filter (where structure_id = 'granary') as num_granaries,
        count(*) filter (where structure_id = 'house')   as num_houses,
        count(*) filter (where structure_id = 'market')  as num_markets,
        count(*) filter (where structure_id = 'school')  as num_schools
      from city_structures
      group by user_id
    ) s on s.user_id = ud.user_id
    left join (
      select user_id, count(*) as territory_count
      from city_territory
      group by user_id
    ) t on t.user_id = ud.user_id
  ),
  city_with_happiness as (
    select
      user_id,
      grain::integer,
      population::integer,
      money::integer,
      (10 - floor(population / 4.0) - greatest(population - grain, 0) + num_schools * 2)::integer as happiness
    from city_metrics
  ),
  city_with_power as (
    select
      user_id,
      grain,
      happiness,
      population,
      money,
      (greatest(grain - population, 0) + happiness + population + money)::integer as power
    from city_with_happiness
  )
  select
    row_number() over (order by cwp.power desc)::bigint as rank,
    coalesce(
      nullif(trim(ud.user_name), ''),
      au.raw_user_meta_data->>'full_name',
      au.raw_user_meta_data->>'user_name',
      'Anonymous'
    )::text                                             as display_name,
    cwp.power,
    cwp.grain,
    cwp.happiness,
    cwp.population,
    cwp.money,
    (ud.user_id = auth.uid())                           as is_me
  from city_with_power cwp
  join user_data ud on ud.user_id = cwp.user_id
  join auth.users au on au.id = ud.user_id
  order by cwp.power desc
  limit 10;
$$;
