/* Camada de dados — Advocacia de Impacto
   ------------------------------------------------------------------
   Supabase de verdade (supabase-client.js). A interface abaixo é a
   mesma que já existia quando isto era localStorage — async, sempre
   devolvendo { data, error } — então nada em quiz.js, agendar.js,
   painel.js ou agenda-core.js precisou mudar por causa desta troca.
   O DDL e as políticas de RLS estão em supabase-schema.sql.
   ------------------------------------------------------------------ */

import { supabase } from './supabase-client.js';

/* Janela de atendimento, igual para os três. Ainda estática: a tabela
   `disponibilidade` do schema existe, mas nada no app lê dela ainda —
   próximo passo, não este. */
const EXPEDIENTE = {
  diasSemana: [1, 2, 3, 4, 5],          // segunda a sexta
  blocos: [['09:00', '12:00'], ['14:00', '18:00']],
  duracaoMin: 30,
  antecedenciaMinHoras: 24,             // não deixa marcar para daqui a pouco
  janelaDias: 21                        // quantos dias para frente abrir a agenda
};

/* agendamentos e bloqueios guardam o intervalo como `periodo` (tstzrange),
   não como inicio/fim separados — é o tipo que permite a constraint de
   exclusão no banco (sem_sobreposicao) impedir duas reservas coladas no
   mesmo closer. O resto do app (agenda-core.js, painel.js, agendar.js)
   trabalha com inicio/fim como strings ISO, então cada leitura passa por
   aqui e cada escrita passa por periodoParaTexto(). */
function lerPeriodo(periodo) {
  const corpo = periodo.slice(1, -1);
  const [iniStr, fimStr] = corpo.split(',').map(s => s.replace(/^"|"$/g, ''));
  return { inicio: new Date(iniStr).toISOString(), fim: new Date(fimStr).toISOString() };
}

const comPeriodo = row => row.periodo ? { ...row, ...lerPeriodo(row.periodo) } : row;

const periodoParaTexto = (inicioISO, fimISO) => `[${inicioISO},${fimISO})`;

export const db = {
  async listarClosers() {
    const { data, error } = await supabase.from('closers').select('*').eq('ativo', true);
    return { data: data || [], error };
  },

  /* Usada pelo fluxo público (mapaDeDisponibilidade em agenda-core.js)
     pra saber quais horários estão ocupados, sem ler agendamentos ou
     bloqueios inteiros — a política de RLS só libera respostas e
     agendamentos completos pra quem está autenticado (o painel). A
     função horarios_ocupados() do banco devolve só closer_id + período,
     nunca nome/telefone/e-mail de lead, então pode ficar aberta pro
     anônimo com segurança. */
  async horariosOcupados(de, ate) {
    const { data, error } = await supabase.rpc('horarios_ocupados', { de, ate });
    return { data: (data || []).map(comPeriodo), error };
  },

  /* Cada preenchimento do quiz vira um registro, com ou sem contato.
     O contato é vinculado depois, se a pessoa agendar.

     O id é gerado aqui, não pelo banco: quem preenche o quiz é anônimo,
     e a política de RLS de respostas não libera SELECT pra anon (só
     INSERT) — sem isso, `.select().single()` depois do insert não
     teria como confirmar que o retorno bate com a política de leitura,
     e o app ficaria refém desse detalhe. Gerando o id aqui, a resposta
     nunca depende do retorno do insert pra saber o próprio id. */
  async criarResposta(dados) {
    const registro = { id: crypto.randomUUID(), criado_em: new Date().toISOString(), lead: null, agendamento_id: null, ...dados };
    const { error } = await supabase.from('respostas').insert(registro);
    return { data: error ? null : registro, error };
  },

  async listarRespostas() {
    const { data, error } = await supabase.from('respostas').select('*').order('criado_em', { ascending: false });
    return { data: data || [], error };
  },

  /* forms_adv é alimentada pelo workflow do n8n que recebe o webhook
     (evento resposta.criada), não pelo site diretamente — uma coluna de
     texto por pergunta, mais Score/Classe/Degrau/Qualidade/Area/Perfil já
     calculados. É o que a aba Respostas do painel mostra hoje. */
  async listarFormsAdv() {
    const { data, error } = await supabase.from('forms_adv').select('*').order('id', { ascending: false });
    return { data: data || [], error };
  },

  /* Mesmo motivo do criarResposta: anon não tem SELECT em respostas, então
     não dá pra confirmar via retorno se a linha existia ou já tinha lead.
     A política de RLS (using (lead is null)) garante que, se a resposta já
     tinha contato, o update não afeta nada — silenciosamente, sem erro.
     É uma perda pequena (não sabemos mais dizer "resposta não encontrada"
     de verdade), mas ninguém usa esse retorno hoje: agendar.js só chama
     e segue em frente. */
  async vincularLead(respostaId, lead, agendamentoId) {
    const { error } = await supabase.from('respostas')
      .update({ lead, agendamento_id: agendamentoId })
      .eq('id', respostaId);
    return { data: error ? null : { id: respostaId, lead, agendamento_id: agendamentoId }, error };
  },

  async listarAgendamentos() {
    const { data, error } = await supabase.from('agendamentos').select('*').order('criado_em', { ascending: false });
    return { data: (data || []).map(comPeriodo), error };
  },

  async listarBloqueios() {
    const { data, error } = await supabase.from('bloqueios').select('*');
    return { data: (data || []).map(comPeriodo), error };
  },

  /* A checagem de conflito é a constraint de exclusão do Postgres
     (sem_sobreposicao em supabase-schema.sql), não mais um `.some()` em
     memória: ela resolve a corrida de dois cliques simultâneos de verdade,
     coisa que validação no front nunca garante. Código 23P01 = exclusão
     violada. Erros continuam voltando mesmo sem `.select()` — só o dado
     de sucesso que precisa vir montado aqui, pelo mesmo motivo do
     criarResposta (anon não lê agendamentos, só insere). */
  async criarAgendamento(dados) {
    const { inicio, fim, ...resto } = dados;
    const registro = { id: crypto.randomUUID(), status: 'confirmado', criado_em: new Date().toISOString(), ...resto, inicio, fim };
    const { error } = await supabase.from('agendamentos')
      .insert({ id: registro.id, status: registro.status, criado_em: registro.criado_em, ...resto, periodo: periodoParaTexto(inicio, fim) });
    if (error) {
      if (error.code === '23P01') {
        return { data: null, error: { message: 'Esse horário acabou de ser preenchido. Escolha outro.' } };
      }
      return { data: null, error };
    }
    return { data: registro, error: null };
  },

  async cancelarAgendamento(id) {
    const { data, error } = await supabase.from('agendamentos')
      .update({ status: 'cancelado' })
      .eq('id', id)
      .select()
      .single();
    if (error) return { data: null, error: { message: 'Agendamento não encontrado.' } };
    return { data: comPeriodo(data), error: null };
  },

  async criarBloqueio(dados) {
    const { inicio, fim, ...resto } = dados;
    const { data, error } = await supabase.from('bloqueios')
      .insert({ ...resto, periodo: periodoParaTexto(inicio, fim) })
      .select()
      .single();
    return { data: data ? comPeriodo(data) : null, error };
  },

  async removerBloqueio(id) {
    const { error } = await supabase.from('bloqueios').delete().eq('id', id);
    return { data: !error, error };
  },

  async listarWebhooks() {
    const { data, error } = await supabase.from('webhook_log').select('*').order('criado_em', { ascending: false });
    return { data: data || [], error };
  },

  /* Links de campanha gerados pelo painel. A duplicidade (mesmo source +
     medium + campaign + content) é travada por `unique` no banco — o
     código só reage ao 23505 (violação de unicidade) pra devolver a
     mensagem amigável com o rótulo do link que já existe. */
  async criarLink(dados) {
    const { data, error } = await supabase.from('links').insert(dados).select().single();
    if (!error) return { data, error: null };
    if (error.code !== '23505') return { data: null, error };

    // painel.js sempre manda content como string (possivelmente vazia),
    // nunca null/undefined — então o critério de igualdade é sempre eq().
    const { data: existente } = await supabase.from('links').select('*')
      .eq('source', dados.source).eq('medium', dados.medium)
      .eq('campaign', dados.campaign).eq('content', dados.content ?? '')
      .maybeSingle();
    return { data: existente, error: { message: `Esse link já existe, com o rótulo "${existente?.rotulo ?? ''}".` } };
  },

  async listarLinks() {
    const { data, error } = await supabase.from('links').select('*').order('criado_em', { ascending: false });
    return { data: data || [], error };
  },

  async arquivarLink(id, arquivado = true) {
    const { data, error } = await supabase.from('links').update({ arquivado }).eq('id', id).select().single();
    if (error) return { data: null, error: { message: 'Link não encontrado.' } };
    return { data, error: null };
  },

  async removerLink(id) {
    const { error } = await supabase.from('links').delete().eq('id', id);
    return { data: true, error };
  }
};

const WEBHOOK_URL = 'https://n8n.advocaciadeimpacto.adv.br/webhook/adv-impacto-forms';

/* Webhook. O registro em webhook_log fica como auditoria mesmo com o
   POST real: se o endpoint cair, o payload não se perde, só não chega
   na hora. Falha no fetch nunca impede o fluxo do lead — nem falha ao
   gravar o log. */
export async function dispararWebhook(evento, payload) {
  const envelope = { id: crypto.randomUUID(), evento, criado_em: new Date().toISOString(), payload };
  let status = 'enviado';

  try {
    // 'no-cors' + Content-Type: text/plain evita o preflight de CORS —
    // sem isso, se o endpoint não devolver os headers certos, o POST
    // inteiro é bloqueado pelo navegador antes de sair. Ver histórico
    // do repositório para o motivo detalhado (bug real, já reproduzido).
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(envelope)
    });
  } catch (e) {
    status = 'falha_rede';
    console.error('[webhook] falha ao enviar', evento, e);
  }

  const { error } = await supabase.from('webhook_log').insert({ evento, payload, status });
  if (error) console.error('[webhook] falha ao registrar log', evento, error);

  return { data: envelope, error: null };
}

export { EXPEDIENTE };
