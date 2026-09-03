/* Aba "Criativos": de onde vem o lead ruim.
   ------------------------------------------------------------------
   Cruza a classe do lead com o anúncio e o conjunto que o trouxe. O
   dado de classe sai da view `lead_classificado`, que espelha em SQL o
   mesmo cálculo do `scoring.js`; o gasto vem de `meta_criativos`, uma
   cópia da Meta Ads API — o token do Meta nunca entra no navegador.

   A métrica que ordena a lista é o CUSTO POR LEAD BOM, e não a
   porcentagem de qualificados. Foram coisas que discordaram entre si:
   o público frio entrega 7% de bons e o remarketing 29%, mas o lead
   frio custa R$ 12 e o de remarketing R$ 187 — por lead qualificado o
   frio sai três vezes mais barato. Ordenar por porcentagem levaria à
   decisão errada.
   ------------------------------------------------------------------ */

import { ANALYTICS_URL, ANALYTICS_KEY } from './funil-config.js';
import { esc } from './util.js';

const PAGINA = '840736889123483';   // página que hospeda os vídeos dos anúncios

const brl = v => v == null ? '—'
  : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL',
      minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });

async function carregar() {
  const r = await fetch(
    `${ANALYTICS_URL}/rest/v1/criativo_qualidade?select=*&order=custo_por_lead_bom.asc.nullslast`,
    { headers: { apikey: ANALYTICS_KEY, Authorization: `Bearer ${ANALYTICS_KEY}` } });
  if (!r.ok) throw new Error(`criativo_qualidade: ${r.status} ${await r.text()}`);
  return r.json();
}

/* Frio, remarketing e orgânico se distinguem pelo nome do conjunto, que
   o time já nomeia com [FRIO] ou com o público de origem. */
function tipo(l) {
  const c = (l.conjunto || '').toUpperCase();
  if (!l.conjunto) return { k: 'organico', rot: 'Orgânico' };
  if (c.includes('[FRIO]')) return { k: 'frio', rot: 'Frio' };
  return { k: 'rmkt', rot: 'Remarketing' };
}

function barra(l) {
  const seg = [['A', l.a, 'a'], ['B', l.b, 'b'], ['C', l.c, 'c'], ['D', l.d, 'd']];
  if (!l.leads) return '<div class="cr-barra vazia" title="sem lead com quiz completo"></div>';
  return `<div class="cr-barra">${seg.filter(([, v]) => v)
    .map(([k, v, cls]) => `<span class="sg ${cls}" style="--w:${100 * v / l.leads}%" title="${k}: ${v}"></span>`)
    .join('')}</div>`;
}

function card(l) {
  const t = tipo(l);
  const player = l.story_id
    ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(
        `https://www.facebook.com/${PAGINA}/videos/${l.story_id.split('_')[1]}`)}&show_text=false&width=300&height=534`
    : null;
  const leg = [['A', l.a], ['B', l.b], ['C', l.c], ['D', l.d]]
    .filter(([, v]) => v).map(([k, v]) => `<b class="${k.toLowerCase()}">${k}</b> ${v}`).join(' ');

  return `
  <article class="cr-card" data-t="${t.k}">
    <div class="cr-prev">
      ${l.thumb_url
        ? `<img class="cr-thumb" src="${esc(l.thumb_url)}" alt="" loading="lazy" width="170" height="302">`
        : ''}
      ${player
        ? `<button class="cr-play${l.thumb_url ? ' sobre' : ''}" data-src="${esc(player)}"
                   aria-label="Reproduzir o vídeo de ${esc(l.criativo)}">
             <span class="ico">▶</span>${l.thumb_url ? '' : '<span class="txt">ver o vídeo</span>'}
           </button>`
        : '<div class="cr-semvideo">sem vídeo<br>vinculado</div>'}
      <span class="cr-tag ${t.k}">${t.rot}</span>
    </div>
    <div class="cr-corpo">
      <h3>${esc(l.criativo)}</h3>
      <p class="cr-conj">${esc(l.conjunto || 'sem conjunto · tráfego não pago')}</p>
      ${barra(l)}
      <p class="cr-leg">${leg || '<s>nenhum lead concluiu o quiz</s>'}
        ${l.leads ? `<s>· ${l.leads} leads · média ${l.media_pontos} pts</s>` : ''}</p>
      <dl class="cr-nums">
        <div><dt>Qualificados</dt><dd class="${l.pct_bom >= 25 ? 'bom' : l.pct_bom != null && l.pct_bom < 10 ? 'ruim' : ''}">${l.pct_bom != null ? l.pct_bom + '%' : '—'}</dd></div>
        <div><dt>Classe D</dt><dd class="${l.pct_d >= 50 ? 'ruim' : ''}">${l.pct_d != null ? l.pct_d + '%' : '—'}</dd></div>
        <div><dt>Investido</dt><dd>${l.investido > 0 ? brl(+l.investido) : '—'}</dd></div>
        <div><dt>Custo por lead</dt><dd>${brl(l.custo_por_lead ? +l.custo_por_lead : null)}</dd></div>
        <div class="dest"><dt>Custo por lead bom</dt><dd>${brl(l.custo_por_lead_bom ? +l.custo_por_lead_bom : null)}</dd></div>
        <div><dt>Agendaram</dt><dd>${l.agendaram || '—'}</dd></div>
      </dl>
    </div>
  </article>`;
}

export async function telaCriativos(palco) {
  palco.innerHTML = '<p class="carregando">Carregando criativos e gasto...</p>';
  let dados;
  try { dados = await carregar(); }
  catch (e) {
    palco.innerHTML = `<div class="step"><h1 class="q-title">Não consegui carregar</h1>
      <p class="marcado chanfro">${esc(e.message)}</p></div>`;
    return;
  }

  const uteis = dados.filter(l => l.leads > 0 || +l.investido > 10);
  const tl = uteis.reduce((s, l) => s + l.leads, 0);
  const tb = uteis.reduce((s, l) => s + l.bons, 0);
  const td = uteis.reduce((s, l) => s + l.d, 0);
  const ti = uteis.reduce((s, l) => s + (+l.investido), 0);
  const cont = k => uteis.filter(l => tipo(l).k === k).length;

  palco.innerHTML = `
    <section class="cr-topo">
      <h1 class="q-title">De onde vem o lead ruim</h1>
      <p class="q-help">A classe sai do mesmo cálculo da aba Respostas. O gasto vem da Meta.
        A lista está ordenada por <strong>custo por lead bom</strong>, que é o que decide
        alocação — não pela porcentagem de qualificados.</p>
      <div class="cr-mt">
        <div><b>${tl}</b><s>leads com quiz</s></div>
        <div><b>${tl ? Math.round(100 * tb / tl) : 0}%</b><s>qualificados</s></div>
        <div><b>${tl ? Math.round(100 * td / tl) : 0}%</b><s>classe D</s></div>
        <div><b>${brl(ti)}</b><s>investido</s></div>
      </div>
    </section>
    <nav class="cr-filtros">
      <button data-f="all" class="on">Todos · ${uteis.length}</button>
      <button data-f="frio">Frio · ${cont('frio')}</button>
      <button data-f="rmkt">Remarketing · ${cont('rmkt')}</button>
      <button data-f="organico">Orgânico · ${cont('organico')}</button>
    </nav>
    <div class="cr-lista">${uteis.map(card).join('')}</div>
    <div class="cr-modal" id="crModal" hidden>
      <button class="cr-fechar" aria-label="Fechar">✕</button>
      <div class="cr-frame"></div>
    </div>`;

  palco.querySelectorAll('.cr-filtros button').forEach(b => b.onclick = () => {
    palco.querySelectorAll('.cr-filtros button').forEach(x => x.classList.toggle('on', x === b));
    palco.querySelectorAll('.cr-card').forEach(c => {
      c.hidden = b.dataset.f !== 'all' && c.dataset.t !== b.dataset.f;
    });
  });

  /* O vídeo só é montado no clique: 12 iframes do Facebook carregando de
     uma vez travam a aba e gastam banda à toa. */
  const modal = palco.querySelector('#crModal');
  const frame = modal.querySelector('.cr-frame');
  const fechar = () => { modal.hidden = true; frame.innerHTML = ''; };
  palco.querySelectorAll('.cr-play').forEach(b => b.onclick = () => {
    frame.innerHTML = `<iframe src="${b.dataset.src}" width="300" height="534"
      style="border:none;overflow:hidden" scrolling="no" frameborder="0"
      allow="autoplay; clipboard-write; encrypted-media; picture-in-picture"
      allowfullscreen="true"></iframe>`;
    modal.hidden = false;
  });
  modal.querySelector('.cr-fechar').onclick = fechar;
  modal.onclick = e => { if (e.target === modal) fechar(); };
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) fechar(); });
}
