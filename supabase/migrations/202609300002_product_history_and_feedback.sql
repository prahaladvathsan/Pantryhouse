alter table public.order_items
  add column product_name text check (product_name is null or char_length(trim(product_name)) between 1 and 160),
  add column brand text check (brand is null or char_length(trim(brand)) between 1 and 80),
  add column package_size text check (package_size is null or char_length(trim(package_size)) between 1 and 60),
  add column unit_price_paise bigint check (unit_price_paise is null or unit_price_paise >= 0),
  add column line_total_paise bigint check (line_total_paise is null or line_total_paise >= 0),
  add column feedback smallint not null default 0 check (feedback in (-1, 0, 1));

create index order_items_preference_history_idx
  on public.order_items(household_id, name_key, created_at desc)
  where bought and product_name is not null;

create or replace function public.place_order(
  p_order_id uuid,
  p_total_amount_paise bigint,
  p_participant_ids uuid[],
  p_items jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_item jsonb;
  v_inventory public.inventory_items;
  v_name text;
  v_key text;
  v_quantity numeric;
  v_expiry date;
  v_today date;
  v_count integer;
  v_base bigint;
  v_remainder bigint;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not private.is_household_member(v_order.household_id) then raise exception 'Order not found'; end if;
  if v_order.status <> 'draft' then raise exception 'This order is no longer open'; end if;
  if p_total_amount_paise < 0 then raise exception 'Total cannot be negative'; end if;
  if coalesce(array_length(p_participant_ids, 1), 0) < 1 then raise exception 'Choose at least one participant'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then raise exception 'Add at least one order item'; end if;

  select count(*) into v_count from public.members where household_id = v_order.household_id and id = any(p_participant_ids);
  if v_count <> array_length(p_participant_ids, 1) then raise exception 'Every participant must belong to this household'; end if;
  select (now() at time zone h.timezone)::date into v_today from public.households h where h.id = v_order.household_id;

  delete from public.order_items where order_id = p_order_id;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_name := regexp_replace(trim(v_item->>'name'), '[[:space:]]+', ' ', 'g');
    v_key := private.normalise_name(v_name);
    v_quantity := (v_item->>'quantity')::numeric;
    v_expiry := nullif(v_item->>'expiry_date', '')::date;
    if v_name = '' or v_quantity <= 0 then raise exception 'Every item needs a name and positive quantity'; end if;

    insert into public.order_items(
      household_id, order_id, inventory_item_id, next_order_item_id, name, name_key, quantity, unit,
      category, expiry_date, product_name, brand, package_size, unit_price_paise, line_total_paise,
      bought, source
    ) values (
      v_order.household_id, p_order_id,
      nullif(v_item->>'inventory_item_id', '')::uuid,
      nullif(v_item->>'next_order_item_id', '')::uuid,
      v_name, v_key, v_quantity, v_item->>'unit', coalesce(nullif(v_item->>'category', ''), 'Other'),
      v_expiry,
      nullif(trim(v_item->>'product_name'), ''),
      nullif(trim(v_item->>'brand'), ''),
      nullif(trim(v_item->>'package_size'), ''),
      nullif(v_item->>'unit_price_paise', '')::bigint,
      nullif(v_item->>'line_total_paise', '')::bigint,
      (v_item->>'bought')::boolean,
      (v_item->>'source')::public.order_item_source
    );

    if (v_item->>'bought')::boolean then
      select * into v_inventory from public.inventory_items
      where household_id = v_order.household_id
        and (id = nullif(v_item->>'inventory_item_id', '')::uuid or name_key = v_key)
      order by case when id = nullif(v_item->>'inventory_item_id', '')::uuid then 0 else 1 end
      limit 1;

      if v_inventory.id is null then
        insert into public.inventory_items(
          household_id, name, name_key, category, quantity, unit, expiry_date, is_recurring,
          default_quantity, default_expiry_days
        ) values (
          v_order.household_id, v_name, v_key, coalesce(nullif(v_item->>'category', ''), 'Other'),
          v_quantity, v_item->>'unit', v_expiry, false, v_quantity,
          case when v_expiry is null then null else greatest(1, v_expiry - v_today) end
        );
      else
        update public.inventory_items
        set quantity = case
              when v_inventory.quantity <= 0 or (v_inventory.expiry_date is not null and v_inventory.expiry_date < v_today)
                then v_quantity
              else round(v_inventory.quantity + v_quantity, 2)
            end,
            expiry_date = case
              when v_inventory.quantity <= 0 or (v_inventory.expiry_date is not null and v_inventory.expiry_date < v_today)
                then v_expiry
              when v_inventory.expiry_date is null then v_expiry
              when v_expiry is null then v_inventory.expiry_date
              else least(v_inventory.expiry_date, v_expiry)
            end
        where id = v_inventory.id;
      end if;
    end if;
    v_inventory := null;
  end loop;

  delete from public.next_order_items where locked_order_id = p_order_id;
  delete from public.order_splits where order_id = p_order_id;
  v_count := array_length(p_participant_ids, 1);
  v_base := p_total_amount_paise / v_count;
  v_remainder := p_total_amount_paise % v_count;

  insert into public.order_splits(household_id, order_id, member_id, amount_paise, settled_at)
  select
    v_order.household_id,
    p_order_id,
    m.id,
    v_base + case when row_number() over (order by m.name, m.id) <= v_remainder then 1 else 0 end,
    case when m.id = v_order.placed_by_member_id then now() else null end
  from public.members m
  where m.household_id = v_order.household_id and m.id = any(p_participant_ids)
  order by m.name, m.id;

  update public.orders
  set status = 'placed', total_amount_paise = p_total_amount_paise, placed_at = now()
  where id = p_order_id;

  perform public.sync_next_order(v_order.household_id);
end;
$$;

create or replace function public.rate_order_item(p_order_item_id uuid, p_feedback smallint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_household_id uuid;
begin
  if p_feedback not in (-1, 0, 1) then raise exception 'Feedback must be -1, 0, or 1'; end if;
  select oi.household_id into v_household_id
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = p_order_item_id and o.status = 'placed';
  if v_household_id is null or not private.is_household_member(v_household_id) then raise exception 'Order item not found'; end if;
  update public.order_items set feedback = p_feedback where id = p_order_item_id;
end;
$$;

revoke execute on function public.rate_order_item(uuid, smallint) from public, anon;
grant execute on function public.rate_order_item(uuid, smallint) to authenticated;
