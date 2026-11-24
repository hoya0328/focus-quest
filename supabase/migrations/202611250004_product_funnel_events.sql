alter table public.focus_quest_product_events
  drop constraint if exists focus_quest_product_events_event_name_check;

alter table public.focus_quest_product_events
  add constraint focus_quest_product_events_event_name_check
    check (event_name in (
      'app_opened',
      'returned_after_7d',
      'feedback_opened',
      'companion_selected',
      'setup_opened',
      'focus_started',
      'focus_completed',
      'focus_abandoned',
      'camp_created',
      'camp_joined',
      'push_enabled',
      'quiz_answered',
      'quiz_skipped',
      'quiz_feedback_submitted',
      'client_error'
    ));
