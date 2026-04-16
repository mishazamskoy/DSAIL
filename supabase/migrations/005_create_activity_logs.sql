create table activity_logs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid references auth.users on delete cascade not null,
  activity_text    text not null,
  food_points      integer not null default 0,
  knowledge_points integer not null default 0,
  wood_points      integer not null default 0,
  total_points     integer not null default 0,
  logged_at        timestamptz not null default now()
);

alter table activity_logs enable row level security;

create policy "select own activity logs"
  on activity_logs for select using (auth.uid() = user_id);

create policy "insert own activity logs"
  on activity_logs for insert with check (auth.uid() = user_id);
