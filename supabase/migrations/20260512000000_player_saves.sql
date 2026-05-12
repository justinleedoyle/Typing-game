-- Player save state. One row per authenticated user; the whole save lives
-- as JSON so the game can evolve its shape without further migrations.
--
-- Row Level Security is on (it should be on every public table in this
-- project). Policies restrict every operation to the user's own row,
-- keyed on auth.uid().

create table public.player_saves (
  user_id uuid primary key references auth.users on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.player_saves enable row level security;

create policy "users can read own save"
  on public.player_saves for select
  to authenticated
  using (auth.uid() = user_id);

create policy "users can insert own save"
  on public.player_saves for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "users can update own save"
  on public.player_saves for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.touch_player_save_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger player_saves_touch_updated_at
  before update on public.player_saves
  for each row
  execute function public.touch_player_save_updated_at();
