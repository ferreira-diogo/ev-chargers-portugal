-- Rollback for 20260924100500_revoke_rls_auto_enable_public_roles.sql.
grant execute on function public.rls_auto_enable() to anon, authenticated;
