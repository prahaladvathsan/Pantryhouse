begin;

-- These helpers only run from table triggers. After execute privileges on the
-- private schema are revoked, they need to execute as their owner so nested
-- private helper calls continue to work for authenticated table writes.
alter function private.normalise_named_row() security definer;
alter function private.touch_updated_at() security definer;

commit;
