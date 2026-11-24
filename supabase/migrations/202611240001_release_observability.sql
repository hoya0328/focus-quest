alter table public.focus_quest_product_events
  drop constraint if exists focus_quest_product_events_event_name_check;

alter table public.focus_quest_product_events
  add constraint focus_quest_product_events_event_name_check
  check (event_name in (
    'app_opened',
    'returned_after_7d',
    'feedback_opened',
    'focus_started',
    'focus_completed',
    'focus_abandoned',
    'quiz_answered',
    'quiz_skipped',
    'client_error'
  ));
