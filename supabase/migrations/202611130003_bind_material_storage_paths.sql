-- Keep privileged cleanup paths inside the authenticated owner's namespace.
alter table public.study_materials
  add constraint study_materials_storage_path_owner_check
  check (
    split_part(storage_path, '/', 1) = user_id::text
    and split_part(storage_path, '/', 2) ~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and split_part(storage_path, '/', 3) = 'source.pdf'
    and split_part(storage_path, '/', 4) = ''
  );
