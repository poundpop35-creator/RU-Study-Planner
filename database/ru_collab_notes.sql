-- Collaborative notebooks are opt-in and do not change ru_study_workspaces.
-- Apply only to the Supabase project used by dist/supabase-config.js.
-- Requires confirmed Supabase Auth users (not the legacy personal-study link).
begin;

create schema if not exists ru_private;
revoke all on schema ru_private from public, anon;
grant usage on schema ru_private to authenticated;

create table if not exists public.ru_collab_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ru_collab_snapshot_size check (octet_length(snapshot::text) <= 3800000),
  constraint ru_collab_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);

create table if not exists public.ru_collab_members (
  note_id uuid not null references public.ru_collab_notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('editor','viewer')),
  display_name text not null default 'ผู้ร่วมงาน' check(length(display_name) between 1 and 60),
  joined_at timestamptz not null default now(),
  primary key (note_id, user_id)
);
create index if not exists ru_collab_members_user_idx on public.ru_collab_members(user_id,note_id);

create table if not exists public.ru_collab_versions (
  note_id uuid not null references public.ru_collab_notes(id) on delete cascade,
  revision bigint not null,
  snapshot jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (note_id, revision)
);

-- SECURITY DEFINER helpers live outside exposed schemas, and use auth.uid(),
-- not user-provided IDs or mutable JWT user_metadata, for access control.
create or replace function ru_private.ru_collab_role(p_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when exists (
      select 1 from public.ru_collab_notes n
      where n.id=p_id and n.owner_id=(select auth.uid())
    ) then 'owner'
    else (
      select m.role from public.ru_collab_members m
      where m.note_id=p_id and m.user_id=(select auth.uid())
    )
  end
$$;
revoke all on function ru_private.ru_collab_role(uuid) from public;
grant execute on function ru_private.ru_collab_role(uuid) to authenticated;

alter table public.ru_collab_notes enable row level security;
alter table public.ru_collab_members enable row level security;
alter table public.ru_collab_versions enable row level security;

create policy "collab notes read by members" on public.ru_collab_notes
for select to authenticated using (ru_private.ru_collab_role(id) is not null);
create policy "collab notes created by their owner" on public.ru_collab_notes
for insert to authenticated with check ((select auth.uid())=owner_id
  and snapshot->>'id'=id::text);
create policy "collab notes owner can delete" on public.ru_collab_notes
for delete to authenticated using ((select auth.uid())=owner_id);
-- No direct UPDATE grant: server RPC below performs revision-safe writes.

create policy "collab members readable by note members" on public.ru_collab_members
for select to authenticated using (ru_private.ru_collab_role(note_id) is not null);
create policy "collab owner may add non-owner members" on public.ru_collab_members
for insert to authenticated with check (
  ru_private.ru_collab_role(note_id)='owner'
  and user_id<>(select auth.uid())
  and role in ('editor','viewer'));
create policy "collab owner can change member roles" on public.ru_collab_members
for update to authenticated using (ru_private.ru_collab_role(note_id)='owner')
with check (ru_private.ru_collab_role(note_id)='owner' and role in ('editor','viewer'));
create policy "collab owner can revoke, users may leave" on public.ru_collab_members
for delete to authenticated using (
  ru_private.ru_collab_role(note_id)='owner' or user_id=(select auth.uid()));

create policy "collab versions readable by members" on public.ru_collab_versions
for select to authenticated using (ru_private.ru_collab_role(note_id) is not null);

revoke all on public.ru_collab_notes,public.ru_collab_members,public.ru_collab_versions from public,anon,authenticated;
grant select,insert,delete on public.ru_collab_notes to authenticated;
grant select,insert,update,delete on public.ru_collab_members to authenticated;
grant select on public.ru_collab_versions to authenticated;

-- Atomic CAS save; owner/editor only, independent of the legacy workspace blob.
create or replace function public.ru_collab_save(
  p_note_id uuid, p_expected_revision bigint, p_snapshot jsonb
) returns bigint language plpgsql security definer set search_path = ''
as $$
declare
  v_revision bigint;
  v_old jsonb;
begin
  if (select auth.uid()) is null or
    ru_private.ru_collab_role(p_note_id) not in ('owner','editor') then
    raise exception 'ไม่มีสิทธิ์แก้ไขสมุดนี้' using errcode='42501';
  end if;
  if p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
    or p_snapshot->>'id'<>p_note_id::text
    or octet_length(p_snapshot::text)>3800000 then
    raise exception 'รูปแบบสมุดไม่ถูกต้องหรือมีขนาดใหญ่เกินไป' using errcode='22023';
  end if;
  select n.snapshot into v_old from public.ru_collab_notes n
  where n.id=p_note_id and n.revision=p_expected_revision for update;
  if not found then
    raise exception 'ข้อมูลมีการเปลี่ยนแปลง' using errcode='40001';
  end if;
  update public.ru_collab_notes
    set snapshot=p_snapshot, revision=revision+1, updated_at=now()
    where id=p_note_id returning revision into v_revision;
  insert into public.ru_collab_versions(note_id,revision,snapshot,updated_by)
    values(p_note_id,p_expected_revision,v_old,(select auth.uid()));
  return v_revision;
end;
$$;
revoke all on function public.ru_collab_save(uuid,bigint,jsonb) from public,anon;
grant execute on function public.ru_collab_save(uuid,bigint,jsonb) to authenticated;

-- Invite registered, email-confirmed users; never expose auth.users to clients.
create or replace function public.ru_collab_invite(
  p_note_id uuid,p_email text,p_role text default 'editor'
) returns text language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  if (select auth.uid()) is null or ru_private.ru_collab_role(p_note_id)<>'owner'
    then raise exception 'เฉพาะเจ้าของสมุดเท่านั้นที่เชิญได้' using errcode='42501'; end if;
  if p_role not in ('editor','viewer') or length(trim(p_email))<3
    then raise exception 'ข้อมูลคำเชิญไม่ถูกต้อง' using errcode='22023'; end if;
  select id into v_id from auth.users
    where lower(email)=lower(trim(p_email)) and email_confirmed_at is not null;
  if v_id is null then
    raise exception 'ผู้รับต้องสมัครและยืนยันอีเมลก่อน จึงจะเชิญได้' using errcode='22023';
  end if;
  if v_id=(select auth.uid()) then
    raise exception 'คุณเป็นเจ้าของสมุดอยู่แล้ว' using errcode='22023';
  end if;
  insert into public.ru_collab_members(note_id,user_id,role,display_name)
    values(p_note_id,v_id,p_role,left(split_part(trim(p_email),'@',1),60))
    on conflict(note_id,user_id) do update set role=excluded.role;
  return 'invited';
end;
$$;
revoke all on function public.ru_collab_invite(uuid,text,text) from public,anon;
grant execute on function public.ru_collab_invite(uuid,text,text) to authenticated;

-- Shared assets are private, with membership enforced on each read/write.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('ru-collab-assets','ru-collab-assets',false,52428800,
  array['image/png','image/jpeg','image/webp','image/gif',
    'application/pdf','application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict(id) do nothing;

create or replace function ru_private.ru_collab_asset_role(p_name text)
returns text language sql stable security definer set search_path = ''
as $$
  select case when split_part(p_name,'/',1) ~
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ru_private.ru_collab_role(split_part(p_name,'/',1)::uuid)
    else null end
$$;
revoke all on function ru_private.ru_collab_asset_role(text) from public;
grant execute on function ru_private.ru_collab_asset_role(text) to authenticated;

create policy "collab private assets read" on storage.objects
for select to authenticated using (
  bucket_id='ru-collab-assets' and ru_private.ru_collab_asset_role(name) is not null);
create policy "collab private assets upload" on storage.objects
for insert to authenticated with check (
  bucket_id='ru-collab-assets' and ru_private.ru_collab_asset_role(name) in ('owner','editor'));
create policy "collab private assets update" on storage.objects
for update to authenticated using (
  bucket_id='ru-collab-assets' and ru_private.ru_collab_asset_role(name) in ('owner','editor'))
with check (
  bucket_id='ru-collab-assets' and ru_private.ru_collab_asset_role(name) in ('owner','editor'));
create policy "collab private assets delete" on storage.objects
for delete to authenticated using (
  bucket_id='ru-collab-assets' and ru_private.ru_collab_asset_role(name)='owner');

-- Private Realtime topics are "ru-collab:<uuid>".
-- Broadcast only signals a revision (never transmits private document contents).
create policy "collab realtime read" on realtime.messages
for select to authenticated using (
  realtime.topic() ~ '^ru-collab:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12} and
  extension in ('broadcast','presence') and
  ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) is not null);
create policy "collab realtime write" on realtime.messages
for insert to authenticated with check (
  realtime.topic() ~ '^ru-collab:[0-9a-f-]{36}$' and
  (extension='presence' and
   ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) is not null
   or extension='broadcast' and
   ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) in ('owner','editor')));

commit;
 and
  extension in ('broadcast','presence') and
  ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) is not null);
create policy "collab realtime write" on realtime.messages
for insert to authenticated with check (
  realtime.topic() ~ '^ru-collab:[0-9a-f-]{36}$' and
  (extension='presence' and
   ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) is not null
   or extension='broadcast' and
   ru_private.ru_collab_role(split_part(realtime.topic(),':',2)::uuid) in ('owner','editor')));

commit;
