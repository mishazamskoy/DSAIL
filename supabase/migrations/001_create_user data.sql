create table user_data (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid        not null references auth.users on delete cascade,
  user_name     text,
  "e-mail_address" text,
  birth_date    date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

alter table user_data enable row level security;

create policy "users can select own data"
  on user_data for select
  using (auth.uid() = user_id);

create policy "users can insert own data"
  on user_data for insert
  with check (auth.uid() = user_id);

create policy "users can update own data"
  on user_data for update
  using (auth.uid() = user_id);

create policy "users can delete own data"
  on user_data for delete
  using (auth.uid() = user_id);
