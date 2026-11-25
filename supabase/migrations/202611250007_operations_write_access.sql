-- Server APIs and scheduled reminders only; client grants and RLS are unchanged.
grant insert, update, delete on table public.focus_quest_push_subscriptions to service_role;
grant update (status, reviewed_at) on table public.focus_quest_camp_reports to service_role;
