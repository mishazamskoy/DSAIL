-- Migration 022: Add award_activity_points function
--
-- Replaces the brittle two-step pattern in evaluate-activity:
--   1. upsert user_data row   (ensure it exists)
--   2. rpc increment_points   (add the earned points)
--
-- A single INSERT … ON CONFLICT DO UPDATE handles both cases atomically:
-- if no row exists it inserts with the earned values; if one exists it
-- increments in place.  Running as SECURITY DEFINER with set search_path
-- means it always resolves the table name and bypasses RLS.

CREATE OR REPLACE FUNCTION award_activity_points(
  p_user_id    uuid,
  p_food       integer,
  p_knowledge  integer,
  p_wood       integer,
  p_total      integer
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO user_data (user_id, food_points, knowledge_points, wood_points, total_points, activities_count)
  VALUES (p_user_id, p_food, p_knowledge, p_wood, p_total, 1)
  ON CONFLICT (user_id) DO UPDATE SET
    food_points      = user_data.food_points      + EXCLUDED.food_points,
    knowledge_points = user_data.knowledge_points + EXCLUDED.knowledge_points,
    wood_points      = user_data.wood_points      + EXCLUDED.wood_points,
    total_points     = user_data.total_points     + EXCLUDED.total_points,
    activities_count = user_data.activities_count + 1,
    updated_at       = now();
$$;
