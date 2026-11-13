-- Keep the platform event trigger active while preventing direct Data API RPC calls.
revoke all on function public.rls_auto_enable() from public, anon, authenticated;
