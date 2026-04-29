-- Migration 018: Add UNIQUE constraint on user_data.user_id
--
-- The original CREATE TABLE omitted a UNIQUE constraint on user_id, so any
-- supabase.from('user_data').upsert({ user_id }, { onConflict: 'user_id' })
-- call would error (no matching unique/exclusion constraint for ON CONFLICT).
-- For new accounts this meant the user_data row was never created, so
-- build_structure's resource check always failed.
--
-- Step 1: Remove any duplicate rows (keep highest total_points per user).
DELETE FROM user_data
WHERE id NOT IN (
  SELECT DISTINCT ON (user_id) id
  FROM user_data
  ORDER BY user_id, total_points DESC, created_at ASC
);

-- Step 2: Add the unique constraint.
ALTER TABLE user_data
  ADD CONSTRAINT user_data_user_id_key UNIQUE (user_id);
