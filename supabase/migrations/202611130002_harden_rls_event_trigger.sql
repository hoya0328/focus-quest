-- Hosted projects expose this platform helper, while a fresh local Supabase
-- stack may not. Harden it when present without making isolated migrations fail.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
