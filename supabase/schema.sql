-- Execute no SQL Editor do Supabase.
create table if not exists study_sessions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text not null,
  started_at timestamptz not null,  -- UTC; o cliente converte para o fuso local
  duration_sec int not null
);
create table if not exists notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  subject text,
  content text not null,
  created_at timestamptz not null default now()
);
create table if not exists tasks (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  title text not null,
  subject text,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

alter table study_sessions enable row level security;
alter table notes enable row level security;
alter table tasks enable row level security;

create policy "own sessions" on study_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own notes" on notes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own tasks" on tasks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
