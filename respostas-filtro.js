/* Filtro e agregação da aba Respostas — módulo puro
   ==================================================================
   Sem DOM, sem rede, sem import: dá pra rodar `node --test
   respostas-filtro.test.js` sem servidor e sem sessão do Supabase.
   É o único jeito de testar essa lógica, porque o painel exige login
   e a tabela `forms_adv` só abre pra quem está autenticado.

   O problema que este arquivo resolve: em `forms_adv` a coluna `Data`
   é TEXTO no formato `DD/MM/AAAA`, sem hora e sem fuso. Ordenar isso
   como string coloca 09/08 depois de 31/07 e antes de 10/07 — e um
   filtro de período em cima de texto não existe. Aqui cada linha ganha
   uma data de verdade (00:00 em America/Sao_Paulo) e uma chave
   `AAAA-MM-DD`, que é o que as comparações usam: comparar chave com
   chave é seguro, não depende do fuso de quem abre o painel e nunca
   escorrega um dia por causa de horário de verão.
   ================================================================== */

const FUSO = 'America/Sao_Paulo';

/* en-CA já formata como AAAA-MM-DD, que é ordenável como string. */
const fmtChave = new Intl.DateTimeFormat('en-CA',
  { timeZone: FUSO, year: 'numeric', month: '2-digit', day: '2-digit' });

/** Dia (AAAA-MM-DD) de um instante, sempre lido em São Paulo. */
export const chaveDia = d => fmtChave.format(d);

/* Balde de quem entrou sem responder o quiz: Classe/Degrau vêm nulos
   da tabela (o contato foi capturado, o diagnóstico não). */
export const SEM_QUIZ = 'sem';

/* `DD/MM/AAAA` → Date às 00:00 de São Paulo.
   O offset é fixo em -03:00: o Brasil não tem mais horário de verão
   desde 2019 e a base começa em 2026. Datas impossíveis (31/02) caem
   no `NaN` do parser ISO, e a conferência da chave é a segunda rede. */
export function dataBR(txt) {
  const m = /^\s*(\d{2})\/(\d{2})\/(\d{4})\s*$/.exec(String(txt ?? ''));
  if (!m) return null;
  const [, dd, mm, aaaa] = m;
  const data = new Date(`${aaaa}-${mm}-${dd}T00:00:00-03:00`);
  if (Number.isNaN(+data)) return null;
  if (chaveDia(data) !== `${aaaa}-${mm}-${dd}`) return null;
  return data;
}

export const digitos = s => String(s ?? '').replace(/\D+/g, '');

/* Busca sem acento e sem caixa: quem digita "jose" tem que achar
   "José", e quem digita "JOSÉ" também. */
export const semAcento = s => String(s ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/** Anota cada linha crua de forms_adv com o que os filtros precisam. */
export function prepararLinhas(linhas = []) {
  return linhas.map(r => {
    const data = dataBR(r.Data);
    return {
      ...r,
      _data: data,
      _chave: data ? chaveDia(data) : null,
      _classe: r.Classe || null,
      _degrau: r.Degrau || null,
      _degrauEstrutura: r['Degrau Estrutura'] || null,
      _origem: r.utm_source || 'direto',
      _tel: digitos(r.Telefone),
      _nome: semAcento(r.Nome),
      _email: semAcento(r.Email)
    };
  });
}

/* Mais recente primeiro. Sem data vai pro fim (não pro topo: o topo é
   onde o comercial procura o lead de hoje). Empate de dia desempata
   por id, que é sequencial na tabela. */
export function ordenar(linhas) {
  return [...linhas].sort((a, b) => {
    if (a._chave !== b._chave) {
      if (!a._chave) return 1;
      if (!b._chave) return -1;
      return a._chave < b._chave ? 1 : -1;
    }
    return (Number(b.id) || 0) - (Number(a.id) || 0);
  });
}

/* Presets do seletor de período viram uma janela de dias fechada.
   "Últimos 30 dias" = 30 dias de calendário CONTANDO hoje (hoje-29 até
   hoje), não 30×24h pra trás: a coluna Data não tem hora, então contar
   por instante deixaria o trigésimo dia entrando pela metade. */
export function janela(periodo, hoje = new Date()) {
  const p = periodo || {};
  if (p.desde) return { de: p.desde, ate: p.ate || p.desde };
  if (p.dias) {
    const ini = new Date(+hoje - (p.dias - 1) * 864e5);
    return { de: chaveDia(ini), ate: chaveDia(hoje) };
  }
  return { de: null, ate: null };      // "Todo o período"
}

/* Um termo só, três campos. Telefone casa por dígito e parcialmente
   ("98444" acha (11) 98444-0000); nome e e-mail casam por texto. */
export function casaBusca(linha, termo) {
  const t = String(termo ?? '').trim();
  if (!t) return true;
  const d = digitos(t);
  if (d.length >= 2 && linha._tel.includes(d)) return true;
  const txt = semAcento(t);
  return linha._nome.includes(txt) || linha._email.includes(txt);
}

/** Filtro combinado. `filtros.produto === 'todos'` desliga o de produto. */
export function aplicarFiltros(linhas, filtros = {}, hoje = new Date()) {
  const { de, ate } = janela(filtros.periodo, hoje);
  const classes = filtros.classes?.length ? new Set(filtros.classes) : null;
  const produto = filtros.produto && filtros.produto !== 'todos' ? filtros.produto : null;
  const origem = filtros.origem && filtros.origem !== 'todas' ? filtros.origem : null;
  const termo = String(filtros.busca ?? '').trim();

  return linhas.filter(r => {
    /* Sem data só aparece quando o período é "Todo o período" — em
       qualquer janela fechada ela não tem como ser classificada. */
    if (de) {
      if (!r._chave) return false;
      if (r._chave < de || r._chave > ate) return false;
    }
    if (classes && !classes.has(r._classe ?? SEM_QUIZ)) return false;
    if (produto && (r._degrau ?? SEM_QUIZ) !== produto) return false;
    if (origem && r._origem !== origem) return false;
    return casaBusca(r, termo);
  });
}

/* ------------------------------------------------------------------
   Agregações do bloco de volume
   ------------------------------------------------------------------ */

/** Distribuição por um campo já anotado (`_degrau`, `_degrauEstrutura`). */
export function distribuicao(linhas, campo, ordem = []) {
  const contas = new Map();
  linhas.forEach(r => {
    const v = r[campo] ?? SEM_QUIZ;
    contas.set(v, (contas.get(v) || 0) + 1);
  });
  const total = linhas.length;
  const posicao = v => {
    const i = ordem.indexOf(v);
    return i === -1 ? ordem.length + (v === SEM_QUIZ ? 1 : 0) : i;
  };
  return [...contas.entries()]
    .map(([valor, n]) => ({ valor, n, pct: total ? (n * 100) / total : 0 }))
    .sort((a, b) => posicao(a.valor) - posicao(b.valor) || b.n - a.n);
}

/** Matriz produto × classe, uma linha por degrau presente. */
export function matriz(linhas, classes = ['A', 'B', 'C', 'D'], ordem = []) {
  const linhasSaida = distribuicao(linhas, '_degrau', ordem).map(d => {
    const porClasse = {};
    classes.forEach(c => { porClasse[c] = 0; });
    porClasse[SEM_QUIZ] = 0;
    linhas.filter(r => (r._degrau ?? SEM_QUIZ) === d.valor).forEach(r => {
      const c = r._classe ?? SEM_QUIZ;
      porClasse[c] = (porClasse[c] || 0) + 1;
    });
    return { produto: d.valor, total: d.n, porClasse };
  });
  return linhasSaida;
}

/** Valores distintos de um campo, na ordem da escada quando houver. */
export function valoresDe(linhas, campo, ordem = []) {
  const vistos = new Set(linhas.map(r => r[campo] ?? SEM_QUIZ));
  const dentro = ordem.filter(v => vistos.has(v));
  const fora = [...vistos].filter(v => !ordem.includes(v) && v !== SEM_QUIZ).sort();
  return [...dentro, ...fora, ...(vistos.has(SEM_QUIZ) ? [SEM_QUIZ] : [])];
}
