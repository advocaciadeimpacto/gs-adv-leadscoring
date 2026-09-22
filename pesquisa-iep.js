/* Pesquisa de perfil de quem comprou a Imersão Escritório Previsível.
   Mesma mecânica do quiz da Sessão Estratégica (quiz.js), com três
   diferenças deliberadas:

   - não dispara Pixel nem CAPI. Quem responde já comprou; um `Lead` ou
     `EndForm` daqui entraria no pixel que otimiza as campanhas da Sessão
     Estratégica e contaria como cadastro novo;
   - não usa o adv-track.js, para não misturar estas etapas no funil do quiz;
   - grava por /api/pesquisa-iep (tabela pesquisa_iep + webhook do n8n), e
     não em `respostas` nem no webhook do quiz.

   A leitura comercial é calculada aqui para seguir junto com a resposta,
   mas nunca é mostrada: quem responde vê só o agradecimento. */

import { PERGUNTAS, calcular } from './scoring-iep.js';
import { capturarOrigem, origemAtual } from './origem.js';
import { esc, formatarTelefone } from './util.js';

capturarOrigem();

const TOTAL = PERGUNTAS.length + 2; // perguntas + campo livre + contato

/* O link pode chegar já preenchido (?nome=&email=&whatsapp=), quando for
   mandado um a um no privado. No grupo vai sem nada. */
const q = new URLSearchParams(location.search);
let contato = {
  nome: q.get('nome') || '',
  email: q.get('email') || '',
  whatsapp: formatarTelefone((q.get('whatsapp') || q.get('tel') || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))
};

let i = 0;
const respostas = [];
let textoLivre = '';

const $ = s => document.querySelector(s);
const palco = $('#palco');
const barra = $('#barra span');
const progresso = () => { barra.style.width = (i / TOTAL) * 100 + '%'; };

const SETA = `<svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
  <path d="M1 5.5h12M9 1.5l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function telaIntro() {
  barra.style.width = '0%';
  palco.innerHTML = `
    <div class="step intro">
      <span class="eyebrow">Imersão Escritório Previsível · 26/09</span>
      <h1>Conta pra gente como está o seu escritório.</h1>
      <p>${PERGUNTAS.length} perguntas rápidas, menos de dois minutos. Com as respostas de quem vai estar lá, o Guilherme prepara o sábado com exemplos que se parecem com o seu escritório, e não com um escritório genérico.</p>
      <button class="btn chanfro" id="start">Começar ${SETA}</button>
      <p class="obs">Suas respostas ficam só com o nosso time.</p>
    </div>`;
  $('#start').onclick = () => { i = 0; telaPergunta(); };
}

function telaPergunta() {
  progresso();
  const p = PERGUNTAS[i];
  const compacto = p.opcoes.length > 8 ? ' compacto' : '';
  palco.innerHTML = `
    <div class="step">
      <span class="q-count">Pergunta <b>${i + 1}</b> de ${PERGUNTAS.length}</span>
      <h1 class="q-title">${p.titulo}</h1>
      ${p.ajuda ? `<p class="q-help">${p.ajuda}</p>` : '<div style="height:26px"></div>'}
      <div class="opts${compacto}" role="group" aria-label="Opções de resposta">
        ${p.opcoes.map((o, n) => `
          <button class="opt chanfro" data-n="${n}">
            <span class="key" aria-hidden="true">${n + 1}</span>
            <span>${o.txt}</span>
          </button>`).join('')}
      </div>
      <div class="nav-row">
        <button class="btn-back nav-voltar" id="voltar" ${i === 0 ? 'hidden' : ''}>← Voltar</button>
        ${p.opcoes.length <= 9 ? `<span class="hint">Use as teclas <b>1</b> a <b>${p.opcoes.length}</b></span>` : ''}
      </div>
    </div>`;

  palco.querySelectorAll('.opt').forEach(b => { b.onclick = () => escolher(Number(b.dataset.n), b); });
  const back = $('#voltar');
  if (back) back.onclick = () => { i--; respostas.pop(); telaPergunta(); };
  palco.querySelector('.opt').focus({ preventScroll: true });
}

function escolher(n, botao) {
  botao.classList.add('on');
  respostas[i] = PERGUNTAS[i].opcoes[n];
  setTimeout(() => {
    i++;
    i < PERGUNTAS.length ? telaPergunta() : telaLivre();
  }, 200);
}

function telaLivre() {
  i = PERGUNTAS.length;
  progresso();
  palco.innerHTML = `
    <div class="step estreito">
      <button class="btn-back" id="voltar-livre">← Voltar</button>
      <span class="eyebrow">Opcional</span>
      <h1 class="q-title">O que você quer sair da imersão sabendo?</h1>
      <p class="q-help">Uma frase já ajuda. Se preferir, pode pular.</p>
      <div class="field"><textarea id="livre" rows="4" maxlength="600" placeholder="Ex.: como contratar a primeira pessoa sem quebrar o caixa">${esc(textoLivre)}</textarea></div>
      <button class="btn chanfro" id="seguir">Continuar ${SETA}</button>
    </div>`;
  $('#voltar-livre').onclick = () => { textoLivre = $('#livre').value; i = PERGUNTAS.length - 1; respostas.pop(); telaPergunta(); };
  $('#seguir').onclick = () => { textoLivre = $('#livre').value.trim(); telaContato(); };
  $('#livre').focus({ preventScroll: true });
}

function telaContato() {
  i = PERGUNTAS.length + 1;
  progresso();
  palco.innerHTML = `
    <div class="step estreito">
      <button class="btn-back" id="voltar-contato">← Voltar</button>
      <span class="eyebrow">Última etapa</span>
      <h1 class="q-title">Quem está respondendo?</h1>
      <p class="q-help">Use o mesmo e-mail e WhatsApp da compra do ingresso, para a gente saber que é você.</p>
      <form id="form-contato" novalidate>
        <div class="field"><label for="c-nome">Nome completo</label>
          <input id="c-nome" type="text" autocomplete="name" value="${esc(contato.nome)}" required></div>
        <div class="field"><label for="c-email">E-mail</label>
          <input id="c-email" type="email" autocomplete="email" value="${esc(contato.email)}" required></div>
        <div class="field"><label for="c-whatsapp">WhatsApp com DDD</label>
          <input id="c-whatsapp" type="tel" inputmode="numeric" placeholder="(11) 90000-0000" value="${esc(contato.whatsapp)}" required></div>
        <p class="erro" id="erro-contato" hidden></p>
        <button class="btn chanfro" type="submit" id="concluir">Enviar respostas ${SETA}</button>
      </form>
    </div>`;

  $('#voltar-contato').onclick = () => telaLivre();
  const wpp = $('#c-whatsapp');
  wpp.oninput = () => { wpp.value = formatarTelefone(wpp.value); };

  $('#form-contato').onsubmit = e => {
    e.preventDefault();
    const erro = $('#erro-contato');
    const nome = $('#c-nome').value.trim();
    const email = $('#c-email').value.trim();
    const whatsapp = wpp.value.replace(/\D/g, '');
    const falha = !nome ? 'Preencha seu nome.'
      : !/^\S+@\S+\.\S+$/.test(email) ? 'Confira o e-mail digitado.'
      : whatsapp.length < 10 ? 'Confira o WhatsApp: precisa de DDD e número.'
      : null;
    if (falha) { erro.textContent = falha; erro.hidden = false; return; }
    erro.hidden = true;
    contato = { nome, email, whatsapp };
    const btn = $('#concluir');
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    finalizar(btn, erro);
  };
  $('#c-nome').focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if ($('#start') || e.target.closest('textarea, input')) return;
  const opts = palco.querySelectorAll('.opt');
  if (!opts.length || opts.length > 9) return;
  const n = Number(e.key);
  if (n >= 1 && n <= opts.length) { e.preventDefault(); opts[n - 1].click(); }
});

async function finalizar(btn, erro) {
  const res = calcular(respostas);
  try {
    const r = await fetch('/api/pesquisa-iep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead: contato,
        score: res.total, score_base: res.base, ajuste: res.ajuste, classe: res.classe, sla: res.sla,
        degrau: res.degrau, degrau_estrutura: res.degrauEstrutura,
        qualidade: res.qualidade.nivel, area: res.area, perfil: res.perfil,
        desafio: res.desafio, tempo_oab: res.tempoOab, plano: res.plano,
        texto_livre: textoLivre || null,
        pontos: res.pontos, respostas: res.respostas,
        leitura: { pos: res.pos, neg: res.neg },
        origem: origemAtual(),
        pagina: location.href
      })
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) throw new Error(j.erro || 'falhou');
  } catch (e) {
    btn.disabled = false;
    btn.innerHTML = `Enviar respostas ${SETA}`;
    erro.textContent = 'Não conseguimos enviar agora. Confira a conexão e tente de novo.';
    erro.hidden = false;
    return;
  }

  barra.style.width = '100%';
  const primeiro = esc(contato.nome.split(/\s+/)[0]);
  palco.innerHTML = `
    <div class="step intro">
      <span class="eyebrow">Respostas enviadas</span>
      <h1>Obrigado, ${primeiro}.</h1>
      <p>O Guilherme vai usar o que você contou para preparar a imersão. Nos vemos no <strong>sábado, 26/09, às 10h</strong>, ao vivo no Zoom.</p>
      <p>O link da sala sai no grupo da imersão na sexta à noite.</p>
    </div>`;
}

telaIntro();
