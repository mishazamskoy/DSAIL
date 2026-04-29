-- One-time backfill: map legacy resource columns into the new power-resource columns.
--
-- Mapping rationale:
--   food_points      → grain_points       (healthy eating = grain production)
--   knowledge_points → happiness_points   (learning/meditation = citizen happiness)
--   wood_points      → population_points  (exercise/movement = population growth)
--   money_points: no legacy equivalent — stays at whatever it is already (0)
--
-- We add rather than overwrite so that any points already logged under the new
-- system (if any) are preserved.

update user_data
set
  grain_points      = grain_points      + food_points,
  happiness_points  = happiness_points  + knowledge_points,
  population_points = population_points + wood_points
where
  food_points > 0 or knowledge_points > 0 or wood_points > 0;

-- Same backfill on activity_logs so the history view shows correct badges.
update activity_logs
set
  grain_points      = grain_points      + food_points,
  happiness_points  = happiness_points  + knowledge_points,
  population_points = population_points + wood_points
where
  food_points > 0 or knowledge_points > 0 or wood_points > 0;

-- Zero out the legacy columns so we don't double-count if this runs again.
update user_data
set food_points = 0, knowledge_points = 0, wood_points = 0
where food_points > 0 or knowledge_points > 0 or wood_points > 0;

update activity_logs
set food_points = 0, knowledge_points = 0, wood_points = 0
where food_points > 0 or knowledge_points > 0 or wood_points > 0;
