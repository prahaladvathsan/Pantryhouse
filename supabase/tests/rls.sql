begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated","is_anonymous":true}', true);

create temporary table test_created as
select public.create_household('Test House', 'Asha') as payload;

select is((select count(*)::integer from public.households), 1, 'creator can read the household');
select is((select count(*)::integer from public.members), 1, 'creator can read household members');
select is((select count(*)::integer from public.member_sessions), 1, 'creator can read their own session');
select lives_ok(
  $$insert into public.inventory_items(household_id, name, name_key, category, quantity, unit, default_quantity)
    select id, 'Milk', 'milk', 'Dairy & eggs', 1, 'carton', 2 from public.households$$,
  'member can add inventory'
);
select is((select count(*)::integer from public.inventory_items), 1, 'member sees household inventory');

create temporary table test_next_item as
select public.add_manual_next_order((select id from public.households), 'Milk', 1, 'L') as item_id;
create temporary table test_order as
select public.start_order((select id from public.households)) as order_id;
create temporary table test_handoff as
select public.create_order_handoff((select order_id from test_order)) as payload;
select is(length((select payload->>'code' from test_handoff)), 64, 'member receives a strong order-scoped handoff code');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","is_anonymous":true}', true);
select is((select count(*)::integer from public.households), 0, 'outsider cannot read the household');
select is((select count(*)::integer from public.inventory_items), 0, 'outsider cannot read inventory');
select throws_ok(
  $$select public.sync_next_order('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'Household access denied',
  'outsider cannot run a household mutation'
);
select throws_ok(
  $$select public.create_order_handoff((select order_id from test_order))$$,
  'Order not found',
  'outsider cannot create a handoff for another household order'
);
select is(public.current_household_context(), null::jsonb, 'outsider has no household context');

select * from finish();
rollback;
