/* Quiz público. O advogado responde e vai direto para a conclusão.
   A leitura comercial não aparece aqui: fica no painel interno. */

import { PERGUNTAS, calcular } from './scoring.js';
import { db, dispararWebhook } from './db.js';
import { capturarOrigem, origemAtual } from './origem.js';

capturarOrigem();

const TOTAL = PERGUNTAS.length + 1; // 6 perguntas + etapa de contato

let i = 0;
const respostas = [];
let contato = { nome: '', email: '', whatsapp: '' };

const $ = s => document.querySelector(s);
const palco = $('#palco');
const barra = $('#barra span');

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const progresso = () => { barra.style.width = (i / TOTAL) * 100 + '%'; };

function telaIntro() {
  barra.style.width = '0%';
  palco.innerHTML = `
    <div class="step intro">
      <span class="eyebrow">Diagnóstico do escritório</span>
      <h1>Seu escritório cresce ou só te consome?</h1>
      <p>Seis perguntas sobre como ele funciona hoje: faturamento, equipe, o que te trava e o quanto isso é urgente. Leva menos de um minuto e não pede cadastro para começar.</p>

      <div class="entrega">
        <span class="eyebrow">No final você recebe</span>
        <ol class="passos">
          <li><span>1</span><p><strong>Uma Sessão Estratégica.</strong> Trinta minutos com um especialista do nosso time para diagnosticar seu gargalo e desenhar o próximo passo, sem custo.</p></li>
          <li><span>2</span><p><strong>Materiais gratuitos.</strong> O mesmo conteúdo de gestão que usamos com quem já está dentro, liberado na hora.</p></li>
        </ol>
      </div>

      <button class="btn chanfro" id="start">Começar
        <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
          <path d="M1 5.5h12M9 1.5l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <p class="obs">Suas respostas ficam só com o nosso time comercial.</p>
    </div>`;
  document.querySelector('#start').onclick = () => { i = 0; telaPergunta(); };
}

function telaPergunta() {
  progresso();
  const q = PERGUNTAS[i];
  const compacto = q.opcoes.length > 8 ? ' compacto' : '';
  palco.innerHTML = `
    <div class="step">
      <span class="q-count">Pergunta <b>${i + 1}</b> de ${PERGUNTAS.length}</span>
      <h1 class="q-title">${q.titulo}</h1>
      ${q.ajuda ? `<p class="q-help">${q.ajuda}</p>` : '<div style="height:26px"></div>'}
      <div class="opts${compacto}" role="group" aria-label="Opções de resposta">
        ${q.opcoes.map((o, n) => `
          <button class="opt chanfro" data-n="${n}">
            <span class="key" aria-hidden="true">${n + 1}</span>
            <span>${o.txt}</span>
          </button>`).join('')}
      </div>
      <div class="nav-row">
        <button class="btn-back nav-voltar" id="voltar" ${i === 0 ? 'hidden' : ''}>← Voltar</button>
        ${q.opcoes.length <= 9 ? `<span class="hint">Use as teclas <b>1</b> a <b>${q.opcoes.length}</b></span>` : ''}
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
    i < PERGUNTAS.length ? telaPergunta() : telaContato();
  }, 200);
}

/* Etapa 7: dados de contato. Fica depois das perguntas, sobre as quais o
   scoring não depende — só serve para o time conseguir levar a Sessão
   Estratégica e os materiais até o lead. */
function telaContato() {
  progresso();
  palco.innerHTML = `
    <div class="step estreito">
      <button class="btn-back" id="voltar-contato">← Voltar</button>
      <span class="eyebrow">Última etapa</span>
      <h1 class="q-title">Para quem enviamos o resultado?</h1>
      <p class="q-help">Usamos isso só para levar sua Sessão Estratégica e os materiais gratuitos até você.</p>

      <form id="form-contato" novalidate>
        <div class="field">
          <label for="c-nome">Nome completo</label>
          <input id="c-nome" name="nome" type="text" autocomplete="name" value="${esc(contato.nome)}" required>
        </div>
        <div class="field">
          <label for="c-email">E-mail</label>
          <input id="c-email" name="email" type="email" autocomplete="email" value="${esc(contato.email)}" required>
        </div>
        <div class="field">
          <label for="c-whatsapp">WhatsApp com DDD</label>
          <input id="c-whatsapp" name="whatsapp" type="tel" inputmode="numeric" placeholder="(11) 90000-0000" value="${esc(contato.whatsapp)}" required>
        </div>
        <p class="erro" id="erro-contato" hidden></p>
        <button class="btn chanfro" type="submit" id="concluir">Concluir
          <svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
            <path d="M1 5.5h12M9 1.5l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </form>
    </div>`;

  document.querySelector('#voltar-contato').onclick = () => { i--; respostas.pop(); telaPergunta(); };

  const wpp = $('#c-whatsapp');
  wpp.oninput = () => {
    const n = wpp.value.replace(/\D/g, '').slice(0, 11);
    wpp.value = n.length > 10 ? `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
              : n.length > 6  ? `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
              : n.length > 2  ? `(${n.slice(0,2)}) ${n.slice(2)}`
              : n;
  };

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
    finalizar(contato);
  };

  $('#c-nome').focus({ preventScroll: true });
}

document.addEventListener('keydown', e => {
  if (document.querySelector('#start')) return;
  const opts = palco.querySelectorAll('.opt');
  if (!opts.length || opts.length > 9) return;
  const n = Number(e.key);
  if (n >= 1 && n <= opts.length) { e.preventDefault(); opts[n - 1].click(); }
});

async function finalizar(dadosContato) {
  barra.style.width = '100%';
  palco.innerHTML = '<p class="carregando">Processando suas respostas...</p>';

  const res = calcular(respostas);

  /* Desde a etapa 7, o contato já vem preenchido junto com a resposta.
     Quem abandona antes de chegar lá continua aparecendo no painel como
     sem contato, o que segue medindo o abandono do funil. */
  const { data } = await db.criarResposta({
    score: res.total, score_base: res.base, ajuste: res.ajuste,
    classe: res.classe, degrau: res.degrau, degrau_estrutura: res.degrauEstrutura,
    qualidade: res.qualidade.nivel, area: res.area, perfil: res.perfil,
    pontos: res.pontos, detalhe: res.respostas,
    origem: origemAtual(),
    lead: dadosContato
  });

  await dispararWebhook('resposta.criada', {
    resposta_id: data?.id || null,
    score: res.total, classe: res.classe,
    degrau: res.degrau, degrau_estrutura: res.degrauEstrutura,
    qualidade: res.qualidade.nivel, area: res.area, perfil: res.perfil,
    lead: dadosContato,
    origem: origemAtual(),
    respostas: res.respostas
  });

  try {
    sessionStorage.setItem('adv_contexto_lead', JSON.stringify({
      resposta_id: data?.id || null,
      score: res.total, classe: res.classe,
      degrau: res.degrau, qualidade: res.qualidade.nivel,
      lead: dadosContato
    }));
  } catch { /* sem storage: segue sem contexto */ }

  location.href = 'obrigado.html';
}

telaIntro();
