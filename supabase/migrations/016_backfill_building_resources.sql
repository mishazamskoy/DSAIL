-- Migration 016: Backfill building resources
-- Previously, activities incorrectly stored earned points in grain/happiness/population columns.
-- The correct architecture is:
--   food/knowledge/wood = building resources, earned from activities
--   grain/happiness/population/money = city simulation metrics, computed from structures
--
-- This migration converts the misrouted data back into food/knowledge/wood.

-- Step 1: Merge incorrectly-stored grain→food, happiness→knowledge, population→wood in activity_logs
UPDATE activity_logs
SET
  food_points       = food_points + grain_points,
  knowledge_points  = knowledge_points + happiness_points,
  wood_points       = wood_points + population_points,
  total_points      = food_points + knowledge_points + wood_points + grain_points + happiness_points + population_points,
  grain_points      = 0,
  happiness_points  = 0,
  population_points = 0,
  money_points      = 0
WHERE grain_points > 0 OR happiness_points > 0 OR population_points > 0;

-- Step 2: Recompute user_data building resources from activity_logs (authoritative source)
UPDATE user_data ud
SET
  food_points       = sub.food,
  knowledge_points  = sub.knowledge,
  wood_points       = sub.wood,
  grain_points      = 0,
  happiness_points  = 0,
  population_points = 0,
  money_points      = 0,
  total_points      = sub.total,
  activities_count  = sub.cnt
FROM (
  SELECT
    user_id,
    COALESCE(SUM(food_points),      0) AS food,
    COALESCE(SUM(knowledge_points), 0) AS knowledge,
    COALESCE(SUM(wood_points),      0) AS wood,
    COALESCE(SUM(total_points),     0) AS total,
    COUNT(*)                           AS cnt
  FROM activity_logs
  GROUP BY user_id
) sub
WHERE ud.user_id = sub.user_id;
