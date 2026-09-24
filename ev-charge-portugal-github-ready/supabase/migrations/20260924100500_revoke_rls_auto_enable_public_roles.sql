-- rls_auto_enable is an internal event-trigger helper, not a Data API endpoint.
revoke execute on function public.rls_auto_enable() from anon, authenticated;
