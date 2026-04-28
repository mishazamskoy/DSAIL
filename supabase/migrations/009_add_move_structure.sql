-- Move a structure from one cell to another (no resource cost)
create or replace function move_structure(
  p_user_id   uuid,
  p_from_row  integer,
  p_from_col  integer,
  p_to_row    integer,
  p_to_col    integer
) returns void
language plpgsql
security definer
as $$
begin
  update city_structures
  set row_idx = p_to_row, col_idx = p_to_col
  where user_id = p_user_id
    and row_idx  = p_from_row
    and col_idx  = p_from_col;

  if not found then
    raise exception 'Structure not found at (%, %)', p_from_row, p_from_col;
  end if;
end;
$$;
