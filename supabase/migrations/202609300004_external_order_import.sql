create or replace function public.start_import_order(p_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_member_id uuid;
begin
  if not private.is_household_member(p_household_id) then
    raise exception 'Household access denied';
  end if;

  select id into v_order_id
  from public.orders
  where household_id = p_household_id and status = 'draft'
  limit 1;

  if v_order_id is not null then
    return v_order_id;
  end if;

  v_member_id := private.current_member_id(p_household_id);
  insert into public.orders(household_id, placed_by_member_id)
  values (p_household_id, v_member_id)
  returning id into v_order_id;

  return v_order_id;
end;
$$;

revoke all on function public.start_import_order(uuid) from public, anon;
grant execute on function public.start_import_order(uuid) to authenticated;
