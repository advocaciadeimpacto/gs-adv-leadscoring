-- Agenda dos closers — Advocacia de Impacto
-- Rode isto no SQL Editor do Supabase quando for sair do mockup.
-- A interface de db.js já corresponde a estas tabelas.

create extension if not exists btree_gist;

-- ---------------------------------------------------------------
create table closers (
  id          text primary key,
  nome        text not null,
  email       text,
  ativo       boolean not null default true,
  criado_em   timestamptz not null default now()
);

-- Janela de atendimento por closer e dia da semana (0 = domingo).
create table disponibilidade (
  id           bigserial primary key,
  closer_id    text not null references closers(id) on delete cascade,
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fim     time not null,
  check (hora_fim > hora_inicio)
);

-- Férias, folgas e compromissos fixos.
create table bloqueios (
  id         uuid primary key default gen_random_uuid(),
  closer_id  text not null references closers(id) on delete cascade,
  periodo    tstzrange not null,
  motivo     text,
  criado_em  timestamptz not null default now()
);

-- Cada preenchimento do quiz, com ou sem contato. Quem responde e não
-- agenda fica com lead nulo: é a medida de abandono do funil.
create table respostas (
  id               uuid primary key default gen_random_uuid(),
  score            smallint not null,
  score_base       smallint not null,
  ajuste           smallint not null default 0,
  classe           char(1) not null,
  degrau           text,
  degrau_estrutura text,
  qualidade        text,
  area             text,
  perfil           text,
  pontos           jsonb not null,
  detalhe          jsonb not null,
  lead             jsonb,
  agendamento_id   uuid,
  -- utm_source, utm_medium, utm_campaign, utm_content, utm_term,
  -- fbclid/gclid/ctwa_clid e a atribuição de primeiro toque
  origem           jsonb,
  criado_em        timestamptz not null default now()
);

create index on respostas (classe);
create index on respostas (criado_em desc);
create index on respostas ((origem->>'utm_source'));
create index on respostas ((origem->>'utm_campaign'));

create table agendamentos (
  id             uuid primary key default gen_random_uuid(),
  closer_id      text not null references closers(id),
  periodo        tstzrange not null,
  lead_nome      text not null,
  lead_email     text not null,
  lead_whatsapp  text not null,
  lead_escritorio text,
  score          smallint,
  classe         char(1),
  degrau         text,
  qualidade      text,
  respostas      jsonb,
  status         text not null default 'confirmado'
                 check (status in ('confirmado', 'cancelado', 'realizado', 'no_show')),
  origem         text,
  criado_em      timestamptz not null default now(),

  -- Impede duas reservas sobrepostas para o mesmo closer no banco.
  -- Resolve a corrida de dois leads clicando no mesmo horário ao mesmo tempo,
  -- coisa que validação no front nunca garante.
  constraint sem_sobreposicao exclude using gist (
    closer_id with =,
    periodo with &&
  ) where (status <> 'cancelado')
);

create index on agendamentos using gist (periodo);
create index on agendamentos (closer_id, status);
create index on bloqueios using gist (periodo);

-- Links de campanha gerados no painel. O status (ativo, parado, nunca usado)
-- não é uma coluna: é derivado do cruzamento com a tabela respostas, para
-- nunca ficar desatualizado em relação ao uso real.
create table links (
  id         uuid primary key default gen_random_uuid(),
  rotulo     text not null,
  source     text not null,
  medium     text not null,
  campaign   text not null,
  content    text,
  term       text,
  url        text not null,
  arquivado  boolean not null default false,
  criado_em  timestamptz not null default now(),
  unique (source, medium, campaign, content)
);

-- Auditoria dos webhooks disparados.
create table webhook_log (
  id         uuid primary key default gen_random_uuid(),
  evento     text not null,
  payload    jsonb not null,
  status     text,
  criado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------
-- RLS: a página pública só pode inserir resposta/agendamento e ler
-- closers ativos + horários ocupados (via função abaixo, sem nome de
-- lead nenhum). Ler dados de leads (nome, telefone, e-mail, respostas
-- do quiz) exige estar autenticado — é o painel interno, atrás do
-- login em admin.html/Supabase Auth. Sem isso, a chave anon (pública,
-- vive no JS do navegador) conseguiria ler os dados de todo mundo
-- direto pela API REST, sem nem passar pelo site.
alter table respostas     enable row level security;
alter table agendamentos  enable row level security;
alter table bloqueios     enable row level security;
alter table closers       enable row level security;
alter table links         enable row level security;
alter table webhook_log   enable row level security;

-- ---- anon (o site público: quiz, agendamento) ----

create policy "publico cria resposta"
  on respostas for insert to anon with check (true);

-- só deixa vincular contato a uma resposta que ainda não tem lead —
-- impede sobrescrever a resposta de outra pessoa adivinhando o id.
create policy "publico vincula lead a resposta propria"
  on respostas for update to anon
  using (lead is null) with check (true);

create policy "publico cria agendamento"
  on agendamentos for insert to anon with check (true);

create policy "publico le closers ativos"
  on closers for select to anon using (ativo);

create policy "publico cria log de webhook"
  on webhook_log for insert to anon with check (true);

-- A consulta de horários livres passa por uma função com security
-- definer: devolve só closer_id + período, nunca nome/telefone/e-mail
-- de lead, então pode ficar aberta pro anônimo com segurança.
create or replace function horarios_ocupados(de timestamptz, ate timestamptz)
returns table (closer_id text, periodo tstzrange)
language sql security definer stable as $$
  select a.closer_id, a.periodo
    from agendamentos a
   where a.status <> 'cancelado' and a.periodo && tstzrange(de, ate)
  union all
  select b.closer_id, b.periodo
    from bloqueios b
   where b.periodo && tstzrange(de, ate);
$$;

grant execute on function horarios_ocupados(timestamptz, timestamptz) to anon;

-- ---- authenticated (o painel interno, atrás do login) ----

create policy "painel le respostas"
  on respostas for select to authenticated using (true);

create policy "painel le agendamentos"
  on agendamentos for select to authenticated using (true);

create policy "painel cancela agendamento"
  on agendamentos for update to authenticated using (true) with check (true);

create policy "painel le closers"
  on closers for select to authenticated using (true);

create policy "painel le bloqueios"
  on bloqueios for select to authenticated using (true);

create policy "painel cria bloqueio"
  on bloqueios for insert to authenticated with check (true);

create policy "painel remove bloqueio"
  on bloqueios for delete to authenticated using (true);

create policy "painel gerencia links"
  on links for all to authenticated using (true) with check (true);

create policy "painel le webhook log"
  on webhook_log for select to authenticated using (true);

-- ---------------------------------------------------------------
insert into closers (id, nome, email) values
  ('c1', 'Closer 1', 'closer1@advocaciadeimpacto.adv.br'),
  ('c2', 'Closer 2', 'closer2@advocaciadeimpacto.adv.br'),
  ('c3', 'Closer 3', 'closer3@advocaciadeimpacto.adv.br');

insert into disponibilidade (closer_id, dia_semana, hora_inicio, hora_fim)
select c.id, d.dia, b.ini, b.fim
  from closers c
  cross join (values (1),(2),(3),(4),(5)) as d(dia)
  cross join (values ('09:00'::time,'12:00'::time), ('14:00'::time,'18:00'::time)) as b(ini,fim);
