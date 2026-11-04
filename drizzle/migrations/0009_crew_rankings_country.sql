-- Country support for regional crew rankings.
alter table public.profiles add column if not exists country_code char(2);
create index if not exists profiles_country_code_idx on public.profiles(country_code);
