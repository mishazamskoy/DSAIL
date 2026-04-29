-- Migration 021: Re-sync user_data totals from activity_logs
--
-- The evaluate-activity edge function was using the anon-key Supabase client
-- to call increment_points. In some Supabase configurations this silently
-- failed (RLS or auth-context issue), so points were logged in activity_logs
-- but never written to user_data.
--
-- The function now uses the service-role key, which always bypasses RLS.
-- This migration recalculates every user's resource totals from activity_logs
-- to fix any accounts that were affected.

-- Step 1: Ensure every user who has activity_logs has a user_data row
INSERT INTO user_data (user_id)
SELECT DISTINCT al.user_id
FROM activity_logs al
LEFT JOIN user_data ud ON ud.user_id = al.user_id
WHERE ud.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

-- Step 2: Recalculate food/knowledge/wood from activity_logs
--         (grain/happiness/population/money are derived from structures, not logs)
UPDATE user_data ud
SET
  food_points       = sub.food,
  knowledge_points  = sub.knowledge,
  wood_points       = sub.wood,
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
