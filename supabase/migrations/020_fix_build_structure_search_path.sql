-- Migration 020: Rewrite build_structure and demolish_structure with
-- set search_path = public.
--
-- Security-definer functions without an explicit search_path inherit the
-- invoker's search_path at call time.  In newer Supabase/PostgreSQL builds the
-- default search_path is '' (empty), which means unqualified table names like
-- "user_data" and "city_structures" are not found and the function raises a
-- "relation does not exist" error — causing every build attempt to silently
-- roll back in the UI.

create or replace function build_structure(
  p_user_id        uuid,
  p_row_idx        integer,
  p_col_idx        integer,
  p_structure_id   text,
  p_food_cost      integer,
  p_knowledge_cost integer,
  p_wood_cost      integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from user_data
    where user_id = p_user_id
      and food_points      >= p_food_cost
      and knowledge_points >= p_knowledge_cost
      and wood_points      >= p_wood_cost
  ) then
    raise exception 'Insufficient resources';
  end if;

  update user_data
  set
    food_points      = food_points      - p_food_cost,
    knowledge_points = knowledge_points - p_knowledge_cost,
    wood_points      = wood_points      - p_wood_cost,
    total_points     = total_points     - (p_food_cost + p_knowledge_cost + p_wood_cost),
    updated_at       = now()
  where user_id = p_user_id;

  insert into city_structures (user_id, row_idx, col_idx, structure_id)
  values (p_user_id, p_row_idx, p_col_idx, p_structure_id);
end;
$$;

create or replace function demolish_structure(
  p_user_id          uuid,
  p_row_idx          integer,
  p_col_idx          integer,
  p_food_refund      integer,
  p_knowledge_refund integer,
  p_wood_refund      integer
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from city_structures
  where user_id = p_user_id and row_idx = p_row_idx and col_idx = p_col_idx;

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
