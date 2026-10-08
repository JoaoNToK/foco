# foco. — Documentação completa

Documento técnico que explica tudo o que foi construído: estrutura, decisões, cada arquivo, cada barreira anti-bug, como configurar e quais são as limitações conhecidas.

---

## 1. Visão geral

**foco.** é um app web de estudos minimalista com:

| Recurso | Onde vive |
|---|---|
| Timer Pomodoro (Foco / Pausa curta / Pausa longa) | `PomodoroTimer.tsx` |
| Cronômetro progressivo | `PomodoroTimer.tsx` (modo `stopwatch`) |
| Anotações vinculadas a matérias | `NotesPanel.tsx` |
| Lembretes (to-do) vinculados a matérias | `TasksPanel.tsx` |
| Dashboard de progresso (gráfico semanal + por matéria) | `ProgressChart.tsx` |
| Configurações (tema, som, tempos, calendário) | `SettingsModal.tsx` |
| Integração Google Calendar | `lib/calendar.ts` + store |
| Persistência na nuvem (Supabase) + fallback offline | `lib/supabase.ts` + store |

### Stack

- **Next.js 16** (App Router, Turbopack) + **React** + **TypeScript**
- **Tailwind CSS v4** (configuração via CSS, sem `tailwind.config.js`)
- **Zustand** (estado global + `persist` no `localStorage`)
- **next-themes** (Light/Dark sem flash)
- **Recharts** (gráfico de barras)
- **lucide-react** (ícones)
- **sonner** (toasts discretos)
- **@supabase/supabase-js** (Auth Google + PostgreSQL)

> `@supabase/ssr` também foi instalado, mas **não é usado** no código atual (o cliente é 100% navegador). Pode ser removido sem impacto.

---

## 2. Estrutura de pastas

```
foco/
├─ .env.example                  # variáveis do Supabase
├─ DOCUMENTACAO.md               # este arquivo
├─ supabase/
│  └─ schema.sql                 # tabelas + RLS
└─ src/
   ├─ app/
   │  ├─ layout.tsx              # <html>, fonte Inter, Providers
   │  ├─ globals.css             # tokens de design, tema, animações
   │  └─ page.tsx                # header/navegação + troca de abas
   ├─ components/
   │  ├─ Providers.tsx           # tema, hidratação, auth, resync, toaster
   │  ├─ PomodoroTimer.tsx       # timer + cronômetro
   │  ├─ SubjectPicker.tsx       # seletor/criador de matéria
   │  ├─ ProgressChart.tsx       # dashboard
   │  ├─ NotesPanel.tsx          # anotações
   │  ├─ TasksPanel.tsx          # lembretes
   │  └─ SettingsModal.tsx       # configurações
   ├─ lib/
   │  ├─ types.ts                # tipos compartilhados
   │  ├─ audio.ts                # AudioContext + alarmes sintetizados
   │  ├─ supabase.ts             # cliente + login/logout Google
   │  └─ calendar.ts             # chamadas à Google Calendar API
   └─ store/
      └─ useStore.ts             # Zustand: timer, dados, sync, calendário
```

---

## 3. Como o projeto foi criado (passo a passo)

1. `npx create-next-app@latest foco --ts --tailwind --eslint --app --src-dir --use-npm --import-alias "@/*" --yes --disable-git`
   - Criado na subpasta `foco/` porque o nome da pasta original (`PomodoroSimplao`) tem letras maiúsculas e o npm recusa esse nome de pacote.
2. `npm install zustand next-themes lucide-react recharts @supabase/supabase-js @supabase/ssr sonner`
3. Criação dos arquivos de `lib/`, `store/`, `components/`, `app/` e `supabase/schema.sql`.
4. `npx tsc --noEmit` → sem erros de tipo.
5. `npm run dev` → servidor em `http://localhost:3000`.
6. Correções posteriores (seções 9 e 10): aviso de "instant navigation" e fonte/responsividade.

---

## 4. Design e UI/UX

### 4.1 Tokens (`globals.css`)

As cores são variáveis CSS, trocadas pela classe `.dark` no `<html>`:

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#f6f5f2` | `#0b0b0c` | fundo da página |
| `--surface` | `#ffffff` | `#141415` | cartões, modal |
| `--surface-2` | `#efede8` | `#1c1c1e` | aba ativa, chips |
| `--line` | `#e1ded6` | `#2a2a2d` | bordas, trilho do círculo |
| `--fg` | `#1a1a1a` | `#f2f2f0` | texto |
| `--muted` | `#7a776f` | `#8d8d92` | texto secundário |
| `--accent` | `#e8743b` | `#ff8a4c` | destaque (botão Iniciar, barra do dia, anel) |

- `@custom-variant dark (&:where(.dark, .dark *));` faz o `dark:` do Tailwind v4 seguir a **classe** (necessário para o `next-themes`).
- `@theme inline` mapeia os tokens para utilitários: `bg-bg`, `bg-surface`, `bg-surface2`, `border-line`, `text-fg`, `text-muted`, `bg-accent`, `text-accent-fg`.
- Tipografia: **Inter** via `next/font/google` (variável `--font-inter`).
- Animações: `fade-up` (entrada de telas/modal) e `pulse-soft` (relógio pulsa quando pausado).
- `tabular` = `font-variant-numeric: tabular-nums`, para os dígitos do relógio não "dançarem".
- **Dark Mode é o padrão** (`defaultTheme="dark"`).

### 4.2 Navegação (`page.tsx`)

- Cabeçalho fixo (`sticky`) com blur: logo **foco.** (o ponto na cor de destaque) à esquerda; abas **Timer, Anotações, Lembretes, Progresso** e a engrenagem à direita.
- A aba ativa é guardada no store (`tab`), então ao recarregar a página você volta à mesma aba.
- A engrenagem gira 45° no hover e abre o `SettingsModal`.
- Há apenas um `<h1>` (a logo), conforme boas práticas de SEO, e todos os botões interativos têm `id` único.

---

## 5. Funcionalidades em detalhe

### 5.1 Timer / Cronômetro (`PomodoroTimer.tsx`)

**Sub-abas** "Timer" e "Cronômetro" chamam `setMode`. Trocar de modo com algo rodando executa `reset()` antes (salvando o progresso parcial, ver 5.1.3).

**Modo Timer**
- Botões **Foco / Pausa curta / Pausa longa** (`setPhase`). Os minutos vêm de `settings` (padrão 25 / 5 / 15).
- Mostrador grande e centralizado, envolto por um círculo fino (SVG). O arco laranja representa o tempo restante (`restante / planejado`).
- Texto auxiliar abaixo: "Estudando: **matéria**" + seletor de matéria.
- Botões:
  - **Iniciar** (cor de destaque) → vira **Pausar** quando rodando e **Continuar** quando pausado.
  - **+ 1:00** → soma 1 minuto ao tempo restante **e** ao total planejado; fica desabilitado enquanto o timer está parado.
  - **Reiniciar** → zera a rodada.
- **Ciclos concluídos nesta sessão**: contador `cycles`, incrementado ao terminar um Foco.
- **Ajustar tempos (minutos)**: seção expansível com 3 inputs (1–180) que alteram `settings` ao vivo.
- Ao terminar um Foco, o app sugere a próxima fase: **Pausa longa a cada 4 ciclos** (`cycles % 4 === 0`), senão Pausa curta. Ao terminar uma pausa, volta para Foco. A próxima fase fica **parada** esperando você clicar em Iniciar.

**Modo Cronômetro**
- Conta para cima (`getElapsed`). O arco do círculo completa uma volta a cada 60 s.
- Mostra `MM:SS` e passa a `H:MM:SS` a partir de 1 hora.
- Rótulo "progressivo" no lugar do nome da fase.

**5.1.3 Registro de sessões** (função interna `recordSession` no store)
- Ao **terminar** um Foco: grava uma sessão com a duração planejada total (incluindo os "+ 1:00").
- Ao **Reiniciar** no meio: grava o tempo realmente decorrido (foco no timer; qualquer tempo no cronômetro).
- Sessões com **menos de 60 s são ignoradas**.
- Pausas **não** são gravadas.

**Título da aba do navegador** mostra o tempo (`24:31 · foco.`) enquanto roda e volta a `foco.` quando para.

### 5.2 Progresso (`ProgressChart.tsx`)

- Cabeçalho: **"Hoje: X min de foco"** (soma dos minutos do dia local).
- Gráfico de barras vertical (Recharts) com Dom–Sáb da semana atual. A barra do **dia atual usa a cor de destaque**; as demais usam a cor de borda. Tooltip no hover.
- **Por matéria**: lista ordenada do maior para o menor, com minutos totais da semana e barrinha proporcional (ex.: `HTML — 90 min`).
- Se não houver dados, mostra uma mensagem orientando a concluir um foco.

> O gráfico e a lista "Por matéria" consideram **a semana atual** (domingo a sábado, no fuso local). O "Hoje" é sempre o dia local de hoje.

### 5.3 Anotações (`NotesPanel.tsx`)

- Área de texto; **Ctrl/Cmd + Enter** também salva.
- A nota é vinculada à **matéria selecionada** no seletor.
- Lista com data/hora local, etiqueta da matéria e indicador "· pendente" se ainda não sincronizou com o Supabase.
- Botão de excluir aparece no hover.

### 5.4 Lembretes (`TasksPanel.tsx`)

- Campo de texto + seletor de matéria + botão Adicionar (Enter também adiciona).
- Checkbox customizado (acessível: `role="checkbox"`, `aria-checked`), título riscado quando concluído, etiqueta da matéria, exclusão no hover.

### 5.5 Matérias (`SubjectPicker.tsx`)

- `<select>` com as matérias (padrão: Geral, HTML, CSS, JavaScript) e um botão **+** para criar nova (Enter confirma, Esc cancela, perder o foco também confirma).
- Escolher/criar manualmente marca `subjectManual = true`, o que **impede** a sugestão automática do calendário de sobrescrever sua escolha.

### 5.6 Configurações (`SettingsModal.tsx`)

| Seção | Controles |
|---|---|
| Tema | Switch Light/Dark (via `next-themes`) |
| Sons e alertas | Switch ativar/desativar; slider de volume (0–1); select **Sino / Digital / Bipe**; botão **Testar** |
| Tempos padrão | Foco, Pausa curta, Pausa longa (minutos) |
| Calendário | Status da conexão; switch "Salvar sessões concluídas no calendário"; botão **Conectar/Desconectar Google Calendar** |

O modal fecha com Esc, clique fora ou no X. O switch de tema só lê o tema real depois de montar no cliente (evita divergência de hidratação).

### 5.7 Integração com Google Calendar

- **Login**: `signInWithGoogle()` usa o OAuth do Supabase com o escopo `https://www.googleapis.com/auth/calendar.events` (leitura + escrita de eventos) e `access_type=offline`, `prompt=consent`.
- **Leitura**: `fetchTodayEvents(token)` busca eventos de **hoje** (00:00 a 24:00 local, `singleEvents=true`, ordenados por início). Eventos de dia inteiro são ignorados (só os com `dateTime`).
- **Sugestão de matéria**: `refreshCalendar()` roda ao logar e **a cada 60 s**. Se há um evento acontecendo agora, o timer está **parado** e você **não escolheu matéria manualmente**, a matéria passa a ser o título do evento (e é adicionada à lista de matérias). Também aparece "Agora no calendário: …" abaixo do seletor.
- **Escrita**: com o switch "Salvar sessões…" ligado, cada sessão registrada cria um evento **"Estudo: {matéria}"** com início e duração reais.

---

## 6. As 6 barreiras anti-bug (explicação detalhada)

### 6.1 Timer Throttling (`store/useStore.ts`, `PomodoroTimer.tsx`)

**Problema:** navegadores "estrangulam" `setInterval` em abas em segundo plano (até 1 tick por segundo ou por minuto). Um timer que faz `restante -= 1` atrasa.

**Solução:** o relógio **nunca é decrementado**.
- Ao iniciar: `targetEnd = Date.now() + restante`.
- A cada render: `restante = max(0, targetEnd - Date.now())` (`getRemaining`).
- Ao pausar: `remainingMs` guarda o que faltava e `targetEnd = null`.
- **+ 1:00** soma 60 000 ms ao `targetEnd`.
- Cronômetro: `elapsed = swAccMs + (Date.now() - swStartedAt)`.
- O `setInterval` (250 ms) serve só para **redesenhar** e chamar `tick()`, que compara `Date.now() >= targetEnd`. Se o intervalo atrasar, o valor mostrado continua correto.
- Um listener de `visibilitychange` executa a atualização imediatamente quando você volta para a aba.
- `tick()` define `status: "idle"` **antes** de disparar efeitos (alarme, gravação), evitando disparo duplicado.
- Como `targetEnd` é persistido no `localStorage`, **recarregar a página com o timer rodando mantém o tempo correto**.

### 6.2 Autoplay de áudio (`lib/audio.ts`)

**Problema:** navegadores bloqueiam áudio que não nasceu de um gesto do usuário; o alarme ao fim do Pomodoro seria mudo.

**Solução:**
- `unlockAudio()` cria o `AudioContext` (com fallback `webkitAudioContext`), chama `resume()` se estiver `suspended` e toca um buffer mudo de 1 frame.
- É chamada **dentro do `onClick` de "Iniciar"** (e do botão "Testar" nas configurações).
- No fim do ciclo, `playAlarm()` reutiliza o contexto já liberado.
- Os sons são **sintetizados** com osciladores (sem arquivos de áudio, sem requisições): *Sino* (senoides 880/1760 Hz, 3 badaladas), *Digital* (onda quadrada alternando 1000/1200 Hz), *Bipe* (triângulo 660 Hz, 3 bipes). O volume escala o ganho.
- Tudo está em `try/catch`: se o áudio não existir, o timer funciona normalmente.

### 6.3 Conversão de fuso horário (`ProgressChart.tsx → aggregate`)

**Problema:** o Supabase guarda `timestamptz` em UTC. Uma sessão às 22h em São Paulo (UTC-3) é do dia seguinte em UTC; agrupar por data UTC põe a barra no dia errado.

**Solução:**
- `started_at` é um ISO em UTC; `new Date(iso)` o interpreta corretamente.
- O agrupamento usa **getters/setters locais** (`setHours(0,0,0,0)`, `getDay()`), ou seja, o dia **do relógio do usuário**.
- Início da semana = domingo local; índice do dia = diferença em dias (arredondada, tolerante a horário de verão).
- A sessão é gravada com `new Date(startedAt).toISOString()` (UTC) — a conversão é só na leitura.

### 6.4 Prevenção de FOUC / Hydration Mismatch

- `next-themes` com `attribute="class"` e `defaultTheme="dark"` injeta um script inline que define a classe do `<html>` **antes** da pintura → sem flash branco.
- `<html suppressHydrationWarning>` silencia o aviso esperado (a classe muda antes do React hidratar).
- O Zustand usa `persist` com **`skipHydration: true`**: servidor e primeiro render do cliente usam o estado padrão (idênticos); só depois, no `useEffect` de `Providers`, chama `useStore.persist.rehydrate()`. Isso evita divergência entre HTML do servidor e do cliente.
- Enquanto reidrata, a página fica com opacidade 0 e faz *fade-in* de 300 ms (ver seção 9).

### 6.5 Persistência offline (`store/useStore.ts`)

**Problema:** salvar a sessão no Supabase falha sem internet e o progresso se perde.

**Solução (fila local):**
- Toda sessão/nota/tarefa é gravada **primeiro** no estado local (que o `persist` espelha no `localStorage`) com `synced: false`.
- `flushPending()` tenta enviar (`upsert`) tudo que está pendente. Só marca `synced: true` se o Supabase responder sem erro. Falha → continua pendente (`catch` silencioso).
- Não tenta se `navigator.onLine` for falso ou se não houver login.
- É chamada: ao registrar/editar itens, ao logar (`loadRemote`) e no evento **`online`** do `window` (em `Providers`).
- Os IDs são UUIDs gerados no cliente, então o `upsert` é **idempotente** (reenviar não duplica).
- `loadRemote()` primeiro envia pendentes, depois baixa os dados do servidor e **mescla**, preservando o que ainda está pendente.
- Sem Supabase configurado, o app funciona só localmente (tudo fica no `localStorage`).

### 6.6 Resiliência da API de Calendário

- Toda chamada passa por `try/catch` (`refreshCalendar` e a criação de evento em `recordSession`).
- `lib/calendar.ts` converte HTTP 401/403 em `CalendarAuthError`.
  - **Token expirado:** limpa `providerToken`, esvazia os eventos e mostra toast *"Acesso ao Google Calendar expirou. Reconecte nas configurações."*
  - **API fora do ar / erro de rede:** toast *"Google Calendar indisponível. Usando modo manual."*
- Os toasts usam `id` fixo (`"cal"`) para **não empilhar** repetidos a cada minuto.
- Nada disso interrompe o timer: ele continua em modo manual.

---

## 7. Arquivos em detalhe

### `lib/types.ts`
Define `Phase`, `TimerMode`, `Status`, `TabId`, `AlarmSound` e as interfaces `Session`, `Note`, `Task`, `Settings`, `CalendarEvent`.

### `lib/supabase.ts`
- Cria o cliente **somente se** `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` existirem; caso contrário exporta `null` e o app roda sem nuvem.
- `signInWithGoogle()` / `signOut()`.

### `lib/calendar.ts`
`fetchTodayEvents`, `currentEvent`, `createStudyEvent` e `CalendarAuthError`.

### `lib/audio.ts`
`unlockAudio()` e `playAlarm(sound, volume)`.

### `store/useStore.ts`
Um único store Zustand com:
- **Timer:** `mode, phase, status, targetEnd, remainingMs, plannedMs, swStartedAt, swAccMs, sessionStartedAt, cycles` + ações `start, pause, reset, addMinute, tick, setMode, setPhase, getRemaining, getElapsed`.
- **Dados:** `subjects, subject, subjectManual, settings, sessions, notes, tasks` + ações de CRUD.
- **Conta/calendário:** `userId, userEmail, providerToken, calendarEvents, setAuth, refreshCalendar`.
- **Sync:** `flushPending, loadRemote`.
- **Persistência:** chave `foco-store` no `localStorage`; `partialize` salva tudo **exceto** funções e `calendarEvents`.

Detalhes de comportamento:
- `start()` no timer: `rem` = restante pausado ou duração da fase; define `targetEnd`, `plannedMs` e `sessionStartedAt`.
- `reset()` grava o progresso parcial (se ≥ 60 s) e volta ao estado ocioso.
- `updateSettings()` recalcula `plannedMs` se o timer estiver parado.

### `components/Providers.tsx`
Reúne: `ThemeProvider`, reidratação manual do store, escuta de autenticação do Supabase (`getSession` + `onAuthStateChange`), listener `online`, `setInterval` de 60 s para o calendário e o `Toaster` (estilizado com os tokens).

### `supabase/schema.sql`
Três tabelas — `study_sessions`, `notes`, `tasks` — com `user_id uuid default auth.uid()` e **Row Level Security** ligado: cada usuário só lê/escreve as próprias linhas (policy `auth.uid() = user_id`). `started_at` é `timestamptz`.

---

## 8. Configuração (para ativar a nuvem e o calendário)

1. **Supabase:** crie um projeto e execute `supabase/schema.sql` no SQL Editor.
2. **Variáveis:** copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Reinicie o `npm run dev`.
3. **Google Cloud Console:**
   - Ative a **Google Calendar API**.
   - Crie credenciais OAuth (tipo *Web*) e adicione como URI de redirecionamento autorizado o callback do Supabase (`https://SEU-PROJETO.supabase.co/auth/v1/callback`).
   - Na tela de consentimento, inclua o escopo `.../auth/calendar.events`.
4. **Supabase → Authentication → Providers → Google:** ative e cole Client ID/Secret. Em *URL Configuration*, adicione `http://localhost:3000` como Redirect URL.
5. No app: ⚙️ → **Conectar Google Calendar**.

**Comandos:** `npm run dev` (desenvolvimento), `npm run build` (produção), `npx tsc --noEmit` (checagem de tipos).

---

## 9. Correção: aviso "Next.js could not validate… instant navigation"

- **Sintoma:** o overlay do Next 16 mostrava `page.tsx — dropped from rendering`.
- **Causa:** `Providers` retornava um `<div>` vazio até o Zustand reidratar, então o servidor não renderizava a página.
- **Correção:** `children` agora é sempre renderizado; um wrapper aplica `opacity-0` até `ready` e depois `opacity-100` com transição. Como o estado padrão é igual no servidor e no primeiro render do cliente, não há mismatch.
- **Efeito:** o aviso é um *insight* (não erro). Recarregue a página para confirmar que sumiu.

## 10. Correção: fonte do relógio acima de 1 h e responsividade

- **Problema:** `1:00:00` (7 caracteres) estourava o círculo com a fonte fixa (`text-7xl` / `5.5rem`) e o círculo tinha 340 px fixos.
- **Círculo:** container `aspect-square w-[min(86vw,340px)]`; SVG com `viewBox` e `h-full w-full`, escalando com o container.
- **Fonte:** o container usa `container-type: inline-size` e o texto usa **`cqw`** (unidade relativa à largura do container): `22cqw` normalmente e **`15cqw` quando há horas** (`hasHours`). O texto fica em `whitespace-nowrap`, centralizado em um overlay `absolute inset-0 flex items-center justify-center`.
- **Cabeçalho:** `flex-wrap`; no mobile a logo fica em cima e as abas abaixo (largura total, com rolagem horizontal se necessário); no `sm+` volta à linha única.
- **Espaçamentos:** `px-4 py-8` no mobile, `sm:px-5 sm:py-14` em telas maiores.
- **Controles e seletor de matéria:** `flex-wrap` e `justify-center` para quebrar de linha em telas estreitas.
- Gráfico (`ResponsiveContainer`) e modal (`max-w-md`, `max-h-[90vh]`, `overflow-y-auto`) já eram fluidos.

---

## 11. Limitações e pontos de atenção conhecidos

1. **Token do Google não é renovado.** O `provider_token` vem do login e é guardado no `localStorage`. Quando expira, o app avisa e pede para reconectar. Renovar de verdade exigiria um backend com o `refresh_token`.
2. **Armazenar o token no `localStorage`** é conveniente, mas fica exposto a XSS. Para produção, considere um backend/rota de API.
3. **Exclusões não entram na fila offline.** Excluir nota/tarefa sem internet remove localmente, mas o `delete` remoto é uma tentativa única; ao sincronizar depois, o item pode reaparecer.
4. **`subjectManual` nunca volta a `false`.** Depois de escolher uma matéria manualmente, a sugestão do calendário deixa de atuar até recarregar com o armazenamento limpo.
5. **Sessões pendentes e troca de usuário:** dados locais não sincronizados são enviados para a conta que estiver logada no momento do `flush`.
6. **Gráfico mostra só a semana atual** (domingo–sábado); não há navegação para semanas anteriores.
7. **Trecho morto:** em `SettingsModal`, o botão "Conectar" tem `disabled={!supabase && false}` (sempre falso). Sem Supabase configurado, o clique mostra um toast explicando. É inofensivo, mas pode ser limpo.
8. **`@supabase/ssr`** instalado e não utilizado.
9. O `npm audit` reportou 5 vulnerabilidades (de dependências do scaffold); não foram tratadas.
10. Não foram escritos testes automatizados; a verificação foi por `tsc --noEmit` e execução em dev.

---

## 12. Ideias de evolução

- Navegação entre semanas no gráfico e meta diária de foco.
- Rota de API para renovar o token do Google com segurança.
- Fila offline para exclusões e resolução de conflitos.
- Notificações do sistema (`Notification API`) ao fim do ciclo.
- Atalhos de teclado (espaço = iniciar/pausar).
- PWA (instalável e com cache offline do app inteiro).
