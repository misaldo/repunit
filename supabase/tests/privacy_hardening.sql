begin;
select plan(9);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon has no table-wide SELECT privilege on profiles'
);
select ok(has_column_privilege('anon', 'public.profiles', 'username', 'SELECT'), 'anon can read public usernames');
select ok(has_column_privilege('anon', 'public.profiles', 'display_name', 'SELECT'), 'anon can read public display names');
select ok(has_column_privilege('anon', 'public.profiles', 'avatar_url', 'SELECT'), 'anon can read public avatars');
select ok(has_column_privilege('anon', 'public.profiles', 'bio', 'SELECT'), 'anon can read public bios');
select ok(not has_column_privilege('anon', 'public.profiles', 'bodyweight_kg', 'SELECT'), 'anon cannot read bodyweight');
select ok(not has_column_privilege('anon', 'public.profiles', 'country_code', 'SELECT'), 'anon cannot read country code');
select ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'Public lift evidence readable by visitors'
  )
  and exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'lift videos signed-in read'
      and 'authenticated' = any(roles)
  ),
  'lift videos are readable only through the signed-in storage policy'
);
select ok(
  exists (select 1 from storage.buckets where id = 'lift-videos' and public = false),
  'lift-videos bucket is private'
);

select * from finish();
rollback;
