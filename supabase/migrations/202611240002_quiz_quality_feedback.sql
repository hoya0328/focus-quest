alter table public.focus_quest_product_events
  add column if not exists quiz_key text,
  add column if not exists quiz_stage text,
  add column if not exists feedback_value text;

alter table public.focus_quest_product_events
  drop constraint if exists focus_quest_product_events_event_name_check,
  drop constraint if exists focus_quest_product_events_quiz_key_check,
  drop constraint if exists focus_quest_product_events_quiz_stage_check,
  drop constraint if exists focus_quest_product_events_feedback_value_check,
  drop constraint if exists focus_quest_product_events_feedback_shape_check;

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
      'quiz_feedback_submitted',
      'client_error'
    )),
  add constraint focus_quest_product_events_quiz_key_check
    check (quiz_key is null or char_length(quiz_key) between 1 and 160),
  add constraint focus_quest_product_events_quiz_stage_check
    check (quiz_stage is null or quiz_stage in ('checkpoint', 'review')),
  add constraint focus_quest_product_events_feedback_value_check
    check (
      feedback_value is null
      or feedback_value in ('helpful', 'unclear', 'out_of_scope')
    ),
  add constraint focus_quest_product_events_feedback_shape_check
    check (
      (
        event_name = 'quiz_feedback_submitted'
        and quest_id is not null
        and quiz_key is not null
        and quiz_stage is not null
        and feedback_value is not null
      )
      or
      (
        event_name <> 'quiz_feedback_submitted'
        and quiz_key is null
        and quiz_stage is null
        and feedback_value is null
      )
    );

create index if not exists focus_quest_product_events_quiz_feedback_idx
  on public.focus_quest_product_events(feedback_value, quiz_stage, created_at desc)
  where event_name = 'quiz_feedback_submitted';
