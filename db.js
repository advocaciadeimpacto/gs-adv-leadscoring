/* Camada de dados — Advocacia de Impacto
   ------------------------------------------------------------------
   MOCKUP: hoje grava em localStorage. A interface abaixo é a mesma que
   o supabase-js expõe (async, retornando { data, error }), então trocar
   pelo banco real é substituir o corpo de cada função, sem tocar no
   resto do sistema. O DDL das tabelas está em supabase-schema.sql.

   Exemplo do que cada função vira em produção:
     listarAgendamentos() -> supabase.from('agendamentos').select('*')
     criarAgendamento(x)  -> supabase.from('agendamentos').insert(x).select().single()
   ------------------------------------------------------------------ */

const CHAVES = {
  respostas:    'adv_respostas',
  agendamentos: 'adv_agendamentos',
  bloqueios:    'adv_bloqueios',
  webhooks:     'adv_webhook_log',
  links:        'adv_links'
};

/* Troque pelos nomes reais dos closers. O lead nunca vê esses nomes:
   a atribuição é automática e só aparece na agenda interna. */
const CLOSERS = [
  { id: 'c1', nome: 'Closer 1', ativo: true },
  { id: 'c2', nome: 'Closer 2', ativo: true },
  { id: 'c3', nome: 'Closer 3', ativo: true }
];

/* Janela de atendimento, igual para os três. Em produção isso vira a
   tabela `disponibilidade`, com uma linha por closer e dia da semana. */
const EXPEDIENTE = {
  diasSemana: [1, 2, 3, 4, 5],          // segunda a sexta
  blocos: [['09:00', '12:00'], ['14:00', '18:00']],
  duracaoMin: 30,
  antecedenciaMinHoras: 24,             // não deixa marcar para daqui a pouco
  janelaDias: 21                        // quantos dias para frente abrir a agenda
};

const ler = chave => {
  try { return JSON.parse(localStorage.getItem(chave)) || []; }
  catch { return []; }
};
const gravar = (chave, valor) => localStorage.setItem(chave, JSON.stringify(valor));
const uid = () => 'a_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const espera = () => new Promise(r => setTimeout(r, 90)); // simula latência de rede

export const db = {
  async listarClosers() {
    await espera();
    return { data: CLOSERS.filter(c => c.ativo), error: null };
  },

  /* Cada preenchimento do quiz vira um registro, com ou sem contato.
     O contato é vinculado depois, se a pessoa agendar. */
  async criarResposta(dados) {
    await espera();
    const todas = ler(CHAVES.respostas);
    const registro = { id: uid(), criado_em: new Date().toISOString(), lead: null, agendamento_id: null, ...dados };
    todas.push(registro);
    gravar(CHAVES.respostas, todas);
    return { data: registro, error: null };
  },

  async listarRespostas() {
    await espera();
    return { data: ler(CHAVES.respostas).slice().reverse(), error: null };
  },

  async vincularLead(respostaId, lead, agendamentoId) {
    await espera();
    const todas = ler(CHAVES.respostas);
    const r = todas.find(x => x.id === respostaId);
    if (!r) return { data: null, error: { message: 'Resposta não encontrada.' } };
    r.lead = lead;
    r.agendamento_id = agendamentoId;
    gravar(CHAVES.respostas, todas);
    return { data: r, error: null };
  },

  async listarAgendamentos() {
    await espera();
    return { data: ler(CHAVES.agendamentos), error: null };
  },

  async listarBloqueios() {
    await espera();
    return { data: ler(CHAVES.bloqueios), error: null };
  },

  /* Grava o agendamento. A checagem de conflito acontece aqui dentro,
     porque é a última linha de defesa contra duas pessoas marcarem o
     mesmo horário. Em produção isso vira uma constraint de exclusão no
     Postgres (veja supabase-schema.sql), que resolve a corrida de forma
     definitiva mesmo com dois cliques simultâneos. */
  async criarAgendamento(dados) {
    await espera();
    const todos = ler(CHAVES.agendamentos);
    const conflito = todos.some(a =>
      a.closer_id === dados.closer_id &&
      a.status !== 'cancelado' &&
      a.inicio === dados.inicio
    );
    if (conflito) {
      return { data: null, error: { message: 'Esse horário acabou de ser preenchido. Escolha outro.' } };
    }
    const registro = { id: uid(), status: 'confirmado', criado_em: new Date().toISOString(), ...dados };
    todos.push(registro);
    gravar(CHAVES.agendamentos, todos);
    return { data: registro, error: null };
  },

  async cancelarAgendamento(id) {
    await espera();
    const todos = ler(CHAVES.agendamentos);
    const item = todos.find(a => a.id === id);
    if (!item) return { data: null, error: { message: 'Agendamento não encontrado.' } };
    item.status = 'cancelado';
    gravar(CHAVES.agendamentos, todos);
    return { data: item, error: null };
  },

  async criarBloqueio(dados) {
    await espera();
    const todos = ler(CHAVES.bloqueios);
    const registro = { id: uid(), criado_em: new Date().toISOString(), ...dados };
    todos.push(registro);
    gravar(CHAVES.bloqueios, todos);
    return { data: registro, error: null };
  },

  async removerBloqueio(id) {
    await espera();
    gravar(CHAVES.bloqueios, ler(CHAVES.bloqueios).filter(b => b.id !== id));
    return { data: true, error: null };
  },

  async listarWebhooks() {
    await espera();
    return { data: ler(CHAVES.webhooks).slice().reverse(), error: null };
  },

  /* Links de campanha gerados pelo painel. Ficam salvos para o time saber
     o que está no ar e para cruzar com os leads que chegaram. */
  async criarLink(dados) {
    await espera();
    const todos = ler(CHAVES.links);
    const igual = todos.find(l =>
      l.source === dados.source && l.medium === dados.medium &&
      l.campaign === dados.campaign && (l.content || '') === (dados.content || ''));
    if (igual) return { data: igual, error: { message: 'Esse link já existe, com o rótulo "' + igual.rotulo + '".' } };
    const registro = { id: uid(), criado_em: new Date().toISOString(), arquivado: false, ...dados };
    todos.push(registro);
    gravar(CHAVES.links, todos);
    return { data: registro, error: null };
  },

  async listarLinks() {
    await espera();
    return { data: ler(CHAVES.links).slice().reverse(), error: null };
  },

  async arquivarLink(id, arquivado = true) {
    await espera();
    const todos = ler(CHAVES.links);
    const l = todos.find(x => x.id === id);
    if (!l) return { data: null, error: { message: 'Link não encontrado.' } };
    l.arquivado = arquivado;
    gravar(CHAVES.links, todos);
    return { data: l, error: null };
  },

  async removerLink(id) {
    await espera();
    gravar(CHAVES.links, ler(CHAVES.links).filter(l => l.id !== id));
    return { data: true, error: null };
  },

  async limparTudo() {
    Object.values(CHAVES).forEach(c => localStorage.removeItem(c));
    return { data: true, error: null };
  }
};

const WEBHOOK_URL = 'https://webhook.advocaciadeimpacto.adv.br/webhook/forms-adv';

/* Webhook. O registro local fica como fallback de auditoria mesmo com o
   POST real: se o endpoint cair, o payload não se perde, só não chega
   na hora. Falha no fetch nunca impede o fluxo do lead. */
export async function dispararWebhook(evento, payload) {
  const envelope = {
    id: uid(),
    evento,
    criado_em: new Date().toISOString(),
    payload
  };
  const log = ler(CHAVES.webhooks);
  log.push(envelope);
  gravar(CHAVES.webhooks, log);

  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope)
    });
  } catch (e) {
    console.error('[webhook] falha ao enviar', evento, e);
  }

  return { data: envelope, error: null };
}

export { CLOSERS, EXPEDIENTE };
