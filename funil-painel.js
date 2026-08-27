/* Aba "Funil" do painel interno — passagem de etapa do diagnóstico.
   ------------------------------------------------------------------
   Era um painel separado (`adv-funnel-analytics`), num link à parte.
   Virou aba daqui porque o gerente de marketing não abria o outro
   link: um domínio a menos para lembrar.

   O que mudou na mudança de casa:

   - Não é mais uma página, é um componente. `montarFunil(palco)`
     desenha dentro do `#palco` e devolve `desmontar()`. Isso importa
     porque o `painel.js` troca de aba jogando `palco.innerHTML` fora:
     sem o desmontar, cada visita deixaria para trás um WebSocket
     aberto e um par de fechadores de popover.

   - Tudo é consultado a partir da raiz da aba, nunca do `document`.
     O painel já tem `#voltar`, `#previa`, `#status` e outros ids seus;
     buscar por id global aqui seria colisão esperando acontecer. Por
     isso os ganchos são `data-*`.

   - A autenticação não existe aqui de propósito. O painel inteiro já
     abre por `acessoPorLink()`, e a aba herda esse acesso. Criar login
     próprio para o funil seria uma segunda porta para a mesma sala.

   O CSS mora em `funil.css`, todo sob `.aba-funil` — ver o comentário
   de abertura daquele arquivo.
   ------------------------------------------------------------------ */

import { carregar, assinarAoVivo, configurado, ETAPAS } from './funil-dados.js';
import { criarDropdown, criarPeriodo } from './funil-controles.js';

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const num = n => (n ?? 0).toLocaleString('pt-BR');
const pct = n => n == null ? '—' : n.toFixed(1).replace('.', ',') + '%';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dur = ms => ms == null ? '—' : ms < 1000 ? ms + 'ms'
  : ms < 60000 ? (ms/1000).toFixed(1).replace('.',',') + 's'
  : Math.floor(ms/60000) + 'min ' + Math.round((ms%60000)/1000) + 's';

const faixa = p => p == null ? '' : p >= 85 ? 'pc-ok' : p >= 60 ? 'pc-warn' : 'pc-bad';
const BLOCOS = { diagnostico:'Diagnóstico · 6 perguntas', captura:'Captura', agendamento:'Agendamento' };

const MARKUP = `
<div class="step aba-funil">

  <header class="funil-cabecalho">
    <div class="funil-intro">
      <span class="eyebrow">Passagem de etapa</span>
      <h1 class="q-title">Funil do diagnóstico</h1>
      <p class="q-help">Onde o lead entra, onde ele para, e qual criativo trouxe cada um.</p>
    </div>
    <div class="funil-controles">
      <div class="live" data-status></div>
      <div class="funil-filtros">
        <div data-periodo></div>
        <div data-criativo></div>
      </div>
    </div>
  </header>

  <div class="aviso chanfro" data-erro hidden></div>

  <div class="kpis" data-kpis></div>

  <section>
    <div class="sec-head"><span class="tag">Mapa</span><h2>Passagem de etapa</h2></div>
    <p class="sec-sub">Cada cartão é uma etapa do funil. O número grande é quantas sessões distintas chegaram ali; a barra compara com o topo; a porcentagem é a passagem em relação à etapa anterior. A etapa destacada em vermelho é onde mais gente sai.</p>
    <div class="mapa chanfro">
      <div class="trilha" data-trilha></div>
      <div class="blocos" data-blocos></div>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="tag">Detalhe</span><h2>Etapa por etapa</h2></div>
    <p class="sec-sub">"Pararam aqui" é quantas sessões tiveram esta como última etapa alcançada — é onde a pessoa desistiu de fato. "Tempo" é a mediana até sair da etapa: etapa lenta costuma ser etapa confusa.</p>
    <div class="tabelabox chanfro">
      <table>
        <thead><tr>
          <th class="num">#</th><th>Etapa</th><th>Bloco</th>
          <th class="num">Sessões</th><th class="num">Passagem</th><th class="num">Do topo</th>
          <th class="num">Saíram</th><th class="num">Pararam aqui</th><th class="num">Tempo</th>
        </tr></thead>
        <tbody data-tab-corpo></tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="tag">Respostas</span><h2>O que o público responde</h2></div>
    <p class="sec-sub">Distribuição das escolhas em cada uma das seis perguntas. É o retrato do público que o criativo está trazendo — e o primeiro lugar para olhar quando o lead chega barato mas não fecha.</p>
    <div class="grid-resp" data-grid-resp></div>
  </section>

  <section>
    <div class="sec-head"><span class="tag">Origem</span><h2>Funil por criativo</h2></div>
    <p class="sec-sub">Liga o anúncio ao comportamento dentro do diagnóstico. Vem do <code>utm_content</code>, que carrega o nome do anúncio.</p>
    <div class="tabelabox chanfro">
      <table>
        <thead><tr>
          <th>Criativo</th><th>Origem</th><th class="num">Abriram</th><th class="num">Começaram</th>
          <th class="num">Concluíram</th><th class="num">Conclusão</th><th class="num">Agendaram</th>
        </tr></thead>
        <tbody data-tab-origem></tbody>
      </table>
    </div>
  </section>

  <section>
    <div class="sec-head"><span class="tag">Ao vivo</span><h2>Últimos eventos</h2></div>
    <p class="sec-sub">Cada linha é alguém atravessando uma etapa agora. Entra sozinho, sem recarregar a página.</p>
    <div class="feed chanfro" data-feed></div>
  </section>

  <div class="note">
    <p><strong>Conta sessões distintas por etapa, nunca eventos crus.</strong> O botão Voltar do quiz faria a mesma pessoa ser contada duas vezes.</p>
    <p>Fonte: tabela <code>funil_eventos</code> e as views <code>funil_resumo</code>, <code>funil_respostas</code>, <code>funil_tempo</code>, <code>funil_por_origem</code> e <code>funil_ultima_etapa</code>, no Supabase de analytics — banco separado do de leads.</p>
  </div>

</div>`;

export function montarFunil(palco) {
  palco.innerHTML = MARKUP;
  const raiz = palco.querySelector('.aba-funil');
  const $ = s => raiz.querySelector(s);

  /* Trava de ciclo de vida. `atualizar()` é assíncrono e a troca de aba
     é instantânea: sem isto, uma resposta que chega depois da saída
     escreveria em nós que já não estão na página. */
  let vivo = true;

  let estado = { dias: 30, desde: null, ate: null, criativo: 'todos' };
  let seletorCriativo = null;
  let seletorPeriodo = null;
  let encerrarRealtime = () => {};

  /* ---------------- render ---------------- */

  function kpis(d) {
    const topo = d.resumo[0]?.sessoes ?? 0;
    const completou = d.resumo.find(r => r.etapa === 'contato_enviado')?.sessoes ?? 0;
    const agendou = d.resumo.find(r => r.etapa === 'agendamento_confirmado')?.sessoes ?? 0;
    const pior = piorEtapa(d);
    const box = $('[data-kpis]'); box.innerHTML = '';
    const add = (lbl, val, sub, cls='') => box.append(el('div', 'kpi chanfro ' + cls,
      `<div class="lbl">${lbl}</div><div class="val">${val}</div><div class="sub">${sub}</div>`));

    add('Sessões no topo', num(topo), 'abriram o diagnóstico');
    add('Concluíram o diagnóstico', num(completou),
        `${pct(topo ? 100*completou/topo : null)} de quem abriu`);
    add('Sessões agendadas', num(agendou),
        `${pct(completou ? 100*agendou/completou : null)} de quem concluiu`);
    add('Maior queda', pct(pior?.taxa_passagem ?? null),
        pior ? `em <b style="color:var(--tx-2)">${esc(pior.rotulo)}</b> · ${num(pior.abandonos)} pessoas`
             : 'sem dado no período', 'destaque');
  }

  /* Período vazio devolve todas as taxas nulas, e um reduce sem valor
     inicial sobre lista vazia estoura. Devolve null e quem chama trata. */
  function piorEtapa(d) {
    const comTaxa = d.resumo.filter(r => r.taxa_passagem != null);
    if (!comTaxa.length) return null;
    return comTaxa.reduce((a, b) => (b.taxa_passagem < a.taxa_passagem ? b : a));
  }

  function mapa(d) {
    const trilha = $('[data-trilha]'); trilha.innerHTML = '';
    const legenda = $('[data-blocos]'); legenda.innerHTML = '';
    const max = d.resumo[0]?.sessoes || 1;
    const pior = piorEtapa(d);

    d.resumo.forEach(r => {
      const forte = r.taxa_passagem != null && r.taxa_passagem >= 92;
      const critico = pior && r.etapa === pior.etapa;
      const no = el('div', 'no' + (critico ? ' critico' : forte ? ' forte' : ''));
      const larg = Math.max(2, 100 * r.sessoes / max);
      no.innerHTML = `
        <div class="card-no chanfro">
          <div class="no-ord">ETAPA ${String(r.ordem).padStart(2,'0')}</div>
          <div class="no-rot">${esc(r.rotulo)}</div>
          <div class="no-val">${num(r.sessoes)}</div>
          <div class="no-topo">${pct(r.taxa_do_topo)} do topo</div>
          <div class="passagem">
            <div class="barra"><i style="width:${larg}%"></i></div>
            <div class="n ${faixa(r.taxa_passagem)}">
              <span style="color:var(--tx-3)">passagem</span><b>${pct(r.taxa_passagem)}</b>
            </div>
          </div>
          ${r.abandonos > 0 ? `<div class="perda">
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1v6M2.5 5L5 7.5 7.5 5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
            −${num(r.abandonos)} saíram</div>` : ''}
        </div>`;
      trilha.append(no);
    });

    ['diagnostico','captura','agendamento'].forEach(b => {
      const n = d.resumo.filter(r => r.bloco === b).length;
      if (!n) return;
      const linha = el('div', 'bloco-lbl', BLOCOS[b]);
      linha.style.width = (n * 158 + (n - 1) * 34) + 'px';
      linha.style.flex = '0 0 auto';
      legenda.append(linha);
    });
  }

  function tabela(d) {
    const tmp = Object.fromEntries(d.tempo.map(t => [t.etapa, t]));
    const ult = Object.fromEntries(d.ultima_etapa.map(u => [u.etapa, u.sessoes]));
    const max = d.resumo[0]?.sessoes || 1;
    $('[data-tab-corpo]').innerHTML = d.resumo.map(r => `
      <tr>
        <td class="num" style="color:var(--tx-3)">${String(r.ordem).padStart(2,'0')}</td>
        <td class="forte">${esc(r.rotulo)}</td>
        <td style="color:var(--tx-3);font-size:12px">${BLOCOS[r.bloco]}</td>
        <td class="num">
          <div class="minibar"><span><i style="width:${100*r.sessoes/max}%"></i></span><b>${num(r.sessoes)}</b></div>
        </td>
        <td class="num ${faixa(r.taxa_passagem)}"><b>${pct(r.taxa_passagem)}</b></td>
        <td class="num">${pct(r.taxa_do_topo)}</td>
        <td class="num" style="color:${r.abandonos ? 'var(--bad)' : 'var(--tx-3)'}">${r.abandonos ? '−' + num(r.abandonos) : '—'}</td>
        <td class="num">${num(ult[r.etapa] || 0)}</td>
        <td class="num">${dur(tmp[r.etapa]?.ms_mediano)}</td>
      </tr>`).join('');
  }

  function respostas(d) {
    const box = $('[data-grid-resp]'); box.innerHTML = '';
    const porEtapa = {};
    d.respostas.forEach(r => (porEtapa[r.etapa] ??= []).push(r));
    ETAPAS.filter(([, e]) => e.startsWith('q')).forEach(([, etapa, rotulo]) => {
      const lista = (porEtapa[etapa] || []).sort((a, b) => b.sessoes - a.sessoes);
      if (!lista.length) return;
      const topo = lista[0].sessoes || 1;
      box.append(el('div', 'painel-q chanfro',
        `<h3>${esc(rotulo)}</h3>` + lista.map(o => `
          <div class="linha-r">
            <div class="t"><span title="${esc(o.valor)}">${esc(o.valor)}</span><b>${num(o.sessoes)} · ${pct(o.pct)}</b></div>
            <div class="b"><i style="width:${100*o.sessoes/topo}%"></i></div>
          </div>`).join('')));
    });
    if (!box.children.length) box.innerHTML = '<p class="empty">Ninguém respondeu ao diagnóstico neste período.</p>';
  }

  function origens(d) {
    $('[data-tab-origem]').innerHTML = d.origem.map(o => {
      const tx = o.abriram ? 100*o.completaram/o.abriram : null;
      return `<tr>
        <td class="forte">${esc(o.criativo)}</td>
        <td style="color:var(--tx-3);font-size:12px">${esc(o.source)} · ${esc(o.campaign)}</td>
        <td class="num">${num(o.abriram)}</td>
        <td class="num">${num(o.comecaram)}</td>
        <td class="num">${num(o.completaram)}</td>
        <td class="num ${faixa(tx)}"><b>${pct(tx)}</b></td>
        <td class="num">${num(o.agendaram)}</td>
      </tr>`; }).join('');
  }

  function feed(d) {
    $('[data-feed]').innerHTML = d.feed.slice(0, 22).map(e => `
      <div class="ev">
        <span class="t">${e.minutos_atras === 0 ? 'agora' : e.minutos_atras + 'min'}</span>
        <span class="e">${esc(e.rotulo)}</span>
        <span class="c">${esc(e.criativo)}</span>
        <span class="d">${esc(e.device)}</span>
      </div>`).join('');
  }

  function filtroCriativos(d) {
    if (!seletorCriativo) return;
    const total = d.origem.reduce((s, o) => s + o.abriram, 0);
    seletorCriativo.definir([
      { valor: 'todos', rotulo: 'Todos os criativos', nota: num(total) },
      ...d.origem.map(o => ({ valor: o.criativo, rotulo: o.criativo, nota: num(o.abriram) }))
    ], estado.criativo);
  }

  /* ---------------- ciclo ---------------- */

  function mostrarErro(msg) {
    const cx = $('[data-erro]');
    cx.hidden = false;
    cx.innerHTML = `<span class="ic">◆</span>
      <div><b>Não consegui ler o Supabase de analytics</b>
      <p>${esc(msg)}</p>
      <p>Os números abaixo podem estar desatualizados. As outras abas do painel não dependem deste banco e seguem normais.</p></div>`;
  }

  async function atualizar() {
    let d;
    try {
      d = await carregar({ dias: estado.dias, desde: estado.desde, ate: estado.ate, criativo: estado.criativo });
    } catch (e) {
      if (!vivo) return;
      console.warn('[funil] falha ao carregar', e);
      mostrarErro(e.message || 'erro desconhecido');
      return;
    }
    if (!vivo) return;               // trocou de aba enquanto a rede respondia
    $('[data-erro]').hidden = true;
    kpis(d); mapa(d); tabela(d); respostas(d); origens(d); feed(d); filtroCriativos(d);
    const marca = $('[data-atualizado]');
    if (marca) marca.textContent = new Date().toLocaleTimeString('pt-BR');
  }

  function montarControles() {
    seletorPeriodo = criarPeriodo({
      raiz: $('[data-periodo]'),
      aoEscolher: ({ dias, desde, ate }) => {
        estado.dias = dias; estado.desde = desde; estado.ate = ate;
        atualizar();
      }
    });
    seletorCriativo = criarDropdown({
      raiz: $('[data-criativo]'),
      rotulo: 'Criativo',
      aoEscolher: v => { estado.criativo = v; atualizar(); }
    });
    seletorCriativo.definir([{ valor: 'todos', rotulo: 'Todos os criativos' }], 'todos');
  }

  if (!configurado) {
    /* Não deveria acontecer — a credencial é constante em funil-config.js
       — mas se alguém esvaziar o arquivo, é melhor dizer isso do que
       desenhar um painel de zeros que parece campanha morta. */
    $('[data-status]').innerHTML = '<span class="dot demo"></span> sem credencial de analytics';
    mostrarErro('Faltam ANALYTICS_URL/ANALYTICS_KEY em funil-config.js.');
    return { desmontar() {} };
  }

  $('[data-status]').innerHTML = '<span class="dot"></span> ao vivo · atualizado <b data-atualizado class="mono"></b>';

  montarControles();
  atualizar();

  /* Realtime: insere no topo do feed e reagrega a cada 15s no máximo,
     para não refazer a agregação a cada clique de um lead. */
  let pendente = false;
  let reagendar = null;
  encerrarRealtime = assinarAoVivo(ev => {
    if (!vivo) return;
    const linha = el('div', 'ev novo',
      `<span class="t">agora</span>
       <span class="e">${esc(ETAPAS.find(([,e]) => e === ev.etapa)?.[2] || ev.etapa)}</span>
       <span class="c">${esc(ev.origem?.utm_content || 'sem criativo')}</span>
       <span class="d">${esc(ev.device || '')}</span>`);
    const cx = $('[data-feed]');
    cx.prepend(linha);
    while (cx.children.length > 22) cx.lastChild.remove();
    if (!pendente) {
      pendente = true;
      reagendar = setTimeout(() => { pendente = false; atualizar(); }, 15000);
    }
  });

  return {
    desmontar() {
      vivo = false;
      clearTimeout(reagendar);
      encerrarRealtime();
      seletorPeriodo?.destruir();
      seletorCriativo?.destruir();
    }
  };
}
