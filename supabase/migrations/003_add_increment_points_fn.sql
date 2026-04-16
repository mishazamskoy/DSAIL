create or replace function increment_points(
  p_user_id       uuid,
  p_food          integer,
  p_knowledge     integer,
  p_wood          integer,
  p_total         integer
) returns void
language sql
security definer
as $$
  update user_data
  set
    food_points       = food_points       + p_food,
    knowledge_points  = knowledge_points  + p_knowledge,
    wood_points       = wood_points       + p_wood,
    total_points      = total_points      + p_total,
    activities_count  = activities_count  + 1,
    updated_at        = now()
  where user_id = p_user_id;
$$;
