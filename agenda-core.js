/* Núcleo da agenda: geração de horários, disponibilidade e sorteio de closer.
   Sem DOM aqui, para poder ser testado isolado. */

import { db, EXPEDIENTE } from './db.js';

const MIN = 60000;

export const iso = d => d.toISOString();
export const fmtHora = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const fmtDataLonga = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDataCurta = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

const hhmmParaMin = s => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/* Todos os horários teóricos de um dia, sem olhar ocupação. */
export function slotsDoDia(data) {
  const out = [];
  if (!EXPEDIENTE.diasSemana.includes(data.getDay())) return out;
  for (const [ini, fim] of EXPEDIENTE.blocos) {
    for (let m = hhmmParaMin(ini); m + EXPEDIENTE.duracaoMin <= hhmmParaMin(fim); m += EXPEDIENTE.duracaoMin) {
      const d = new Date(data);
      d.setHours(0, m, 0, 0);
      out.push(d);
    }
  }
  return out;
}

/* Os próximos N dias que têm expediente. */
export function diasDaJanela(hoje = new Date()) {
  const dias = [];
  for (let i = 0; i < EXPEDIENTE.janelaDias; i++) {
    const d = new Date(hoje);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    if (EXPEDIENTE.diasSemana.includes(d.getDay())) dias.push(d);
  }
  return dias;
}

const ocupado = (closerId, inicioISO, agendamentos, bloqueios) => {
  const t = new Date(inicioISO).getTime();
  const fim = t + EXPEDIENTE.duracaoMin * MIN;
  const bateu = (a, b) => t < b && fim > a;
  const temAgenda = agendamentos.some(a =>
    a.closer_id === closerId && a.status !== 'cancelado' &&
    bateu(new Date(a.inicio).getTime(), new Date(a.fim).getTime()));
  const temBloqueio = bloqueios.some(b =>
    b.closer_id === closerId &&
    bateu(new Date(b.inicio).getTime(), new Date(b.fim).getTime()));
  return temAgenda || temBloqueio;
};

/* Carrega o estado e devolve, para cada horário, quem está livre.
   Um horário aparece para o lead se pelo menos um closer estiver livre. */
export async function mapaDeDisponibilidade(hoje = new Date()) {
  const [{ data: closers }, { data: agendamentos }, { data: bloqueios }] = await Promise.all([
    db.listarClosers(), db.listarAgendamentos(), db.listarBloqueios()
  ]);

  const limite = Date.now() + EXPEDIENTE.antecedenciaMinHoras * 60 * MIN;
  const mapa = new Map();

  for (const dia of diasDaJanela(hoje)) {
    const livresNoDia = [];
    for (const slot of slotsDoDia(dia)) {
      if (slot.getTime() < limite) continue;
      const livres = closers.filter(c => !ocupado(c.id, iso(slot), agendamentos, bloqueios));
      if (livres.length) livresNoDia.push({ inicio: iso(slot), livres: livres.map(c => c.id) });
    }
    if (livresNoDia.length) mapa.set(dia.toDateString(), livresNoDia);
  }
  return { mapa, closers, agendamentos };
}

/* Sorteio aleatório entre os closers livres naquele horário.
   O lead não escolhe e nem vê quem foi: a atribuição é interna.

   Para trocar por distribuição equilibrada (menor carga primeiro),
   substitua o corpo por: ordene `idsLivres` pela contagem de agendamentos
   confirmados de cada um e devolva o primeiro. */
export function sortearCloser(idsLivres) {
  return idsLivres[Math.floor(Math.random() * idsLivres.length)];
}

export async function agendar({ inicio, idsLivres, lead, contexto }) {
  const closerId = sortearCloser(idsLivres);
  const fim = new Date(new Date(inicio).getTime() + EXPEDIENTE.duracaoMin * MIN);

  const { data, error } = await db.criarAgendamento({
    closer_id: closerId,
    inicio,
    fim: iso(fim),
    lead_nome: lead.nome,
    lead_email: lead.email,
    lead_whatsapp: lead.whatsapp,
    lead_escritorio: lead.escritorio || null,
    score: contexto?.score ?? null,
    classe: contexto?.classe ?? null,
    degrau: contexto?.degrau ?? null,
    qualidade: contexto?.qualidade ?? null,
    origem: contexto?.origem || 'quiz-lead-scoring'
  });

  return { data, error, closerId };
}

export { db, EXPEDIENTE };
