create table public.ru_study_account_links (
 user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
 space_key text not null check (space_key ~ '^[0-9a-f]{64}$')
);
alter table public.ru_study_account_links enable row level security;
revoke all on public.ru_study_account_links from public, anon, authenticated;
grant select,insert on public.ru_study_account_links to authenticated;
create policy read_own_link on public.ru_study_account_links for select to authenticated using ((select auth.uid())=user_id);
create policy bind_self_once on public.ru_study_account_links for insert to authenticated with check ((select auth.uid())=user_id);
