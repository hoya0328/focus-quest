create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null,
  file_name text not null check (char_length(file_name) between 1 and 180),
  storage_path text not null unique check (char_length(storage_path) between 1 and 500),
  file_size_bytes integer not null check (file_size_bytes between 1 and 15728640),
  page_count integer not null check (page_count between 1 and 120),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'analyzing', 'ready', 'failed')),
  summary text not null default '' check (char_length(summary) <= 3000),
  analysis jsonb not null default '{}'::jsonb
    check (jsonb_typeof(analysis) = 'object'),
  analysis_provider text not null default 'guided'
    check (analysis_provider in ('guided', 'openai')),
  error_message text not null default '' check (char_length(error_message) <= 500),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  analyzed_at timestamptz,
  unique (id, user_id),
  constraint study_materials_owned_subject_fkey
    foreign key (subject_id, user_id)
    references public.study_subjects(id, user_id)
    on delete cascade
);

create index if not exists study_materials_subject_created_idx
  on public.study_materials(subject_id, created_at desc);

alter table public.study_materials enable row level security;
revoke all on table public.study_materials from anon;
grant select, insert, update, delete on table public.study_materials
  to authenticated;

drop policy if exists "Users manage their own study materials"
  on public.study_materials;
create policy "Users manage their own study materials"
  on public.study_materials
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter table public.study_quests
  add column if not exists material_id uuid references public.study_materials(id)
    on delete set null,
  add column if not exists source_pages text not null default ''
    check (char_length(source_pages) <= 120),
  add column if not exists study_method text not null default ''
    check (char_length(study_method) <= 500),
  add column if not exists estimated_minutes_min integer
    check (estimated_minutes_min between 5 and 720),
  add column if not exists estimated_minutes_max integer
    check (estimated_minutes_max between 5 and 720),
  add column if not exists quest_contract jsonb not null default '{}'::jsonb
    check (jsonb_typeof(quest_contract) = 'object');

drop policy if exists "Users manage their own quests" on public.study_quests;
create policy "Users manage their own quests"
  on public.study_quests
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      material_id is null
      or exists (
        select 1
        from public.study_materials
        where study_materials.id = material_id
          and study_materials.user_id = (select auth.uid())
      )
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'study-materials',
  'study-materials',
  false,
  15728640,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Users read their own study PDFs" on storage.objects;
create policy "Users read their own study PDFs"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users upload their own study PDFs" on storage.objects;
create policy "Users upload their own study PDFs"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users delete their own study PDFs" on storage.objects;
create policy "Users delete their own study PDFs"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'study-materials'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
