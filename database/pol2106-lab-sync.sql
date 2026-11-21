-- A single shared classroom, like the notebook. Keep the bank out of workspace saves.
create table public.ru_pol2106_bank(part smallint primary key check(part between 0 and 6), packed text not null);
create table public.ru_pol2106_answers(item smallint primary key check(item between 0 and 699), choice smallint not null check(choice between 1 and 5), revision bigint not null check(revision>0));
alter table public.ru_pol2106_bank enable row level security;
alter table public.ru_pol2106_answers enable row level security;
revoke all on public.ru_pol2106_answers,public.ru_pol2106_bank from public,anon,authenticated;
grant select on public.ru_pol2106_bank,public.ru_pol2106_answers to anon,authenticated;
create policy read_class_bank on public.ru_pol2106_bank for select to anon,authenticated using(true);
create policy read_class_answers on public.ru_pol2106_answers for select to anon,authenticated using(true);
-- CAS per item: an old device can fill missing items, never silently replace newer answers.
create function public.ru_pol2106_answer(p_item integer,p_choice integer,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_revision=0 then
 insert into public.ru_pol2106_answers values(p_item,p_choice,1) on conflict do nothing;
 else
 update public.ru_pol2106_answers set choice=p_choice,revision=revision+1 where item=p_item and revision=p_revision;
 end if;
 return found;
end $$;
revoke all on function public.ru_pol2106_answer(integer,integer,bigint) from public;
grant execute on function public.ru_pol2106_answer(integer,integer,bigint) to anon,authenticated;
