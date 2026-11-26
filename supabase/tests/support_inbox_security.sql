-- Rollback-only synthetic fixtures. This file never reads actual submitted messages.
begin;
set local statement_timeout = '10s';
set local lock_timeout = '2s';
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
do $$
declare ticket uuid := '10000000-0000-4000-8000-000000000071'; result_id uuid;
begin
  if current_user <> 'service_role' or auth.role() <> 'service_role' then raise exception 'wrong_test_role'; end if;
  result_id := public.submit_focus_quest_support(ticket, 'bug', 'Synthetic support security fixture only.', repeat('a',64), '2026-11-26.1');
  if result_id <> ticket or not exists(select 1 from public.focus_quest_support_requests where id = ticket) then raise exception 'positive_control_failed'; end if;
  perform public.submit_focus_quest_support(ticket, 'bug', 'Synthetic support security fixture only.', repeat('a',64), '2026-11-26.1');
  if (select count(*) from public.focus_quest_support_requests where id = ticket) <> 1 then raise exception 'retry_duplicated'; end if;
  perform public.submit_focus_quest_support('10000000-0000-4000-8000-000000000072', 'bug', 'Synthetic support rate fixture two.', repeat('a',64), '2026-11-26.1');
  perform public.submit_focus_quest_support('10000000-0000-4000-8000-000000000073', 'bug', 'Synthetic support rate fixture three.', repeat('a',64), '2026-11-26.1');
  begin
    perform public.submit_focus_quest_support('10000000-0000-4000-8000-000000000074', 'bug', 'Synthetic support rate fixture denied.', repeat('a',64), '2026-11-26.1');
    raise exception 'rate_limit_not_enforced';
  exception when raise_exception then if sqlerrm <> 'support_rate_limited' then raise; end if; end;
  update public.focus_quest_support_requests set status = 'closed', reviewed_at = now() where id = ticket;
  if not exists(select 1 from public.focus_quest_support_requests where id = ticket and status = 'closed') then raise exception 'update_control_failed'; end if;
  begin
    update public.focus_quest_support_requests set message = 'Unauthorized content edit.' where id = ticket;
    raise exception 'unexpected_content_edit';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000081"}', true);
do $$ begin
  if current_user <> 'authenticated' or auth.role() <> 'authenticated' then raise exception 'wrong_member_role'; end if;
  begin perform message from public.focus_quest_support_requests where id = '10000000-0000-4000-8000-000000000071'; raise exception 'unexpected_member_read'; exception when insufficient_privilege then null; end;
  begin perform public.submit_focus_quest_support(gen_random_uuid(),'bug','Unauthorized direct insert.',repeat('b',64),'2026-11-26.1'); raise exception 'unexpected_member_rpc'; exception when insufficient_privilege then null; end;
  begin update public.focus_quest_support_requests set status = 'open', reviewed_at = null where id = '10000000-0000-4000-8000-000000000071'; raise exception 'unexpected_member_update'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims', '{"role":"authenticated","sub":"10000000-0000-4000-8000-000000000082"}', true);
do $$ begin
  begin perform message from public.focus_quest_support_requests where id = '10000000-0000-4000-8000-000000000071'; raise exception 'unexpected_other_member_read'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$ begin
  if current_user <> 'anon' or auth.role() <> 'anon' then raise exception 'wrong_anon_role'; end if;
  begin perform message from public.focus_quest_support_requests where id = '10000000-0000-4000-8000-000000000071'; raise exception 'unexpected_anon_read'; exception when insufficient_privilege then null; end;
  begin perform public.prune_focus_quest_support(); raise exception 'unexpected_anon_cleanup'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select count(*) = 0 as synthetic_fixture_rolled_back from public.focus_quest_support_requests where id in ('10000000-0000-4000-8000-000000000071','10000000-0000-4000-8000-000000000072','10000000-0000-4000-8000-000000000073','10000000-0000-4000-8000-000000000074');
