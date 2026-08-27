/* Controles próprios da aba de funil — dropdown e seletor de período.
   ------------------------------------------------------------------
   Vem do painel `adv-funnel-analytics`. O nativo do sistema entrega
   fundo branco e não aceita estilo, o que quebra o preto quente da
   página. Aqui tudo é markup nosso.

   Única mudança na mudança de casa: `criarDropdown` e `criarPeriodo`
   agora devolvem `destruir()`. No painel original a página nunca era
   desmontada; aqui a aba monta e desmonta a cada troca, e os dois
   registram um fechador em `abertos` — sem o `destruir()` esse Set
   cresceria a cada visita, segurando nós já removidos do DOM.
   ------------------------------------------------------------------ */

const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const SETA = '<svg class="seta" width="10" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHECK = '<svg class="marca" width="11" height="9" viewBox="0 0 11 9" fill="none" aria-hidden="true"><path d="M1 4.5l3 3 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* Fecha qualquer popover aberto ao clicar fora ou apertar Esc. */
const abertos = new Set();
function registrar(fechar) { abertos.add(fechar); }
function esquecer(fechar) { abertos.delete(fechar); }
document.addEventListener('mousedown', e => {
  abertos.forEach(f => f(e.target));
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') abertos.forEach(f => f(null, true));
});

/* ------------------------------------------------------------------
   Dropdown
   ------------------------------------------------------------------ */
export function criarDropdown({ raiz, rotulo, aoEscolher }) {
  const campo = el('div', 'campo');
  const gatilho = el('button', 'gatilho chanfro');
  gatilho.type = 'button';
  gatilho.setAttribute('aria-haspopup', 'listbox');
  gatilho.setAttribute('aria-expanded', 'false');
  const pop = el('div', 'pop chanfro');
  pop.hidden = true;
  pop.setAttribute('role', 'listbox');
  const lista = el('div', 'pop-lista');
  pop.append(lista);
  campo.append(gatilho, pop);
  raiz.append(campo);

  let opcoes = [];
  let valor = null;
  let foco = -1;

  const rotuloDe = v => opcoes.find(o => o.valor === v)?.rotulo ?? '—';

  function pintar() {
    gatilho.innerHTML = `<span class="rot">${esc(rotulo)}</span><span class="val">${esc(rotuloDe(valor))}</span>${SETA}`;
    lista.innerHTML = '';
    opcoes.forEach((o, i) => {
      const b = el('button', 'item' + (i === foco ? ' foco' : ''),
        `${CHECK}<span class="txt">${esc(o.rotulo)}</span>${o.nota ? `<span class="qtd">${esc(o.nota)}</span>` : ''}`);
      b.type = 'button';
      b.setAttribute('role', 'option');
      b.setAttribute('aria-selected', String(o.valor === valor));
      b.onclick = () => { escolher(o.valor); };
      b.onmouseenter = () => { foco = i; marcarFoco(); };
      lista.append(b);
    });
  }
  const marcarFoco = () => lista.querySelectorAll('.item')
    .forEach((n, i) => n.classList.toggle('foco', i === foco));

  function abrir() {
    pop.hidden = false;
    gatilho.setAttribute('aria-expanded', 'true');
    foco = Math.max(0, opcoes.findIndex(o => o.valor === valor));
    marcarFoco();
    lista.querySelector('.item.foco')?.scrollIntoView({ block: 'nearest' });
  }
  function fechar(alvo, forcado) {
    if (pop.hidden) return;
    if (!forcado && alvo && campo.contains(alvo)) return;
    pop.hidden = true;
    gatilho.setAttribute('aria-expanded', 'false');
  }
  function escolher(v) {
    valor = v; pintar(); fechar(null, true); gatilho.focus();
    aoEscolher?.(v);
  }

  gatilho.onclick = () => (pop.hidden ? abrir() : fechar(null, true));
  gatilho.onkeydown = e => {
    if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key) && pop.hidden) { e.preventDefault(); abrir(); return; }
    if (pop.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); foco = Math.min(foco + 1, opcoes.length - 1); marcarFoco(); lista.querySelectorAll('.item')[foco]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); foco = Math.max(foco - 1, 0); marcarFoco(); lista.querySelectorAll('.item')[foco]?.scrollIntoView({ block: 'nearest' }); }
    if (e.key === 'Enter')     { e.preventDefault(); escolher(opcoes[foco].valor); }
  };
  registrar(fechar);

  return {
    definir(novasOpcoes, valorAtual) {
      opcoes = novasOpcoes;
      if (valorAtual !== undefined) valor = valorAtual;
      if (!opcoes.some(o => o.valor === valor)) valor = opcoes[0]?.valor ?? null;
      pintar();
    },
    destruir() { esquecer(fechar); campo.remove(); },
    get valor() { return valor; }
  };
}

/* ------------------------------------------------------------------
   Seletor de período: presets e intervalo livre no calendário
   ------------------------------------------------------------------ */
const MESES = ['janeiro','fevereiro','março','abril','maio','junho',
               'julho','agosto','setembro','outubro','novembro','dezembro'];
const DOW = ['D','S','T','Q','Q','S','S'];

const soData = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const curto = d => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`;
const somaDias = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const PRESETS = [
  { valor: '7',   rotulo: 'Últimos 7 dias',  dias: 7 },
  { valor: '14',  rotulo: 'Últimos 14 dias', dias: 14 },
  { valor: '30',  rotulo: 'Últimos 30 dias', dias: 30 },
  { valor: '90',  rotulo: 'Últimos 90 dias', dias: 90 },
  { valor: 'tudo', rotulo: 'Todo o período', dias: null }
];

export function criarPeriodo({ raiz, hoje = new Date(), aoEscolher }) {
  const limite = soData(hoje);
  const campo = el('div', 'campo');
  const gatilho = el('button', 'gatilho chanfro');
  gatilho.type = 'button';
  gatilho.setAttribute('aria-haspopup', 'dialog');
  gatilho.setAttribute('aria-expanded', 'false');
  const pop = el('div', 'pop calendario chanfro');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Escolher período');
  campo.append(gatilho, pop);
  raiz.append(campo);

  let preset = '30';
  let desde = null, ate = null;         // intervalo confirmado
  let a = null, b = null;               // rascunho dentro do calendário
  let mesVisivel = new Date(limite.getFullYear(), limite.getMonth(), 1);

  const rotuloAtual = () => {
    if (preset !== 'custom') return PRESETS.find(p => p.valor === preset).rotulo;
    return `${curto(desde)} – ${curto(ate)}`;
  };

  function pintarGatilho() {
    gatilho.innerHTML = `<span class="rot">Período</span><span class="val">${esc(rotuloAtual())}</span>${SETA}`;
  }

  function pintarPop() {
    pop.innerHTML = '';
    const atalhos = el('div');
    atalhos.append(el('div', 'pop-tit', 'Atalhos'));
    PRESETS.forEach(p => {
      const btn = el('button', 'item', `${CHECK}<span class="txt">${p.rotulo}</span>`);
      btn.type = 'button';
      btn.setAttribute('aria-selected', String(preset === p.valor));
      btn.onclick = () => {
        preset = p.valor; desde = ate = a = b = null;
        pintarGatilho(); fechar(null, true);
        aoEscolher?.({ preset: p.valor, dias: p.dias, desde: null, ate: null });
      };
      atalhos.append(btn);
    });
    pop.append(atalhos, el('div', 'pop-sep'), el('div', 'pop-tit', 'Intervalo'));

    const topo = el('div', 'cal-topo');
    const anterior = el('button', 'cal-nav', '<svg width="7" height="10" viewBox="0 0 7 10" fill="none"><path d="M5.5 1L1.5 5l4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    anterior.type = 'button'; anterior.setAttribute('aria-label', 'Mês anterior');
    const seguinte = el('button', 'cal-nav', '<svg width="7" height="10" viewBox="0 0 7 10" fill="none"><path d="M1.5 1l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>');
    seguinte.type = 'button'; seguinte.setAttribute('aria-label', 'Próximo mês');
    seguinte.disabled = mesVisivel.getFullYear() === limite.getFullYear() && mesVisivel.getMonth() === limite.getMonth();
    anterior.onclick = () => { mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() - 1, 1); pintarPop(); };
    seguinte.onclick = () => { mesVisivel = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 1); pintarPop(); };
    topo.append(anterior, el('div', 'cal-mes', `${MESES[mesVisivel.getMonth()]} ${mesVisivel.getFullYear()}`), seguinte);

    const grade = el('div', 'cal-grade');
    DOW.forEach(d => grade.append(el('div', 'cal-dow', d)));
    const primeiro = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), 1);
    const dias = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth() + 1, 0).getDate();
    for (let i = 0; i < primeiro.getDay(); i++) grade.append(el('button', 'cal-dia fora', ''));

    const [ini, fim] = ordenado();
    for (let d = 1; d <= dias; d++) {
      const data = new Date(mesVisivel.getFullYear(), mesVisivel.getMonth(), d);
      const btn = el('button', 'cal-dia', String(d));
      btn.type = 'button';
      if (data > limite) btn.disabled = true;
      if (+data === +limite) btn.classList.add('hoje');
      if (ini && fim && data > ini && data < fim) btn.classList.add('faixa');
      if (ini && +data === +ini) btn.classList.add('ponta', fim && +fim !== +ini ? 'inicio' : 'unica');
      if (fim && +data === +fim && +fim !== +(ini || 0)) btn.classList.add('ponta', 'fim');
      btn.onclick = () => {
        if (a == null || (a != null && b != null)) { a = data; b = null; }
        else b = data;
        pintarPop();
      };
      grade.append(btn);
    }

    const rodape = el('div', 'cal-rodape');
    const info = el('div', 'cal-info', ini ? `${curto(ini)} ${fim && +fim !== +ini ? '– ' + curto(fim) : ''}` : 'escolha dois dias');
    const acoes = el('div', 'cal-acoes');
    const limpar = el('button', 'cal-btn', 'Limpar'); limpar.type = 'button';
    limpar.onclick = () => { a = b = null; pintarPop(); };
    const aplicar = el('button', 'cal-btn principal', 'Aplicar'); aplicar.type = 'button';
    aplicar.disabled = !ini;
    aplicar.onclick = () => {
      const [i2, f2] = ordenado();
      desde = i2; ate = f2 || i2; preset = 'custom';
      pintarGatilho(); fechar(null, true);
      aoEscolher?.({ preset: 'custom', dias: null, desde: iso(desde), ate: iso(ate) });
    };
    acoes.append(limpar, aplicar);
    rodape.append(info, acoes);

    pop.append(topo, grade, rodape);
  }

  function ordenado() {
    if (a && b) return a <= b ? [a, b] : [b, a];
    if (a) return [a, null];
    if (desde && ate) return [desde, ate];
    return [null, null];
  }

  function abrir() {
    const [ini] = ordenado();
    mesVisivel = new Date((ini || limite).getFullYear(), (ini || limite).getMonth(), 1);
    pintarPop();
    pop.hidden = false;
    gatilho.setAttribute('aria-expanded', 'true');
  }
  function fechar(alvo, forcado) {
    if (pop.hidden) return;
    if (!forcado && alvo && campo.contains(alvo)) return;
    pop.hidden = true;
    gatilho.setAttribute('aria-expanded', 'false');
  }
  gatilho.onclick = () => (pop.hidden ? abrir() : fechar(null, true));
  registrar(fechar);

  pintarGatilho();
  return {
    destruir() { esquecer(fechar); campo.remove(); },
    get preset() { return preset; }
  };
}

export { somaDias, iso };
