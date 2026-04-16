-- Stores built structures per user per slot
create table city_structures (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users on delete cascade not null,
  slot_id      integer not null,
  structure_id text not null,
  built_at     timestamptz not null default now(),
  unique(user_id, slot_id)
);

alter table city_structures enable row level security;

create policy "select own structures"
  on city_structures for select using (auth.uid() = user_id);

create policy "insert own structures"
  on city_structures for insert with check (auth.uid() = user_id);

-- Atomic: verify resources, deduct them, insert structure
create or replace function build_structure(
  p_user_id      uuid,
  p_slot_id      integer,
  p_structure_id text,
  p_food_cost    integer,
  p_knowledge_cost integer,
  p_wood_cost    integer
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
    food_points       = food_points       - p_food_cost,
    knowledge_points  = knowledge_points  - p_knowledge_cost,
    wood_points       = wood_points       - p_wood_cost,
    total_points      = total_points      - (p_food_cost + p_knowledge_cost + p_wood_cost),
    updated_at        = now()
  where user_id = p_user_id;

  insert into city_structures (user_id, slot_id, structure_id)
  values (p_user_id, p_slot_id, p_structure_id);
end;
$$;
