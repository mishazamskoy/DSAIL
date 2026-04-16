alter table user_data
  add column if not exists food_points    integer not null default 0,
  add column if not exists knowledge_points integer not null default 0,
  add column if not exists wood_points    integer not null default 0,
  add column if not exists total_points   integer not null default 0,
  add column if not exists activities_count integer not null default 0;
