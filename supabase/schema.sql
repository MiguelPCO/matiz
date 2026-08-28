create table public.daily_results (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null, -- "YYYY-MM-DD", mismo formato que localDateKey()
  status text not null check (status in ('solved', 'failed')),
  score integer not null,
  guesses jsonb not null,
  hints jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

alter table public.daily_results enable row level security;

create policy "usuarios leen solo sus propias filas"
  on public.daily_results for select
  using (auth.uid() = user_id);

create policy "usuarios insertan solo sus propias filas"
  on public.daily_results for insert
  with check (auth.uid() = user_id);

-- sin policy de update/delete: un DailyResult de un día ya jugado no se
-- edita nunca (mismo invariante que localStorage — writeHistoryEntry solo
-- añade, GUESS/REQUEST_HINT no pueden tocar una ronda ya "solved"/"failed").
