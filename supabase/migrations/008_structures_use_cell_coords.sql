-- Add cell coordinate columns alongside the old slot_id
alter table city_structures
  add column row_idx integer,
  add column col_idx integer;

-- Migrate existing slot data to cell coordinates (top-left cell of each 2×2 slot)
update city_structures set row_idx =  2, col_idx =  2 where slot_id = 0;
update city_structures set row_idx =  2, col_idx =  7 where slot_id = 1;
update city_structures set row_idx =  2, col_idx =  9 where slot_id = 2;
update city_structures set row_idx =  2, col_idx = 13 where slot_id = 3;
update city_structures set row_idx =  6, col_idx =  2 where slot_id = 4;
update city_structures set row_idx =  9, col_idx =  2 where slot_id = 5;
update city_structures set row_idx =  6, col_idx = 13 where slot_id = 6;
update city_structures set row_idx =  9, col_idx = 13 where slot_id = 7;
update city_structures set row_idx = 13, col_idx =  2 where slot_id = 8;
update city_structures set row_idx = 13, col_idx = 13 where slot_id = 9;

-- Make the new columns required and unique
alter table city_structures
  alter column row_idx set not null,
  alter column col_idx set not null;

alter table city_structures
  add constraint city_structures_user_cell unique(user_id, row_idx, col_idx);

-- Drop the old slot_id constraint and column
alter table city_structures drop constraint city_structures_user_id_slot_id_key;
alter table city_structures drop column slot_id;

-- Rebuild build_structure to use row/col
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

-- Rebuild demolish_structure to use row/col
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
