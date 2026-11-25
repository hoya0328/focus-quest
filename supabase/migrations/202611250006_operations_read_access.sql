-- Explicit server-only export/aggregation access. No client role or RLS changes.
grant select on table
  public.focus_quest_cloud_states,
  public.study_subjects,
  public.study_quests,
  public.study_quest_focus_sessions,
  public.study_materials,
  public.study_quest_progress,
  public.study_quiz_attempts,
  public.focus_quest_product_events,
  public.focus_quest_plus_interest,
  public.focus_quest_camps,
  public.focus_quest_camp_members,
  public.focus_quest_camp_blocks,
  public.focus_quest_camp_history,
  public.focus_quest_camp_contacts,
  public.focus_quest_camp_invitations,
  public.focus_quest_camp_reports,
  public.focus_quest_push_subscriptions
to service_role;
