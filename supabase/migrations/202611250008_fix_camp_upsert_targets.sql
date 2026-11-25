-- Preserve existing access checks; qualify conflict targets that shadow RETURNS TABLE variables.
create or replace function public.join_focus_quest_camp(
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
  target_camp public.focus_quest_camps%rowtype;
  clean_nickname text := btrim(regexp_replace(requested_nickname, '\s+', ' ', 'g'));
begin
  if caller_id is null then raise exception 'authentication_required'; end if;
  if char_length(clean_nickname) not between 1 and 12 then raise exception 'invalid_nickname'; end if;
  if requested_adventure_id not in ('hike', 'swim', 'fish') then raise exception 'invalid_adventure'; end if;
  if requested_focus_minutes not between 1 and 120 then raise exception 'invalid_focus_minutes'; end if;

  select * into target_camp
  from public.focus_quest_camps camp
  where camp.code = upper(btrim(requested_code))
    and camp.closed_at is null;

  if target_camp.id is null then raise exception 'camp_not_found'; end if;
  if exists (
    select 1 from public.focus_quest_camp_blocks block
    where block.camp_id = target_camp.id and block.user_id = caller_id
  ) then raise exception 'camp_access_blocked'; end if;

  insert into public.focus_quest_camp_members (
    camp_id, user_id, nickname, adventure_id, focus_minutes, joined_at, left_at
  ) values (
    target_camp.id, caller_id, clean_nickname, requested_adventure_id,
    requested_focus_minutes, timezone('utc', now()), null
  )
  on conflict on constraint focus_quest_camp_members_pkey do update set
    nickname = excluded.nickname,
    adventure_id = excluded.adventure_id,
    focus_minutes = excluded.focus_minutes,
    joined_at = excluded.joined_at,
    left_at = null;

  return query select target_camp.id, target_camp.code, target_camp.leader_user_id;
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
    ) on conflict on constraint focus_quest_camp_invitations_pkey do nothing;
  end loop;

  return query select created_camp.id, created_camp.code, created_camp.leader_user_id;
end;
$$;
