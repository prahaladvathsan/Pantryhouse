begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

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

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated","is_anonymous":true}', true);
select is((select count(*)::integer from public.households), 0, 'outsider cannot read the household');
select is((select count(*)::integer from public.inventory_items), 0, 'outsider cannot read inventory');
select throws_ok(
  $$select public.sync_next_order('11111111-1111-4111-8111-111111111111'::uuid)$$,
  'Household access denied',
  'outsider cannot run a household mutation'
);
select is(public.current_household_context(), null::jsonb, 'outsider has no household context');

select * from finish();
rollback;
