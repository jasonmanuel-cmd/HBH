-- 004 — Pin search_path on the website's trigger functions (Supabase linter 0011) and keep them
-- callable only by their triggers. Run after 003.
alter function public.touch_updated_at() set search_path = '';
alter function public.log_status_change() set search_path = '';
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.log_status_change() from public, anon, authenticated;
