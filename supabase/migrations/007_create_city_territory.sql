create table city_territory (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid references auth.users on delete cascade not null,
  row_idx   integer not null,
  col_idx   integer not null,
  bought_at timestamptz not null default now(),
  unique(user_id, row_idx, col_idx)
);

alter table city_territory enable row level security;

create policy "select own territory"
  on city_territory for select using (auth.uid() = user_id);

create policy "insert own territory"
  on city_territory for insert with check (auth.uid() = user_id);
