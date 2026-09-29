create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 2 and 60),
  invite_token_hash text not null unique,
  timezone text not null default 'Asia/Kolkata',
  default_expiry_days integer not null default 7 check (default_expiry_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  name_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name_key)
);

create table public.member_sessions (
  auth_user_id uuid primary key,
  household_id uuid not null references public.households(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (auth_user_id, household_id)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  name_key text not null,
  category text not null default 'Other' check (char_length(trim(category)) between 1 and 40),
  quantity numeric(12,2) not null default 0 check (quantity >= 0),
  unit text not null default 'pcs' check (char_length(trim(unit)) between 1 and 20),
  expiry_date date,
  is_recurring boolean not null default false,
  default_quantity numeric(12,2) not null default 1 check (default_quantity > 0),
  default_expiry_days integer check (default_expiry_days between 1 and 3650),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, name_key)
);

create type public.order_status as enum ('draft', 'placed', 'cancelled');
create type public.order_item_source as enum ('next_order', 'ad_hoc');

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  status public.order_status not null default 'draft',
  placed_by_member_id uuid not null references public.members(id),
  total_amount_paise bigint check (total_amount_paise is null or total_amount_paise >= 0),
  started_at timestamptz not null default now(),
  placed_at timestamptz,
  cancelled_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index one_active_order_per_household
  on public.orders(household_id)
  where status = 'draft';

create table public.next_order_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  name_key text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null check (char_length(trim(unit)) between 1 and 20),
  source_auto boolean not null default false,
  source_manual boolean not null default false,
  dismissed boolean not null default false,
  locked_order_id uuid references public.orders(id) on delete set null,
  added_by_member_id uuid references public.members(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (source_auto or source_manual)
);

create unique index one_open_next_order_name
  on public.next_order_items(household_id, name_key)
  where locked_order_id is null;

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  inventory_item_id uuid references public.inventory_items(id) on delete set null,
  next_order_item_id uuid references public.next_order_items(id) on delete set null,
  name text not null,
  name_key text not null,
  quantity numeric(12,2) not null check (quantity > 0),
  unit text not null,
  category text not null default 'Other',
  expiry_date date,
  bought boolean not null default true,
  source public.order_item_source not null default 'next_order',
  created_at timestamptz not null default now()
);

create table public.order_splits (
  household_id uuid not null references public.households(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  amount_paise bigint not null check (amount_paise >= 0),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (order_id, member_id)
);

create index inventory_household_idx on public.inventory_items(household_id);
create index next_order_household_idx on public.next_order_items(household_id);
create index orders_household_idx on public.orders(household_id, started_at desc);
create index order_items_order_idx on public.order_items(order_id);
create index order_splits_order_idx on public.order_splits(order_id);
create index member_sessions_member_idx on public.member_sessions(member_id);

create or replace function private.normalise_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(p_value), '[[:space:]]+', ' ', 'g'))
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.normalise_named_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.name := regexp_replace(trim(new.name), '[[:space:]]+', ' ', 'g');
  new.name_key := private.normalise_name(new.name);
  return new;
end;
$$;

create trigger households_touch before update on public.households
for each row execute function private.touch_updated_at();
create trigger members_normalise before insert or update of name on public.members
for each row execute function private.normalise_named_row();
create trigger members_touch before update on public.members
for each row execute function private.touch_updated_at();
create trigger inventory_normalise before insert or update of name on public.inventory_items
for each row execute function private.normalise_named_row();
create trigger inventory_touch before update on public.inventory_items
for each row execute function private.touch_updated_at();
create trigger next_order_normalise before insert or update of name on public.next_order_items
for each row execute function private.normalise_named_row();
create trigger next_order_touch before update on public.next_order_items
for each row execute function private.touch_updated_at();
create trigger orders_touch before update on public.orders
for each row execute function private.touch_updated_at();

create or replace function private.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ms.household_id
  from public.member_sessions ms
  where ms.auth_user_id = (select auth.uid())
$$;

create or replace function private.current_member_id(p_household_id uuid default null)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ms.member_id
  from public.member_sessions ms
  where ms.auth_user_id = (select auth.uid())
    and (p_household_id is null or ms.household_id = p_household_id)
  limit 1
$$;

create or replace function private.is_household_member(p_household_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.member_sessions ms
    where ms.auth_user_id = (select auth.uid()) and ms.household_id = p_household_id
  )
$$;

alter table public.households enable row level security;
alter table public.members enable row level security;
alter table public.member_sessions enable row level security;
alter table public.inventory_items enable row level security;
alter table public.next_order_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_splits enable row level security;

create policy household_member_select on public.households for select to authenticated
using (id in (select private.user_household_ids()));

create policy member_household_select on public.members for select to authenticated
using (household_id in (select private.user_household_ids()));

create policy own_session_select on public.member_sessions for select to authenticated
using (auth_user_id = (select auth.uid()));

create policy inventory_member_all on public.inventory_items for all to authenticated
using (household_id in (select private.user_household_ids()))
with check (household_id in (select private.user_household_ids()));
create policy next_order_member_all on public.next_order_items for all to authenticated
using (household_id in (select private.user_household_ids()))
with check (household_id in (select private.user_household_ids()));
create policy orders_member_select on public.orders for select to authenticated
using (household_id in (select private.user_household_ids()));
create policy order_items_member_select on public.order_items for select to authenticated
using (household_id in (select private.user_household_ids()));
create policy order_splits_member_select on public.order_splits for select to authenticated
using (household_id in (select private.user_household_ids()));

create or replace function public.current_household_context()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'household', to_jsonb(h),
    'member', to_jsonb(m)
  )
  from public.member_sessions ms
  join public.households h on h.id = ms.household_id
  join public.members m on m.id = ms.member_id
  where ms.auth_user_id = (select auth.uid())
  limit 1
$$;

create or replace function public.create_household(p_household_name text, p_member_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_member public.members;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if v_user_id is null then raise exception 'Sign in before creating a household'; end if;
  if exists (select 1 from public.member_sessions where auth_user_id = v_user_id) then
    raise exception 'This browser already belongs to a household';
  end if;

  insert into public.households(name, invite_token_hash)
  values (regexp_replace(trim(p_household_name), '[[:space:]]+', ' ', 'g'), encode(extensions.digest(v_token, 'sha256'), 'hex'))
  returning * into v_household;

  insert into public.members(household_id, name, name_key)
  values (v_household.id, p_member_name, private.normalise_name(p_member_name))
  returning * into v_member;

  insert into public.member_sessions(auth_user_id, household_id, member_id)
  values (v_user_id, v_household.id, v_member.id);

  return jsonb_build_object(
    'context', jsonb_build_object('household', to_jsonb(v_household), 'member', to_jsonb(v_member)),
    'inviteToken', v_token
  );
end;
$$;

create or replace function public.preview_household_invite(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_household public.households;
  v_members jsonb;
begin
  if auth.uid() is null then raise exception 'Sign in before opening an invite'; end if;
  select * into v_household from public.households
  where invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_household.id is null then raise exception 'This invite link is no longer valid'; end if;
  select coalesce(jsonb_agg(to_jsonb(m) order by m.name), '[]'::jsonb)
  into v_members from public.members m where m.household_id = v_household.id;
  return jsonb_build_object('household_id', v_household.id, 'household_name', v_household.name, 'members', v_members);
end;
$$;

create or replace function public.join_household(p_token text, p_member_id uuid default null, p_member_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_household public.households;
  v_member public.members;
begin
  if v_user_id is null then raise exception 'Sign in before joining'; end if;
  if exists (select 1 from public.member_sessions where auth_user_id = v_user_id) then
    return public.current_household_context();
  end if;
  select * into v_household from public.households
  where invite_token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex');
  if v_household.id is null then raise exception 'This invite link is no longer valid'; end if;

  if p_member_id is not null then
    select * into v_member from public.members where id = p_member_id and household_id = v_household.id;
    if v_member.id is null then raise exception 'That household member was not found'; end if;
  else
    if nullif(trim(p_member_name), '') is null then raise exception 'Enter your name'; end if;
    insert into public.members(household_id, name, name_key)
    values (v_household.id, p_member_name, private.normalise_name(p_member_name))
    returning * into v_member;
  end if;

  insert into public.member_sessions(auth_user_id, household_id, member_id)
  values (v_user_id, v_household.id, v_member.id);
  return jsonb_build_object('household', to_jsonb(v_household), 'member', to_jsonb(v_member));
end;
$$;

create or replace function public.rotate_household_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household_id uuid;
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  select household_id into v_household_id from public.member_sessions where auth_user_id = auth.uid() limit 1;
  if v_household_id is null then raise exception 'Join a household first'; end if;
  update public.households set invite_token_hash = encode(extensions.digest(v_token, 'sha256'), 'hex') where id = v_household_id;
  return v_token;
end;
$$;

create or replace function private.sync_inventory_item(p_inventory_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.inventory_items;
  v_existing public.next_order_items;
  v_today date;
  v_eligible boolean;
begin
  select * into v_item from public.inventory_items where id = p_inventory_id;
  if v_item.id is null then return; end if;
  select (now() at time zone h.timezone)::date into v_today from public.households h where h.id = v_item.household_id;
  v_eligible := v_item.is_recurring and (v_item.quantity <= 0 or (v_item.expiry_date is not null and v_item.expiry_date < v_today));

  select * into v_existing from public.next_order_items
  where household_id = v_item.household_id and name_key = v_item.name_key and locked_order_id is null limit 1;

  if v_eligible then
    if exists (
      select 1 from public.next_order_items n
      join public.orders o on o.id = n.locked_order_id and o.status = 'draft'
      where n.household_id = v_item.household_id and n.name_key = v_item.name_key
    ) then return; end if;
    if v_existing.id is null then
      insert into public.next_order_items(household_id, inventory_item_id, name, name_key, quantity, unit, source_auto, source_manual)
      values (v_item.household_id, v_item.id, v_item.name, v_item.name_key, v_item.default_quantity, v_item.unit, true, false);
    else
      update public.next_order_items
      set source_auto = true,
          inventory_item_id = v_item.id,
          quantity = case when source_manual then greatest(quantity, v_item.default_quantity) else v_item.default_quantity end,
          unit = case when source_manual then unit else v_item.unit end
      where id = v_existing.id;
    end if;
  elsif v_existing.id is not null and v_existing.source_auto then
    if v_existing.source_manual then
      update public.next_order_items set source_auto = false, inventory_item_id = null, dismissed = false where id = v_existing.id;
    else
      delete from public.next_order_items where id = v_existing.id;
    end if;
  end if;
end;
$$;

create or replace function private.inventory_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.sync_inventory_item(new.id);
  return new;
end;
$$;

create trigger inventory_sync_next_order
after insert or update of quantity, expiry_date, is_recurring, default_quantity, name, unit
on public.inventory_items for each row execute function private.inventory_after_write();

create or replace function public.sync_next_order(p_household_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not private.is_household_member(p_household_id) then raise exception 'Household access denied'; end if;
  for v_id in select id from public.inventory_items where household_id = p_household_id loop
    perform private.sync_inventory_item(v_id);
  end loop;
end;
$$;

create or replace function public.adjust_inventory_quantity(p_inventory_id uuid, p_delta numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare v_quantity numeric;
begin
  update public.inventory_items i
  set quantity = greatest(0, round(i.quantity + p_delta, 2))
  where i.id = p_inventory_id and private.is_household_member(i.household_id)
  returning quantity into v_quantity;
  if v_quantity is null then raise exception 'Inventory item not found'; end if;
  return v_quantity;
end;
$$;

create or replace function public.add_manual_next_order(p_household_id uuid, p_name text, p_quantity numeric, p_unit text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text := private.normalise_name(p_name);
  v_id uuid;
begin
  if not private.is_household_member(p_household_id) then raise exception 'Household access denied'; end if;
  if p_quantity <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select id into v_id from public.next_order_items
  where household_id = p_household_id and name_key = v_key and locked_order_id is null limit 1;
  if v_id is null then
    insert into public.next_order_items(household_id, name, name_key, quantity, unit, source_manual, added_by_member_id)
    values (p_household_id, p_name, v_key, p_quantity, p_unit, true, private.current_member_id(p_household_id)) returning id into v_id;
  else
    update public.next_order_items
    set quantity = round(quantity + p_quantity, 2), unit = p_unit, source_manual = true, dismissed = false
    where id = v_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.dismiss_next_order_item(p_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_item public.next_order_items;
begin
  select * into v_item from public.next_order_items where id = p_item_id;
  if v_item.id is null or not private.is_household_member(v_item.household_id) then raise exception 'Order item not found'; end if;
  if v_item.source_auto then
    update public.next_order_items set dismissed = true, source_manual = false where id = p_item_id;
  else
    delete from public.next_order_items where id = p_item_id;
  end if;
end;
$$;

create or replace function public.start_order(p_household_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order_id uuid;
  v_member_id uuid;
begin
  if not private.is_household_member(p_household_id) then raise exception 'Household access denied'; end if;
  select id into v_order_id from public.orders where household_id = p_household_id and status = 'draft' limit 1;
  if v_order_id is not null then return v_order_id; end if;
  if not exists (select 1 from public.next_order_items where household_id = p_household_id and not dismissed and locked_order_id is null) then
    raise exception 'Add at least one item before starting an order';
  end if;
  v_member_id := private.current_member_id(p_household_id);
  insert into public.orders(household_id, placed_by_member_id) values (p_household_id, v_member_id) returning id into v_order_id;
  update public.next_order_items set locked_order_id = v_order_id
  where household_id = p_household_id and not dismissed and locked_order_id is null;
  insert into public.order_items(
    household_id, order_id, inventory_item_id, next_order_item_id, name, name_key, quantity, unit, category, expiry_date, bought, source
  )
  select
    n.household_id, v_order_id, n.inventory_item_id, n.id, n.name, n.name_key, n.quantity, n.unit,
    coalesce(i.category, 'Other'),
    ((now() at time zone h.timezone)::date + coalesce(i.default_expiry_days, h.default_expiry_days)),
    true, 'next_order'::public.order_item_source
  from public.next_order_items n
  join public.households h on h.id = n.household_id
  left join public.inventory_items i on i.id = n.inventory_item_id
  where n.locked_order_id = v_order_id;
  return v_order_id;
end;
$$;

create or replace function public.cancel_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_order public.orders;
begin
  select * into v_order from public.orders where id = p_order_id;
  if v_order.id is null or not private.is_household_member(v_order.household_id) then raise exception 'Order not found'; end if;
  if v_order.status <> 'draft' then raise exception 'Only a draft order can be cancelled'; end if;
  update public.next_order_items set locked_order_id = null where locked_order_id = p_order_id;
  update public.orders set status = 'cancelled', cancelled_at = now() where id = p_order_id;
end;
$$;

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
      category, expiry_date, bought, source
    ) values (
      v_order.household_id, p_order_id,
      nullif(v_item->>'inventory_item_id', '')::uuid,
      nullif(v_item->>'next_order_item_id', '')::uuid,
      v_name, v_key, v_quantity, v_item->>'unit', coalesce(nullif(v_item->>'category', ''), 'Other'),
      v_expiry, (v_item->>'bought')::boolean, (v_item->>'source')::public.order_item_source
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

create or replace function public.set_split_settled(p_order_id uuid, p_member_id uuid, p_settled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_household_id uuid;
begin
  select household_id into v_household_id from public.orders where id = p_order_id;
  if v_household_id is null or not private.is_household_member(v_household_id) then raise exception 'Order not found'; end if;
  update public.order_splits
  set settled_at = case when p_settled then now() else null end
  where order_id = p_order_id and member_id = p_member_id;
  if not found then raise exception 'Split not found'; end if;
  update public.orders set updated_at = now() where id = p_order_id;
end;
$$;

revoke all on all tables in schema public from anon, authenticated;
grant select on public.households, public.members, public.orders, public.order_items, public.order_splits to authenticated;
grant select, insert, update, delete on public.inventory_items, public.next_order_items to authenticated;
grant select on public.member_sessions to authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on all functions in schema private from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.user_household_ids() to authenticated;
grant execute on function private.current_member_id(uuid) to authenticated;
grant execute on function private.is_household_member(uuid) to authenticated;
grant execute on function public.current_household_context() to authenticated;
grant execute on function public.create_household(text, text) to authenticated;
grant execute on function public.preview_household_invite(text) to authenticated;
grant execute on function public.join_household(text, uuid, text) to authenticated;
grant execute on function public.rotate_household_invite() to authenticated;
grant execute on function public.sync_next_order(uuid) to authenticated;
grant execute on function public.adjust_inventory_quantity(uuid, numeric) to authenticated;
grant execute on function public.add_manual_next_order(uuid, text, numeric, text) to authenticated;
grant execute on function public.dismiss_next_order_item(uuid) to authenticated;
grant execute on function public.start_order(uuid) to authenticated;
grant execute on function public.cancel_order(uuid) to authenticated;
grant execute on function public.place_order(uuid, bigint, uuid[], jsonb) to authenticated;
grant execute on function public.set_split_settled(uuid, uuid, boolean) to authenticated;

alter publication supabase_realtime add table public.inventory_items;
alter publication supabase_realtime add table public.next_order_items;
alter publication supabase_realtime add table public.members;
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.order_items;
alter publication supabase_realtime add table public.order_splits;
