-- Tracks user road modifications:
--   placed = true  → user placed a road on an originally-empty cell
--   placed = false → user demolished a road that was part of the original city layout
create table city_roads (
  user_id   uuid references auth.users on delete cascade not null,
  row_idx   integer not null,
  col_idx   integer not null,
  placed    boolean not null,
  primary key (user_id, row_idx, col_idx)
);

alter table city_roads enable row level security;

create policy "select own roads"
  on city_roads for select using (auth.uid() = user_id);

create policy "insert own roads"
  on city_roads for insert with check (auth.uid() = user_id);

create policy "update own roads"
  on city_roads for update using (auth.uid() = user_id);

create policy "delete own roads"
  on city_roads for delete using (auth.uid() = user_id);
