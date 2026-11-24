create table if not exists public.focus_quest_camp_history (
  camp_id uuid not null references public.focus_quest_camps(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  camp_code text not null check (camp_code ~ '^[A-HJ-NP-Z2-9]{6,8}$'),
  nickname text not null check (char_length(nickname) between 1 and 12),
  adventure_id text not null check (adventure_id in ('hike', 'swim', 'fish')),
  duration_minutes integer not null check (duration_minutes between 1 and 120),
  member_count integer not null check (member_count between 1 and 4),
  completed_at timestamptz not null default timezone('utc', now()),
  primary key (camp_id, user_id)
);

create table if not exists public.focus_quest_camp_contacts (
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_user_id uuid not null references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 1 and 12),
  adventure_id text not null check (adventure_id in ('hike', 'swim', 'fish')),
  sessions_together integer not null default 1 check (sessions_together between 1 and 100000),
  last_camp_id uuid references public.focus_quest_camps(id) on delete set null,
  last_met_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, contact_user_id),
  check (user_id <> contact_user_id)
);

create table if not exists public.focus_quest_camp_invitations (
  camp_id uuid not null references public.focus_quest_camps(id) on delete cascade,
  camp_code text not null check (camp_code ~ '^[A-HJ-NP-Z2-9]{6,8}$'),
  inviter_user_id uuid not null references auth.users(id) on delete cascade,
  invitee_user_id uuid not null references auth.users(id) on delete cascade,
  inviter_nickname text not null check (char_length(inviter_nickname) between 1 and 12),
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null default (timezone('utc', now()) + interval '7 days'),
  accepted_at timestamptz,
  primary key (camp_id, invitee_user_id),
  check (inviter_user_id <> invitee_user_id),
  check (expires_at > created_at)
);

create table if not exists public.focus_quest_camp_reports (
  id uuid primary key default gen_random_uuid(),
  camp_id uuid not null references public.focus_quest_camps(id) on delete cascade,
  reporter_user_id uuid not null references auth.users(id) on delete cascade,
  reported_user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (reason in ('spam', 'harassment', 'privacy', 'other')),
  status text not null default 'open' check (status in ('open', 'reviewed', 'actioned', 'dismissed')),
  created_at timestamptz not null default timezone('utc', now()),
  reviewed_at timestamptz,
  unique (camp_id, reporter_user_id, reported_user_id),
  check (reporter_user_id <> reported_user_id)
);

create index if not exists focus_quest_camp_history_user_completed_idx
  on public.focus_quest_camp_history (user_id, completed_at desc);
create index if not exists focus_quest_camp_contacts_user_met_idx
  on public.focus_quest_camp_contacts (user_id, last_met_at desc);
create index if not exists focus_quest_camp_invitations_invitee_idx
  on public.focus_quest_camp_invitations (invitee_user_id, created_at desc)
  where accepted_at is null;
create index if not exists focus_quest_camp_reports_status_idx
  on public.focus_quest_camp_reports (status, created_at desc);

alter table public.focus_quest_camp_history enable row level security;
alter table public.focus_quest_camp_contacts enable row level security;
alter table public.focus_quest_camp_invitations enable row level security;
alter table public.focus_quest_camp_reports enable row level security;

revoke all on table public.focus_quest_camp_history,
  public.focus_quest_camp_contacts,
  public.focus_quest_camp_invitations,
  public.focus_quest_camp_reports from public, anon, authenticated;
grant select on table public.focus_quest_camp_history,
  public.focus_quest_camp_contacts,
  public.focus_quest_camp_invitations to authenticated;

create policy "Users read their camp history"
  on public.focus_quest_camp_history for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their camp contacts"
  on public.focus_quest_camp_contacts for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users read their camp invitations"
  on public.focus_quest_camp_invitations for select to authenticated
  using ((select auth.uid()) in (inviter_user_id, invitee_user_id));

create or replace function public.record_focus_quest_camp_completion(
  requested_camp_id uuid,
  requested_duration_minutes integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  camp_row public.focus_quest_camps%rowtype;
  party_size integer;
  owner_member public.focus_quest_camp_members%rowtype;
  contact_member public.focus_quest_camp_members%rowtype;
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if requested_duration_minutes not between 1 and 120 then raise exception 'invalid_duration'; end if;
  select * into camp_row from public.focus_quest_camps where id = requested_camp_id;
  if camp_row.id is null or camp_row.leader_user_id <> caller_id then raise exception 'leader_required'; end if;
  select count(*) into party_size from public.focus_quest_camp_members
    where camp_id = requested_camp_id and left_at is null;

  for owner_member in select * from public.focus_quest_camp_members
    where camp_id = requested_camp_id and left_at is null
  loop
    insert into public.focus_quest_camp_history (
      camp_id, user_id, camp_code, nickname, adventure_id,
      duration_minutes, member_count, completed_at
    ) values (
      requested_camp_id, owner_member.user_id, camp_row.code, owner_member.nickname,
      owner_member.adventure_id, requested_duration_minutes, party_size, timezone('utc', now())
    ) on conflict (camp_id, user_id) do update set
      duration_minutes = excluded.duration_minutes,
      member_count = excluded.member_count,
      completed_at = excluded.completed_at;

    for contact_member in select * from public.focus_quest_camp_members
      where camp_id = requested_camp_id
        and left_at is null
        and user_id <> owner_member.user_id
    loop
      insert into public.focus_quest_camp_contacts (
        user_id, contact_user_id, nickname, adventure_id,
        sessions_together, last_camp_id, last_met_at
      ) values (
        owner_member.user_id, contact_member.user_id, contact_member.nickname,
        contact_member.adventure_id, 1, requested_camp_id, timezone('utc', now())
      ) on conflict (user_id, contact_user_id) do update set
        nickname = excluded.nickname,
        adventure_id = excluded.adventure_id,
        sessions_together = least(100000, public.focus_quest_camp_contacts.sessions_together + 1),
        last_camp_id = excluded.last_camp_id,
        last_met_at = excluded.last_met_at;
    end loop;
  end loop;
end;
$$;

create or replace function public.invite_focus_quest_camp_contact(
  requested_camp_id uuid,
  requested_contact_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  camp_row public.focus_quest_camps%rowtype;
  caller_nickname text;
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  select * into camp_row from public.focus_quest_camps
    where id = requested_camp_id and leader_user_id = caller_id and closed_at is null;
  if camp_row.id is null then raise exception 'leader_required'; end if;
  if not exists (
    select 1 from public.focus_quest_camp_contacts
    where user_id = caller_id and contact_user_id = requested_contact_user_id
  ) then raise exception 'contact_not_found'; end if;
  select nickname into caller_nickname from public.focus_quest_camp_members
    where camp_id = requested_camp_id and user_id = caller_id and left_at is null;
  insert into public.focus_quest_camp_invitations (
    camp_id, camp_code, inviter_user_id, invitee_user_id, inviter_nickname
  ) values (
    requested_camp_id, camp_row.code, caller_id, requested_contact_user_id, caller_nickname
  ) on conflict (camp_id, invitee_user_id) do update set
    inviter_nickname = excluded.inviter_nickname,
    created_at = timezone('utc', now()),
    expires_at = timezone('utc', now()) + interval '7 days',
    accepted_at = null;
end;
$$;

create or replace function public.accept_focus_quest_camp_invitation(requested_camp_id uuid)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.focus_quest_camp_invitations
  set accepted_at = timezone('utc', now())
  where camp_id = requested_camp_id
    and invitee_user_id = (select auth.uid())
    and accepted_at is null;
$$;

create or replace function public.report_focus_quest_camp_member(
  requested_camp_id uuid,
  requested_user_id uuid,
  requested_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if requested_reason not in ('spam', 'harassment', 'privacy', 'other') then raise exception 'invalid_reason'; end if;
  if requested_user_id = caller_id then raise exception 'cannot_report_self'; end if;
  if not exists (
    select 1 from public.focus_quest_camp_members
    where camp_id = requested_camp_id and user_id = caller_id
  ) or not exists (
    select 1 from public.focus_quest_camp_members
    where camp_id = requested_camp_id and user_id = requested_user_id
  ) then raise exception 'shared_camp_required'; end if;
  insert into public.focus_quest_camp_reports (
    camp_id, reporter_user_id, reported_user_id, reason
  ) values (
    requested_camp_id, caller_id, requested_user_id, requested_reason
  ) on conflict (camp_id, reporter_user_id, reported_user_id) do update set
    reason = excluded.reason,
    status = 'open',
    created_at = timezone('utc', now()),
    reviewed_at = null;
end;
$$;

create or replace function public.reopen_focus_quest_camp(
  previous_camp_id uuid,
  requested_code text,
  requested_nickname text,
  requested_adventure_id text,
  requested_focus_minutes integer
)
returns table (camp_id uuid, code text, leader_user_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  caller_id uuid := auth.uid();
  clean_code text := upper(btrim(requested_code));
  clean_nickname text := btrim(regexp_replace(requested_nickname, '\s+', ' ', 'g'));
  created_camp public.focus_quest_camps%rowtype;
  previous_member public.focus_quest_camp_members%rowtype;
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if not exists (
    select 1 from public.focus_quest_camp_history
    where camp_id = previous_camp_id and user_id = caller_id
  ) then raise exception 'camp_history_required'; end if;
  if clean_code !~ '^[A-HJ-NP-Z2-9]{6,8}$' then raise exception 'invalid_camp_code'; end if;
  if char_length(clean_nickname) not between 1 and 12 then raise exception 'invalid_nickname'; end if;
  if requested_adventure_id not in ('hike', 'swim', 'fish') then raise exception 'invalid_adventure'; end if;
  if requested_focus_minutes not between 1 and 120 then raise exception 'invalid_focus_minutes'; end if;

  insert into public.focus_quest_camps (code, leader_user_id)
  values (clean_code, caller_id)
  returning * into created_camp;
  insert into public.focus_quest_camp_members (
    camp_id, user_id, nickname, adventure_id, focus_minutes
  ) values (
    created_camp.id, caller_id, clean_nickname, requested_adventure_id, requested_focus_minutes
  );

  for previous_member in select * from public.focus_quest_camp_members
    where camp_id = previous_camp_id and user_id <> caller_id
  loop
    insert into public.focus_quest_camp_invitations (
      camp_id, camp_code, inviter_user_id, invitee_user_id, inviter_nickname
    ) values (
      created_camp.id, created_camp.code, caller_id, previous_member.user_id, clean_nickname
    ) on conflict (camp_id, invitee_user_id) do nothing;
  end loop;

  return query select created_camp.id, created_camp.code, created_camp.leader_user_id;
end;
$$;

revoke all on function public.record_focus_quest_camp_completion(uuid, integer) from public, anon;
revoke all on function public.invite_focus_quest_camp_contact(uuid, uuid) from public, anon;
revoke all on function public.accept_focus_quest_camp_invitation(uuid) from public, anon;
revoke all on function public.report_focus_quest_camp_member(uuid, uuid, text) from public, anon;
revoke all on function public.reopen_focus_quest_camp(uuid, text, text, text, integer) from public, anon;
grant execute on function public.record_focus_quest_camp_completion(uuid, integer) to authenticated;
grant execute on function public.invite_focus_quest_camp_contact(uuid, uuid) to authenticated;
grant execute on function public.accept_focus_quest_camp_invitation(uuid) to authenticated;
grant execute on function public.report_focus_quest_camp_member(uuid, uuid, text) to authenticated;
grant execute on function public.reopen_focus_quest_camp(uuid, text, text, text, integer) to authenticated;
