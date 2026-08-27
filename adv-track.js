/* Telemetria do funil — Advocacia de Impacto
   ------------------------------------------------------------------
   Emite um evento por etapa para a tabela `funil_eventos`.

   Regras de projeto:
   - Não altera nenhuma regra de negócio do funil. Só observa.
   - Falha de rede nunca bloqueia o lead. Tudo é fire-and-forget.
   - Uma etapa por sessão. O banco tem índice único em
     (sessao_id, etapa), então voltar e reavançar não conta de novo.
   - Sem cookie e sem identificador pessoal. `sessao_id` é aleatório,
     vive em sessionStorage e morre quando a aba fecha.
   ------------------------------------------------------------------ */

const URL_BASE = window.ADV_ANALYTICS_URL || '';
const CHAVE_PUB = window.ADV_ANALYTICS_KEY || '';

const ORDEM = {
  abertura: 0, inicio: 1,
  q1_faturamento: 2, q2_pessoas: 3, q3_urgencia: 4,
  q4_mentoria: 5, q5_area: 6, q6_perfil: 7,
  contato_visto: 8, contato_enviado: 9,
  obrigado: 10, agendar_visto: 11, agendamento_confirmado: 12
};

const CHAVE_SESSAO = 'adv_sessao_funil';

function sessaoId() {
  try {
    let s = sessionStorage.getItem(CHAVE_SESSAO);
    if (!s) {
      s = 's_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(CHAVE_SESSAO, s);
    }
    return s;
  } catch {
    return 's_efemera_' + Math.random().toString(36).slice(2, 10);
  }
}

function device() {
  const w = window.innerWidth;
  if (w < 768) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
}

/* Reaproveita a origem que o próprio funil já captura em origem.js.
   Se por algum motivo não existir, lê da URL na hora. */
function origem() {
  try {
    const o = JSON.parse(localStorage.getItem('adv_origem'));
    if (o?.ultimo) return o.ultimo;
  } catch { /* segue para o fallback */ }
  const p = new URLSearchParams(location.search);
  const achado = {};
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term',
   'fbclid','gclid','ttclid','msclkid','ctwa_clid'].forEach(k => {
    const v = p.get(k);
    /* Mesma dupla codificação do shim do Facebook tratada em origem.js. */
    if (v) achado[k] = /%[0-9A-Fa-f]{2}/.test(v)
      ? (() => { try { return decodeURIComponent(v.replace(/\+/g,' ')); } catch { return v; } })()
      : v;
  });
  if (!Object.keys(achado).length && document.referrer) achado.referrer = document.referrer;
  return Object.keys(achado).length ? achado : null;
}

let entrouEm = performance.now();

/* etapa -> se o envio já levou o valor escolhido.
   Uma pergunta é marcada duas vezes: quando aparece (sem valor) e quando a
   pessoa responde (com valor). O segundo envio é um upsert que preenche o
   valor na mesma linha, então a contagem de sessões não muda. Qualquer
   chamada além dessas duas é ignorada — é o botão Voltar. */
const enviadas = new Map();

/* Registra uma etapa. `valor` é a opção escolhida, quando a etapa tiver uma. */
export function marcar(etapa, valor = null) {
  if (!(etapa in ORDEM)) {
    console.warn('[adv-track] etapa desconhecida:', etapa);
    return;
  }
  const jaFoi = enviadas.get(etapa);
  const acrescentaValor = valor != null && jaFoi === false;
  if (jaFoi !== undefined && !acrescentaValor) return;
  enviadas.set(etapa, valor != null);

  const agora = performance.now();
  const corpo = {
    sessao_id: sessaoId(),
    etapa,
    ordem: ORDEM[etapa],
    valor,
    ms_na_etapa: Math.round(agora - entrouEm),
    origem: origem(),
    device: device()
  };
  entrouEm = agora;

  if (!URL_BASE || !CHAVE_PUB) {
    console.info('[adv-track] offline ·', etapa, valor ? '· ' + valor : '', corpo);
    return;
  }

  // ?on_conflict é obrigatório: sem ele o PostgREST não sabe contra qual índice
  // resolver o merge e devolve 409 no segundo envio da mesma etapa — o que
  // faria a resposta escolhida nunca ser gravada.
  const alvo = `${URL_BASE}/rest/v1/funil_eventos?on_conflict=sessao_id,etapa`;
  const json = JSON.stringify(corpo);

  /* `keepalive` faz a requisição sobreviver à navegação entre páginas —
     essencial nas etapas que disparam junto com um location.href.
     `merge-duplicates` casa com o índice único (sessao_id, etapa): o
     segundo envio da mesma pergunta preenche o valor em vez de criar
     linha nova ou estourar conflito. */
  try {
    fetch(alvo, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: CHAVE_PUB,
        Authorization: `Bearer ${CHAVE_PUB}`,
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: json
    }).catch(e => console.warn('[adv-track] falhou, seguindo assim mesmo', e));
  } catch {
    /* Último recurso: beacon não aceita cabeçalho, então perde o upsert,
       mas registra a passagem pela etapa. */
    try {
      navigator.sendBeacon(`${alvo}?apikey=${encodeURIComponent(CHAVE_PUB)}`,
        new Blob([json], { type: 'application/json' }));
    } catch { /* desiste em silêncio: telemetria nunca bloqueia o lead */ }
  }
}

/* Marca a etapa correspondente ao índice da pergunta no array PERGUNTAS. */
export function marcarPergunta(i, valor = null) {
  const mapa = ['q1_faturamento','q2_pessoas','q3_urgencia','q4_mentoria','q5_area','q6_perfil'];
  if (mapa[i]) marcar(mapa[i], valor);
}

export { sessaoId };
