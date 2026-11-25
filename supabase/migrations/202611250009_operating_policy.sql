-- Public beta: no invitation or admission cap. Confirmation is checked by Auth,
-- not only a browser checkbox; the immutable acknowledgement is separate from metadata.
create table public.focus_quest_account_acknowledgements (
  user_id uuid primary key references auth.users(id) on delete cascade deferrable initially deferred,
  privacy_version text not null,
  terms_version text not null,
  age_over_14_declared boolean not null check (age_over_14_declared),
  acknowledged_at timestamptz not null default now()
);
create table public.focus_quest_deletion_ledger (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('user', 'material')),
  target_id uuid not null,
  owner_id uuid not null,
  storage_deleted_at timestamptz,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(kind, target_id)
);
create index on public.focus_quest_deletion_ledger(created_at);
create table public.focus_quest_operation_runs (
  operation text primary key,
  completed_at timestamptz not null,
  counts jsonb not null default '{}'::jsonb
);

alter table public.focus_quest_account_acknowledgements enable row level security;
alter table public.focus_quest_deletion_ledger enable row level security;
alter table public.focus_quest_operation_runs enable row level security;
revoke all on public.focus_quest_account_acknowledgements,
  public.focus_quest_deletion_ledger, public.focus_quest_operation_runs
  from public, anon, authenticated, service_role;
grant select on public.focus_quest_account_acknowledgements to authenticated;
create policy "Users read their own acknowledgement" on public.focus_quest_account_acknowledgements
  for select to authenticated using ((select auth.uid()) = user_id);

create function public.enforce_focus_quest_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- app_metadata is set only through the Auth administrator API, never user data.
  -- This supports internal fixtures/disaster provisioning without inventing consent.
  if new.raw_app_meta_data->>'focus_quest_internal_provision' = 'true' then
    new.raw_app_meta_data := new.raw_app_meta_data - 'focus_quest_internal_provision';
    return new;
  end if;
  if new.raw_user_meta_data->'age_over_14_declared' is distinct from 'true'::jsonb
    or new.raw_user_meta_data->>'privacy_notice_version' is distinct from '2026-11-25.1'
    or new.raw_user_meta_data->>'terms_version' is distinct from '2026-11-25' then
    raise exception 'focus_quest_signup_confirmation_required' using errcode = '23514';
  end if;
  insert into public.focus_quest_account_acknowledgements(user_id, privacy_version, terms_version, age_over_14_declared)
    values (new.id, '2026-11-25.1', '2026-11-25', true);
  return new;
end;
$$;
revoke all on function public.enforce_focus_quest_signup() from public, anon, authenticated, service_role;
create trigger enforce_focus_quest_signup before insert on auth.users
  for each row execute function public.enforce_focus_quest_signup();

create function public.record_focus_quest_deletion() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_schema = 'auth' and tg_table_name = 'users' then
    insert into public.focus_quest_deletion_ledger(kind, target_id, owner_id, storage_deleted_at)
      values ('user', old.id, old.id, now()) on conflict(kind, target_id) do nothing;
  else
    insert into public.focus_quest_deletion_ledger(kind, target_id, owner_id)
      values ('material', old.id, old.user_id) on conflict(kind, target_id) do nothing;
  end if;
  return old;
end;
$$;
revoke all on function public.record_focus_quest_deletion() from public, anon, authenticated, service_role;
create trigger record_focus_quest_user_deletion after delete on auth.users
  for each row execute function public.record_focus_quest_deletion();
create trigger record_focus_quest_material_deletion after delete on public.study_materials
  for each row execute function public.record_focus_quest_deletion();

create function public.enforce_focus_quest_pdf_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.bucket_id <> 'study-materials' or auth.uid() is null or auth.role() = 'service_role' then return new; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('focus-quest-pdf:' || auth.uid()::text, 0));
  if split_part(new.name, '/', 1) <> auth.uid()::text then raise exception 'focus_quest_pdf_owner_required' using errcode = '42501'; end if;
  if (select count(*) from storage.objects where bucket_id = 'study-materials' and split_part(name, '/', 1) = auth.uid()::text) >= 3 then
    raise exception 'focus_quest_pdf_quota_exceeded' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_focus_quest_pdf_quota() from public, anon, authenticated, service_role;
create trigger enforce_focus_quest_pdf_quota before insert on storage.objects
  for each row execute function public.enforce_focus_quest_pdf_quota();

create function public.run_focus_quest_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare events_count integer; reports_count integer; interest_count integer; invitations_count integer; ledger_count integer;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('focus-quest-retention', 0));
  delete from public.focus_quest_product_events where created_at < now() - interval '90 days'; get diagnostics events_count = row_count;
  delete from public.focus_quest_camp_reports where status in ('reviewed', 'actioned', 'dismissed') and reviewed_at < now() - interval '90 days'; get diagnostics reports_count = row_count;
  delete from public.focus_quest_plus_interest where updated_at < now() - interval '90 days'; get diagnostics interest_count = row_count;
  delete from public.focus_quest_camp_invitations where expires_at < now() - interval '30 days'; get diagnostics invitations_count = row_count;
  delete from public.focus_quest_deletion_ledger where processed_at is not null and created_at < now() - interval '35 days'; get diagnostics ledger_count = row_count;
  insert into public.focus_quest_operation_runs(operation, completed_at, counts)
    values ('retention', now(), jsonb_build_object('events', events_count, 'reports', reports_count, 'interest', interest_count, 'invitations', invitations_count, 'ledger', ledger_count))
    on conflict(operation) do update set completed_at = excluded.completed_at, counts = excluded.counts;
  return jsonb_build_object('events', events_count, 'reports', reports_count, 'interest', interest_count, 'invitations', invitations_count, 'ledger', ledger_count);
end;
$$;
revoke all on function public.run_focus_quest_retention() from public, anon, authenticated;
grant execute on function public.run_focus_quest_retention() to service_role;

create function public.acknowledge_focus_quest_backup_cleanup(request_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  if coalesce(cardinality(request_ids), 0) > 10000 then raise exception 'cleanup_batch_too_large'; end if;
  if exists(select 1 from public.focus_quest_deletion_ledger where id = any(request_ids) and storage_deleted_at is null) then
    raise exception 'pdf_cleanup_pending';
  end if;
  update public.focus_quest_deletion_ledger set processed_at = now() where id = any(request_ids);
end;
$$;
revoke all on function public.acknowledge_focus_quest_backup_cleanup(uuid[]) from public, anon, authenticated;
grant execute on function public.acknowledge_focus_quest_backup_cleanup(uuid[]) to service_role;

create function public.export_focus_quest_backup() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare table_name text; table_rows jsonb; tables_data jsonb := '{}'::jsonb; accounts_data jsonb; deletions_data jsonb; result_data jsonb;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  foreach table_name in array array[
    'focus_quest_cloud_states','study_subjects','study_materials','study_quests','study_quest_focus_sessions',
    'study_quest_progress','study_quiz_attempts','focus_quest_product_events','focus_quest_plus_interest',
    'focus_quest_camps','focus_quest_camp_members','focus_quest_camp_blocks','focus_quest_camp_history',
    'focus_quest_camp_contacts','focus_quest_camp_invitations','focus_quest_camp_reports',
    'focus_quest_push_subscriptions','focus_quest_account_acknowledgements'
  ] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(record)), ''[]''::jsonb) from (select * from public.%I limit 10001) record', table_name) into table_rows;
    if jsonb_array_length(table_rows) > 10000 then raise exception 'backup_row_limit_exceeded'; end if;
    tables_data := tables_data || jsonb_build_object(table_name, table_rows);
  end loop;
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'email', email, 'email_confirmed', email_confirmed_at is not null, 'user_metadata', raw_user_meta_data, 'created_at', created_at)), '[]'::jsonb)
    into accounts_data from auth.users;
  select coalesce(jsonb_agg(to_jsonb(record)), '[]'::jsonb) into deletions_data from public.focus_quest_deletion_ledger record;
  result_data := jsonb_build_object('version', 2, 'createdAt', now(), 'tables', tables_data, 'accounts', accounts_data, 'deletions', deletions_data);
  if octet_length(result_data::text) > 33554432 then raise exception 'backup_size_limit_exceeded'; end if;
  return result_data;
end;
$$;
revoke all on function public.export_focus_quest_backup() from public, anon, authenticated;
grant execute on function public.export_focus_quest_backup() to service_role;

create function public.focus_quest_operation_status() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  return jsonb_build_object(
    'retention', (select to_jsonb(record) from public.focus_quest_operation_runs record where operation = 'retention'),
    'pendingBackupDeletions', (select count(*) from public.focus_quest_deletion_ledger where processed_at is null),
    'acknowledgements', (select count(*) from public.focus_quest_account_acknowledgements),
    'signup', 'public', 'pdfLimit', 3
  );
end;
$$;
revoke all on function public.focus_quest_operation_status() from public, anon, authenticated;
grant execute on function public.focus_quest_operation_status() to service_role;

create function public.focus_quest_pending_pdf_cleanup() returns table(id uuid, storage_path text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  return query select ledger.id, ledger.owner_id::text || '/' || ledger.target_id::text || '/source.pdf'
    from public.focus_quest_deletion_ledger ledger
    where ledger.kind = 'material' and ledger.storage_deleted_at is null
    order by ledger.created_at limit 100;
end;
$$;
revoke all on function public.focus_quest_pending_pdf_cleanup() from public, anon, authenticated;
grant execute on function public.focus_quest_pending_pdf_cleanup() to service_role;

create function public.acknowledge_focus_quest_pdf_cleanup(request_ids uuid[]) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.role() is distinct from 'service_role' then raise exception 'server_required' using errcode = '42501'; end if;
  if coalesce(cardinality(request_ids),0) > 100 then raise exception 'cleanup_batch_too_large'; end if;
  update public.focus_quest_deletion_ledger set storage_deleted_at = now()
    where kind = 'material' and id = any(request_ids);
end;
$$;
revoke all on function public.acknowledge_focus_quest_pdf_cleanup(uuid[]) from public, anon, authenticated;
grant execute on function public.acknowledge_focus_quest_pdf_cleanup(uuid[]) to service_role;
