/* Fluxo de agendamento do lead: calendário, horário, dados, confirmação. */

import { db, dispararWebhook } from './db.js';
import { mapaDeDisponibilidade, agendar, slotsDoDia,
         fmtHora, fmtDataLonga, EXPEDIENTE } from './agenda-core.js';
import { capturarOrigem, origemAtual } from './origem.js';

capturarOrigem();

const palco = document.querySelector('#palco');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const formatarTelefone = v => {
  const n = String(v ?? '').replace(/\D/g, '').slice(0, 11);
  return n.length > 10 ? `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
       : n.length > 6  ? `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
       : n.length > 2  ? `(${n.slice(0,2)}) ${n.slice(2)}`
       : n;
};

const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];
const DIAS_CURTOS = ['D','S','T','Q','Q','S','S'];

let mapa = new Map();
let mesVisivel = new Date();
let diaSel = null;
let slotSel = null;

const contexto = (() => {
  try { return JSON.parse(sessionStorage.getItem('adv_contexto_lead')) || null; }
  catch { return null; }
})();

/* ---------- etapa 1: data e hora ---------- */

async function telaEscolha() {
  palco.innerHTML = '<p class="carregando">Carregando horários disponíveis...</p>';
  const res = await mapaDeDisponibilidade();
  mapa = res.mapa;

  const primeiro = [...mapa.keys()][0];
  if (!primeiro) {
    palco.innerHTML = `<div class="step"><h1 class="q-title">Sem horários abertos no momento</h1>
      <p class="q-help">A agenda das próximas semanas está cheia. Responda nossa mensagem no WhatsApp que encaixamos você manualmente.</p></div>`;
    return;
  }
  if (!diaSel) diaSel = new Date(primeiro);
  mesVisivel = new Date(diaSel.getFullYear(), diaSel.getMonth(), 1);
  render();
}

function render() {
  palco.innerHTML = `
    <div class="step agendar-grid">
      <aside class="resumo">
        <span class="eyebrow">Sessão Estratégica</span>
        <h1>Escolha o melhor horário</h1>
        <dl class="resumo-lista">
          <div><dt>Duração</dt><dd>30 minutos</dd></div>
          <div><dt>Formato</dt><dd>Online, por videochamada</dd></div>
          <div><dt>Com quem</dt><dd>Um especialista do nosso time comercial</dd></div>
        </dl>
        <p class="resumo-nota">O link da chamada chega no seu e-mail e no WhatsApp logo após a confirmação.</p>
      </aside>

      <section class="calendario">
        <div class="cal-topo">
          <button class="cal-nav" id="mesAnterior" aria-label="Mês anterior">‹</button>
          <strong>${MESES[mesVisivel.getMonth()]} de ${mesVisivel.getFullYear()}</strong>
          <button class="cal-nav" id="mesSeguinte" aria-label="Próximo mês">›</button>
        </div>
        <div class="cal-semana" aria-hidden="true">${DIAS_CURTOS.map(d => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grade" role="grid">${gradeDoMes()}</div>
      </section>

      <section class="horarios">
        <h2>${diaSel ? fmtDataLonga(diaSel) : ''}</h2>
        <div class="slots">${listaDeSlots()}</div>
      </section>
    </div>`;

  document.querySelector('#mesAnterior').onclick = () => moverMes(-1);
  document.querySelector('#mesSeguinte').onclick = () => moverMes(1);

  palco.querySelectorAll('.cal-dia:not([disabled])').forEach(b => {
    b.onclick = () => { diaSel = new Date(b.dataset.dia); slotSel = null; render(); };
  });
  palco.querySelectorAll('.slot').forEach(b => {
    b.onclick = () => { slotSel = { inicio: b.dataset.inicio, livres: b.dataset.livres.split(',') }; telaDados(); };
  });
}

function moverMes(delta) {
  mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + delta, 1);
  render();
}

function gradeDoMes() {
  const ano = mesVisivel.getFullYear(), mes = mesVisivel.getMonth();
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  let html = '';
  for (let i = 0; i < primeiroDia; i++) html += '<span class="cal-vazio"></span>';
  for (let d = 1; d <= totalDias; d++) {
    const data = new Date(ano, mes, d);
    const tem = mapa.has(data.toDateString());
    const sel = diaSel && data.toDateString() === diaSel.toDateString();
    html += `<button class="cal-dia${sel ? ' sel' : ''}${tem ? ' livre' : ''}"
              data-dia="${data.toDateString()}" ${tem ? '' : 'disabled'}
              aria-label="${d} de ${MESES[mes]}${tem ? '' : ', sem horários'}">${d}</button>`;
  }
  return html;
}

function listaDeSlots() {
  const lista = diaSel ? mapa.get(diaSel.toDateString()) : null;
  if (!lista || !lista.length) return '<p class="slots-vazio">Sem horários livres neste dia.</p>';
  return lista.map(s => {
    const d = new Date(s.inicio);
    return `<button class="slot chanfro" data-inicio="${s.inicio}" data-livres="${s.livres.join(',')}">${fmtHora(d)}</button>`;
  }).join('');
}

/* ---------- etapa 2: dados do lead ---------- */

function telaDados() {
  const d = new Date(slotSel.inicio);
  palco.innerHTML = `
    <div class="step estreito">
      <button class="btn-back" id="voltar">← Escolher outro horário</button>
      <span class="eyebrow">Confirmação</span>
      <h1 class="q-title">Falta só saber quem é você</h1>
      <p class="marcado chanfro">${fmtDataLonga(d)}, às <strong>${fmtHora(d)}</strong> · 30 minutos</p>

      <form id="form" novalidate>
        <div class="field">
          <label for="nome">Nome completo</label>
          <input id="nome" name="nome" type="text" autocomplete="name" value="${esc(contexto?.lead?.nome)}" required>
        </div>
        <div class="field">
          <label for="escritorio">Nome do escritório</label>
          <input id="escritorio" name="escritorio" type="text" autocomplete="organization">
        </div>
        <div class="field">
          <label for="whatsapp">WhatsApp com DDD</label>
          <input id="whatsapp" name="whatsapp" type="tel" inputmode="numeric" placeholder="(11) 90000-0000" value="${esc(formatarTelefone(contexto?.lead?.whatsapp))}" required>
        </div>
        <div class="field">
          <label for="email">E-mail</label>
          <input id="email" name="email" type="email" autocomplete="email" value="${esc(contexto?.lead?.email)}" required>
        </div>
        <p class="erro" id="erro" hidden></p>
        <button class="btn chanfro" type="submit" id="confirmar">Confirmar agendamento</button>
      </form>
    </div>`;

  document.querySelector('#voltar').onclick = () => { slotSel = null; render(); };

  const wpp = document.querySelector('#whatsapp');
  wpp.oninput = () => { wpp.value = formatarTelefone(wpp.value); };

  document.querySelector('#form').onsubmit = async e => {
    e.preventDefault();
    const erro = document.querySelector('#erro');
    const nome = document.querySelector('#nome').value.trim();
    const email = document.querySelector('#email').value.trim();
    const whatsapp = wpp.value.replace(/\D/g, '');
    const escritorio = document.querySelector('#escritorio').value.trim();

    const falha = !nome ? 'Preencha seu nome.'
      : !/^\S+@\S+\.\S+$/.test(email) ? 'Confira o e-mail digitado.'
      : whatsapp.length < 10 ? 'Confira o WhatsApp: precisa de DDD e número.'
      : null;
    if (falha) { erro.textContent = falha; erro.hidden = false; return; }
    erro.hidden = true;

    const btn = document.querySelector('#confirmar');
    btn.disabled = true;
    btn.textContent = 'Confirmando...';

    const { data, error, closerId } = await agendar({
      inicio: slotSel.inicio,
      idsLivres: slotSel.livres,
      lead: { nome, email, whatsapp, escritorio },
      contexto
    });

    if (error) {
      erro.textContent = error.message;
      erro.hidden = false;
      btn.disabled = false;
      btn.textContent = 'Confirmar agendamento';
      await telaEscolha();
      return;
    }

    // liga o contato à resposta do quiz, para o painel mostrar os dois juntos
    if (contexto?.resposta_id) {
      await db.vincularLead(contexto.resposta_id, { nome, escritorio, whatsapp, email }, data.id);
    }

    await dispararWebhook('agendamento.criado', {
      agendamento_id: data.id,
      closer_id: closerId,
      inicio: data.inicio,
      fim: data.fim,
      lead: { nome, escritorio, whatsapp, email },
      scoring: contexto || null,
      origem: origemAtual(),
      formulario: data.origem
    });

    telaConfirmado(data);
  };
}

/* ---------- etapa 3: confirmado ---------- */

function telaConfirmado(ag) {
  const d = new Date(ag.inicio);
  palco.innerHTML = `
    <div class="step estreito">
      <div class="selo chanfro" aria-hidden="true">
        <svg width="26" height="20" viewBox="0 0 26 20" fill="none">
          <path d="M2 10.5l7.5 7L24 2.5" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="eyebrow">Agendamento confirmado</span>
      <h1 class="q-title">Está marcado</h1>
      <p class="marcado chanfro">${fmtDataLonga(d)}, às <strong>${fmtHora(d)}</strong> · 30 minutos</p>
      <p class="q-help">Enviamos a confirmação com o link da chamada para <strong>${esc(ag.lead_email)}</strong> e para o seu WhatsApp. Um especialista do time já foi designado para a sua sessão.</p>
      <p class="disclaimer">Se precisar remarcar, responda a mensagem do WhatsApp. Chegue com os números do escritório em mãos: quanto mais concreto, mais útil a conversa.</p>
    </div>`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

telaEscolha();
