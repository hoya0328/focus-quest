create table if not exists public.focus_quest_plus_interest (
  user_id uuid primary key references auth.users(id) on delete cascade,
  interest_level text not null check (interest_level in ('interested', 'not_now')),
  price_band integer check (price_band in (4900, 5900, 6900)),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint focus_quest_plus_interest_price_shape_check check (
    (interest_level = 'interested' and price_band is not null)
    or (interest_level = 'not_now' and price_band is null)
  )
);

comment on table public.focus_quest_plus_interest is
  'Private, non-binding Focus Quest Plus pricing research. This table never represents a purchase.';

alter table public.focus_quest_plus_interest enable row level security;

revoke all on table public.focus_quest_plus_interest from public, anon;
grant select, insert, update, delete on table public.focus_quest_plus_interest
  to authenticated;

drop policy if exists "Users manage their own Plus interest"
  on public.focus_quest_plus_interest;
create policy "Users manage their own Plus interest"
  on public.focus_quest_plus_interest
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
