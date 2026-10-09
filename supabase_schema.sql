-- Banco de Dados para foco.
-- Rode este script no SQL Editor do seu projeto no Supabase

-- 1. Criação da tabela de Sessões de Estudo
CREATE TABLE study_sessions (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  duration_sec INTEGER NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 2. Criação da tabela de Anotações (Notes)
CREATE TABLE notes (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- 3. Criação da tabela de Lembretes/Tarefas (Tasks)
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT,
  title TEXT NOT NULL,
  done BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ
);

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) - Garantir que cada usuário só acesse os próprios dados
-- ==============================================================================

ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Políticas para study_sessions
CREATE POLICY "Usuários podem ver suas próprias sessões" ON study_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem inserir/atualizar suas sessões" ON study_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Políticas para notes
CREATE POLICY "Usuários podem ver suas próprias anotações" ON notes FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem inserir/atualizar suas anotações" ON notes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Políticas para tasks
CREATE POLICY "Usuários podem ver suas próprias tarefas" ON tasks FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Usuários podem inserir/atualizar suas tarefas" ON tasks FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
