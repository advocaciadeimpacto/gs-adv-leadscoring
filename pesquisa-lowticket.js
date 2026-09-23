/* Pesquisa de perfil de quem comprou um dos produtos low ticket.
   ------------------------------------------------------------------
   UM formulário para os dois produtos. Qual deles é vem da URL:

     /pesquisa-lowticket?p=posvenda   → Pós-Venda no Piloto Automático
     /pesquisa-lowticket?p=impactrh   → ImpactMind RH

   O identificador não fica só no link: o nome do produto aparece escrito
   na página (topo, intro, tela de contato e agradecimento) e vai junto no
   insert e no webhook. Sem o parâmetro — ou com um valor que ninguém
   reconhece — a pessoa escolhe o produto na primeira tela, em vez de
   responder uma pesquisa genérica que depois ninguém sabe de qual produto é.

   Mesma mecânica da pesquisa da Imersão (pesquisa-iep.js), pelos mesmos
   motivos:
   - não dispara Pixel nem CAPI. Quem responde já comprou; um `Lead` ou
     `EndForm` daqui entraria no pixel que otimiza as campanhas e contaria
     como cadastro novo;
   - não usa o adv-track.js, para não misturar estas etapas no funil do quiz;
   - grava por /api/pesquisa-lowticket (tabela pesquisa_lowticket + webhook
     do n8n), e não em `respostas` nem no webhook do quiz.

   A leitura comercial é calculada aqui para seguir junto com a resposta,
   mas nunca é mostrada: quem responde vê só o agradecimento.
   ------------------------------------------------------------------ */

import { PRODUTOS, produtoDaUrl, perguntas, calcular } from './scoring-lowticket.js';
import { capturarOrigem, origemAtual } from './origem.js';
import { esc, formatarTelefone } from './util.js';

capturarOrigem();

const q = new URLSearchParams(location.search);

/* O link pode chegar já preenchido (?nome=&email=&whatsapp=), quando for
   mandado um a um no privado. Na área de membros vai sem nada. */
let contato = {
  nome: q.get('nome') || '',
  email: q.get('email') || '',
  whatsapp: formatarTelefone((q.get('whatsapp') || q.get('tel') || '').replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, ''))
};

let produto = produtoDaUrl(q.get('p') || q.get('produto'));
let PERGUNTAS = [];
let TOTAL = 0;

let i = 0;
const respostas = [];
let textoLivre = '';

const $ = s => document.querySelector(s);
const palco = $('#palco');
const barra = $('#barra span');
const chapeu = $('#chapeu');
const progresso = () => { barra.style.width = (i / TOTAL) * 100 + '%'; };

const SETA = `<svg width="15" height="11" viewBox="0 0 15 11" fill="none" aria-hidden="true">
  <path d="M1 5.5h12M9 1.5l4 4-4 4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/* Chamada uma vez, assim que o produto é conhecido: é o que faz o nome do
   produto existir na página, e não só no parâmetro da URL. */
function fixarProduto(p) {
  produto = p;
  PERGUNTAS = perguntas(p);
  TOTAL = PERGUNTAS.length + 2; // perguntas + campo livre + contato
  document.title = `Pesquisa · ${p.nome} | Advocacia de Impacto`;
  chapeu.textContent = p.nome;
  chapeu.hidden = false;
  /* Mantém o produto na URL mesmo quando a pessoa escolheu na tela, para
     um F5 no meio da pesquisa não voltar à escolha. */
  const url = new URL(location.href);
  url.searchParams.set('p', p.slug);
  history.replaceState(null, '', url);
}

/* Só aparece quando o link chegou sem ?p= ou com um valor irreconhecível. */
function telaProduto() {
  barra.style.width = '0%';
  const lista = Object.values(PRODUTOS);
  palco.innerHTML = `
    <div class="step">
      <span class="eyebrow">Antes de começar</span>
      <h1 class="q-title">Qual produto você comprou?</h1>
      <p class="q-help">As perguntas mudam conforme o produto.</p>
      <div class="opts" role="group" aria-label="Produtos">
        ${lista.map((p, n) => `
          <button class="opt chanfro" data-slug="${p.slug}">
            <span class="key" aria-hidden="true">${n + 1}</span>
            <span>${p.nome}</span>
          </button>`).join('')}
      </div>
    </div>`;
  palco.querySelectorAll('.opt').forEach(b => {
    b.onclick = () => { b.classList.add('on'); setTimeout(() => { fixarProduto(PRODUTOS[b.dataset.slug]); telaIntro(); }, 200); };
  });
  palco.querySelector('.opt').focus({ preventScroll: true });
}

function telaIntro() {
  barra.style.width = '0%';
  palco.innerHTML = `
    <div class="step intro">
      <span class="eyebrow">${esc(produto.eyebrow)}</span>
      <h1>${esc(produto.titulo)}</h1>
      <p>${PERGUNTAS.length} perguntas rápidas, menos de dois minutos. ${esc(produto.chamada)}</p>
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
  const l = produto.livre;
  palco.innerHTML = `
    <div class="step estreito">
      <button class="btn-back" id="voltar-livre">← Voltar</button>
      <span class="eyebrow">Opcional</span>
      <h1 class="q-title">${esc(l.titulo)}</h1>
      <p class="q-help">${esc(l.ajuda)}</p>
      <div class="field"><textarea id="livre" rows="4" maxlength="600" placeholder="${esc(l.placeholder)}">${esc(textoLivre)}</textarea></div>
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
      <p class="q-help">${esc(produto.compra)}</p>
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
  const res = calcular(respostas, produto);
  try {
    const r = await fetch('/api/pesquisa-lowticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        produto: res.produto, produto_nome: res.produtoNome,
        lead: contato,
        score: res.total, score_base: res.base, ajuste: res.ajuste, classe: res.classe, sla: res.sla,
        degrau: res.degrau, degrau_estrutura: res.degrauEstrutura,
        qualidade: res.qualidade.nivel, area: res.area, perfil: res.perfil,
        situacao: res.situacao, desafio: res.desafio, plano: res.plano,
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
      <p>O Guilherme vai usar o que você contou para preparar o acompanhamento de quem comprou o <strong>${esc(produto.nome)}</strong>.</p>
      <p>${produto.obrigado}</p>
    </div>`;
}

if (produto) { fixarProduto(produto); telaIntro(); } else { telaProduto(); }
