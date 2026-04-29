-- Fix fried chicken entry: unhealthy food should never earn grain
update activity_logs
set grain_points = 0, total_points = 0
where activity_text ilike '%fried chicken%'
  and grain_points > 0;

-- Recompute every user_data row from activity_logs (the authoritative log).
-- This corrects any discrepancy caused by increment_points calls failing before
-- the function signature was updated to accept the new resource parameters.
update user_data ud
set
  grain_points      = sub.grain,
  happiness_points  = sub.happiness,
  population_points = sub.population,
  money_points      = sub.money,
  total_points      = sub.total,
  activities_count  = sub.cnt,
  -- zero out legacy columns; they are now superseded
  food_points       = 0,
  knowledge_points  = 0,
  wood_points       = 0
from (
  select
    user_id,
    coalesce(sum(grain_points),      0) as grain,
    coalesce(sum(happiness_points),  0) as happiness,
    coalesce(sum(population_points), 0) as population,
    coalesce(sum(money_points),      0) as money,
    coalesce(sum(total_points),      0) as total,
    count(*)                            as cnt
  from activity_logs
  group by user_id
) sub
where ud.user_id = sub.user_id;
