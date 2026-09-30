alter table public.orders
  add column assistant_capture_received_at timestamptz,
  add column assistant_capture_total_amount_paise bigint
    check (assistant_capture_total_amount_paise is null or assistant_capture_total_amount_paise >= 0);

create table private.order_handoff_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index order_handoff_tokens_order_idx
  on private.order_handoff_tokens(order_id, expires_at desc);

revoke all on private.order_handoff_tokens from public, anon, authenticated;

create or replace function public.create_order_handoff(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders;
  v_token text := encode(extensions.gen_random_bytes(32), 'hex');
  v_expires_at timestamptz := now() + interval '2 hours';
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or not private.is_household_member(v_order.household_id) then
    raise exception 'Order not found';
  end if;
  if v_order.status <> 'draft' then
    raise exception 'This order is no longer open';
  end if;

  delete from private.order_handoff_tokens
  where order_id = p_order_id and (expires_at <= now() or used_at is not null);

  insert into private.order_handoff_tokens(order_id, token_hash, expires_at)
  values (p_order_id, encode(extensions.digest(v_token, 'sha256'), 'hex'), v_expires_at);

  return jsonb_build_object(
    'orderId', p_order_id,
    'code', v_token,
    'expiresAt', v_expires_at
  );
end;
$$;

create or replace function public.submit_order_capture(
  p_order_id uuid,
  p_code text,
  p_total_amount_paise bigint,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_handoff private.order_handoff_tokens;
  v_order public.orders;
  v_item jsonb;
  v_template public.order_items;
  v_requested_item_id uuid;
  v_used_item_ids uuid[] := array[]::uuid[];
  v_name text;
  v_product_name text;
  v_brand text;
  v_package_size text;
  v_unit text;
  v_quantity numeric;
  v_unit_price_paise bigint;
  v_line_total_paise bigint;
  v_item_count integer;
  v_received_at timestamptz := now();
begin
  if p_code is null or p_code !~ '^[0-9a-f]{64}$' then
    raise exception 'This Pantryhouse order code is invalid or expired';
  end if;

  select * into v_handoff
  from private.order_handoff_tokens
  where order_id = p_order_id
    and token_hash = encode(extensions.digest(p_code, 'sha256'), 'hex')
  for update;

  if v_handoff.id is null then
    raise exception 'This Pantryhouse order code is invalid or expired';
  end if;

  if v_handoff.used_at is not null then
    select * into v_order from public.orders where id = p_order_id;
    return jsonb_build_object(
      'orderId', p_order_id,
      'receivedAt', v_order.assistant_capture_received_at,
      'itemCount', (select count(*) from public.order_items where order_id = p_order_id and bought and product_name is not null),
      'alreadyReceived', true
    );
  end if;

  if v_handoff.expires_at <= now() then
    raise exception 'This Pantryhouse order code has expired. Open Claude again from Pantryhouse for a fresh code';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if v_order.id is null or v_order.status <> 'draft' then
    raise exception 'This Pantryhouse order is no longer open';
  end if;
  if p_total_amount_paise is not null and (p_total_amount_paise < 0 or p_total_amount_paise > 100000000000) then
    raise exception 'Order total is outside the accepted range';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 100 then
    raise exception 'Send between 1 and 100 selected products';
  end if;

  update public.order_items
  set product_name = null,
      brand = null,
      package_size = null,
      unit_price_paise = null,
      line_total_paise = null,
      bought = false
  where order_id = p_order_id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_requested_item_id := nullif(v_item->>'requested_item_id', '')::uuid;
    v_name := regexp_replace(trim(coalesce(v_item->>'requested_name', '')), '[[:space:]]+', ' ', 'g');
    v_product_name := regexp_replace(trim(coalesce(v_item->>'product_name', '')), '[[:space:]]+', ' ', 'g');
    v_brand := nullif(regexp_replace(trim(v_item->>'brand'), '[[:space:]]+', ' ', 'g'), '');
    v_package_size := nullif(regexp_replace(trim(v_item->>'package_size'), '[[:space:]]+', ' ', 'g'), '');
    v_quantity := (v_item->>'quantity')::numeric;
    v_unit := regexp_replace(trim(coalesce(v_item->>'unit', '')), '[[:space:]]+', ' ', 'g');
    v_unit_price_paise := nullif(v_item->>'unit_price_paise', '')::bigint;
    v_line_total_paise := nullif(v_item->>'line_total_paise', '')::bigint;

    if v_name = '' or char_length(v_name) > 80 then raise exception 'Every product needs a valid requested item name'; end if;
    if v_product_name = '' or char_length(v_product_name) > 160 then raise exception 'Every product needs a valid exact product name'; end if;
    if v_brand is not null and char_length(v_brand) > 80 then raise exception 'A product brand is too long'; end if;
    if v_package_size is not null and char_length(v_package_size) > 60 then raise exception 'A package size is too long'; end if;
    if v_quantity is null or v_quantity <= 0 or v_quantity > 100000 then raise exception 'Every product needs a valid positive quantity'; end if;
    if v_unit = '' or char_length(v_unit) > 20 then raise exception 'Every product needs a valid unit'; end if;
    if v_unit_price_paise is not null and (v_unit_price_paise < 0 or v_unit_price_paise > 100000000000) then raise exception 'A unit price is outside the accepted range'; end if;
    if v_line_total_paise is not null and (v_line_total_paise < 0 or v_line_total_paise > 100000000000) then raise exception 'A line total is outside the accepted range'; end if;

    v_template := null;
    if v_requested_item_id is not null then
      select * into v_template
      from public.order_items
      where id = v_requested_item_id and order_id = p_order_id;
      if v_template.id is null then raise exception 'A requested item does not belong to this order'; end if;
    end if;

    if v_template.id is not null and not (v_template.id = any(v_used_item_ids)) then
      update public.order_items
      set quantity = v_quantity,
          unit = v_unit,
          product_name = v_product_name,
          brand = v_brand,
          package_size = v_package_size,
          unit_price_paise = v_unit_price_paise,
          line_total_paise = v_line_total_paise,
          bought = true
      where id = v_template.id;
      v_used_item_ids := array_append(v_used_item_ids, v_template.id);
    else
      insert into public.order_items(
        household_id, order_id, inventory_item_id, next_order_item_id, name, name_key,
        quantity, unit, category, expiry_date, product_name, brand, package_size,
        unit_price_paise, line_total_paise, bought, source
      )
      select
        v_order.household_id,
        p_order_id,
        case when v_template.id is null then null else v_template.inventory_item_id end,
        null,
        case when v_template.id is null then v_name else v_template.name end,
        case when v_template.id is null then private.normalise_name(v_name) else v_template.name_key end,
        v_quantity,
        v_unit,
        case when v_template.id is null then 'Other' else v_template.category end,
        case
          when v_template.id is not null then v_template.expiry_date
          else ((now() at time zone h.timezone)::date + h.default_expiry_days)
        end,
        v_product_name,
        v_brand,
        v_package_size,
        v_unit_price_paise,
        v_line_total_paise,
        true,
        case when v_template.id is null then 'ad_hoc'::public.order_item_source else v_template.source end
      
      from public.households h
      where h.id = v_order.household_id;
    end if;
  end loop;

  select count(*) into v_item_count
  from public.order_items
  where order_id = p_order_id and bought and product_name is not null;

  update public.orders
  set assistant_capture_received_at = v_received_at,
      assistant_capture_total_amount_paise = p_total_amount_paise,
      updated_at = v_received_at
  where id = p_order_id;

  update private.order_handoff_tokens set used_at = v_received_at where id = v_handoff.id;
  delete from private.order_handoff_tokens where order_id = p_order_id and id <> v_handoff.id;

  return jsonb_build_object(
    'orderId', p_order_id,
    'receivedAt', v_received_at,
    'itemCount', v_item_count,
    'alreadyReceived', false
  );
end;
$$;

create or replace function private.remove_closed_order_handoffs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'draft' and new.status <> 'draft' then
    delete from private.order_handoff_tokens where order_id = new.id;
  end if;
  return new;
end;
$$;

create trigger orders_remove_closed_handoffs
after update of status on public.orders
for each row execute function private.remove_closed_order_handoffs();

revoke all on function public.create_order_handoff(uuid) from public, anon;
grant execute on function public.create_order_handoff(uuid) to authenticated;

revoke all on function public.submit_order_capture(uuid, text, bigint, jsonb) from public, anon, authenticated;
grant execute on function public.submit_order_capture(uuid, text, bigint, jsonb) to service_role;

revoke all on function private.remove_closed_order_handoffs() from public, anon, authenticated;
