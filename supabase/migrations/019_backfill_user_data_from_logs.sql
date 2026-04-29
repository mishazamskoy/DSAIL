-- Migration 019: Backfill user_data from activity_logs
--
-- Before migration 018 added the UNIQUE constraint on user_data.user_id,
-- the upsert in evaluate-activity silently failed for new accounts, so
-- increment_points updated 0 rows and user_data remained empty even though
-- activity_logs recorded the correct points.
--
-- Fix:
--   1. Create user_data rows for any users who have activity_logs but no row yet.
--   2. Recalculate every user_data row from its activity_logs.

-- Step 1: Insert missing user_data rows
INSERT INTO user_data (user_id)
SELECT DISTINCT al.user_id
FROM activity_logs al
LEFT JOIN user_data ud ON ud.user_id = al.user_id
WHERE ud.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Recalculate food/knowledge/wood from activity_logs (authoritative source)
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
