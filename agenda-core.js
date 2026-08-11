/* Núcleo da agenda: geração de horários, disponibilidade e sorteio de closer.
   Sem DOM aqui, para poder ser testado isolado. */

import { db, EXPEDIENTE } from './db.js';

const MIN = 60000;
const FUSO = 'America/Sao_Paulo';

/* A agenda é sempre no fuso do escritório, nunca no do navegador de quem
   está agendando: sem isso, um advogado em outro fuso via horários
   deslocados (9h vira 8h, 10h, o que for). Exibição usa Intl com o fuso
   explícito. Geração usa -3h fixo porque o Brasil não tem mais horário de
   verão desde 2019; se isso mudar de novo, a geração precisa passar a
   consultar o offset via Intl também, como a exibição já faz. */
const OFFSET_FUSO_MIN = 180;

export const iso = d => d.toISOString();
export const fmtHora = d => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
export const fmtDataLonga = d => d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: FUSO });
export const fmtDataCurta = d => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO });

const fmtChaveDia = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/* Chave estável do "dia" de um instante, sempre no fuso do escritório
   (AAAA-MM-DD). É o que identifica um dia no calendário — nunca
   toDateString(), que lê o fuso do navegador de quem está olhando. */
export const chaveDia = d => fmtChaveDia.format(d);

/* Mesma chave, a partir de um ano/mês(0-based)/dia já conhecidos — para a
   grade do calendário, que itera dias sem ter um Date de cada um ainda. */
export const chaveDoDia = (ano, mesIndex0, dia) =>
  `${ano}-${String(mesIndex0 + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;

/* Um instante qualquer dentro da chave de dia, só para formatar (fmtDataLonga
   etc). Meio-dia UTC nunca cruza a virada de data ao converter para o fuso
   do escritório, então o dia exibido é sempre o mesmo da chave. */
export const dataDoDia = diaChave => {
  const [ano, mes, dia] = diaChave.split('-').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, 12));
};

/* Converte uma hora de parede (ex.: bloqueio de agenda digitado pelo time)
   na chave de um dia + "HH:MM" para o instante real, sempre assumindo que
   esse horário foi pensado no fuso do escritório — não no do navegador de
   quem está preenchendo o formulário. */
export function instanteNoFuso(diaChave, horaStr) {
  const [ano, mes, dia] = diaChave.split('-').map(Number);
  const [h, m] = horaStr.split(':').map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia, h, m) + OFFSET_FUSO_MIN * MIN);
}

const hhmmParaMin = s => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/* Todos os horários teóricos de um dia (chave AAAA-MM-DD, no fuso do
   escritório), sem olhar ocupação. */
export function slotsDoDia(diaChave) {
  const [ano, mes, dia] = diaChave.split('-').map(Number);
  const pesoSemana = new Date(ano, mes - 1, dia).getDay();
  const out = [];
  if (!EXPEDIENTE.diasSemana.includes(pesoSemana)) return out;
  for (const [ini, fim] of EXPEDIENTE.blocos) {
    for (let m = hhmmParaMin(ini); m + EXPEDIENTE.duracaoMin <= hhmmParaMin(fim); m += EXPEDIENTE.duracaoMin) {
      out.push(new Date(Date.UTC(ano, mes - 1, dia, 0, m) + OFFSET_FUSO_MIN * MIN));
    }
  }
  return out;
}

/* Os próximos N dias (chaves AAAA-MM-DD) que têm expediente, contados a
   partir de hoje no fuso do escritório. */
export function diasDaJanela(hoje = new Date()) {
  const [anoBase, mesBase, diaBase] = chaveDia(hoje).split('-').map(Number);
  const dias = [];
  for (let i = 0; i < EXPEDIENTE.janelaDias; i++) {
    // new Date(ano, mes, dia+i) rola o mês/ano sozinho quando dia+i estoura o mês
    const d = new Date(anoBase, mesBase - 1, diaBase + i);
    if (EXPEDIENTE.diasSemana.includes(d.getDay())) {
      dias.push(chaveDoDia(d.getFullYear(), d.getMonth(), d.getDate()));
    }
  }
  return dias;
}

const ocupado = (closerId, inicioISO, ocupacoes) => {
  const t = new Date(inicioISO).getTime();
  const fim = t + EXPEDIENTE.duracaoMin * MIN;
  return ocupacoes.some(o =>
    o.closer_id === closerId &&
    t < new Date(o.fim).getTime() && fim > new Date(o.inicio).getTime());
};

/* Carrega o estado e devolve, para cada horário, quem está livre.
   Um horário aparece para o lead se pelo menos um closer estiver livre. */
export async function mapaDeDisponibilidade(hoje = new Date()) {
  const de = hoje;
  const ate = new Date(hoje.getTime() + (EXPEDIENTE.janelaDias + 1) * 24 * 60 * MIN);

  const [{ data: closers }, { data: ocupacoes }] = await Promise.all([
    db.listarClosers(), db.horariosOcupados(iso(de), iso(ate))
  ]);

  const limite = Date.now() + EXPEDIENTE.antecedenciaMinHoras * 60 * MIN;
  const mapa = new Map();

  for (const diaChave of diasDaJanela(hoje)) {
    const livresNoDia = [];
    for (const slot of slotsDoDia(diaChave)) {
      if (slot.getTime() < limite) continue;
      const livres = closers.filter(c => !ocupado(c.id, iso(slot), ocupacoes));
      if (livres.length) livresNoDia.push({ inicio: iso(slot), livres: livres.map(c => c.id) });
    }
    if (livresNoDia.length) mapa.set(diaChave, livresNoDia);
  }
  return { mapa, closers, ocupacoes };
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
