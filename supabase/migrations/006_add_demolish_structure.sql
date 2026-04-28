-- Allow users to delete their own structures (needed for demolish)
create policy "delete own structures"
  on city_structures for delete using (auth.uid() = user_id);

-- Atomic: delete structure and refund resources (80% calculated by caller)
create or replace function demolish_structure(
  p_user_id          uuid,
  p_slot_id          integer,
  p_food_refund      integer,
  p_knowledge_refund integer,
  p_wood_refund      integer
) returns void
language plpgsql
security definer
as $$
begin
  delete from city_structures
  where user_id = p_user_id and slot_id = p_slot_id;

  update user_data
  set
    food_points      = food_points      + p_food_refund,
    knowledge_points = knowledge_points + p_knowledge_refund,
    wood_points      = wood_points      + p_wood_refund,
    total_points     = total_points     + (p_food_refund + p_knowledge_refund + p_wood_refund),
    updated_at       = now()
  where user_id = p_user_id;
end;
$$;
