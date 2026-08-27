/* Fonte de dados da aba de funil.
   ------------------------------------------------------------------
   Vem do painel `adv-funnel-analytics`, quase intacto. As duas coisas
   que mudaram na mudança de casa:

   1. O modo de demonstração saiu. Lá ele lia `seed/demo.json` para o
      painel abrir antes de a instrumentação existir. Aqui a
      instrumentação já está no ar (`adv-track.js`) e o seed não veio
      junto — manter o caminho de demo só criaria um 404 silencioso.
      Sem credencial, agora, a aba diz que não está configurada.

   2. `fetch` direto, de propósito, sem `supabase-js` e sem `db.js`.
      O `db.js` fala com o Supabase self-hosted usando a SESSÃO do
      time; este arquivo fala com o Supabase de analytics usando a
      chave anônima dele. São bancos distintos e credenciais
      distintas: juntar os dois clientes quebraria os dois.
   ------------------------------------------------------------------ */

import { ANALYTICS_URL, ANALYTICS_KEY } from './funil-config.js';

export const configurado = Boolean(ANALYTICS_URL && ANALYTICS_KEY);

async function rest(view, params = '') {
  const r = await fetch(`${ANALYTICS_URL}/rest/v1/${view}?select=*${params}`, {
    headers: { apikey: ANALYTICS_KEY, Authorization: `Bearer ${ANALYTICS_KEY}` }
  });
  if (!r.ok) throw new Error(`${view}: ${r.status} ${await r.text()}`);
  return r.json();
}

/* Recorte de data. As views agregam tudo; para filtrar por período sem
   criar uma view por janela, o painel refaz a agregação no cliente a
   partir dos eventos crus quando um período é escolhido. */
export async function carregar({ dias = null, desde = null, ate = null, criativo = null } = {}) {
  if (!configurado) throw new Error('Sem credencial do Supabase de analytics.');

  if (!dias && !desde && !criativo) {
    const [resumo, respostas, tempo, origem, ultima] = await Promise.all([
      rest('funil_resumo'), rest('funil_respostas'), rest('funil_tempo'),
      rest('funil_por_origem'), rest('funil_ultima_etapa')
    ]);
    return { resumo, respostas, tempo, origem, ultima_etapa: ultima, feed: await feedRecente() };
  }

  const filtros = [];
  if (dias) {
    filtros.push(`&criado_em=gte.${new Date(Date.now() - dias * 864e5).toISOString()}`);
  }
  if (desde) {
    filtros.push(`&criado_em=gte.${desde}T00:00:00`);
    filtros.push(`&criado_em=lte.${(ate || desde)}T23:59:59`);
  }
  if (criativo && criativo !== 'todos') filtros.push(`&origem->>utm_content=eq.${encodeURIComponent(criativo)}`);
  /* `order` explícito: o feed abaixo pega os 30 últimos com slice(-30),
     e sem ordenação o PostgREST não promete ordem nenhuma. */
  const eventos = await rest('funil_eventos', filtros.join('') + '&order=criado_em.asc&limit=100000');
  return agregar(eventos);
}

async function feedRecente() {
  const ev = await rest('funil_eventos', '&order=criado_em.desc&limit=30');
  return ev.map(e => ({
    minutos_atras: Math.max(0, Math.round((Date.now() - new Date(e.criado_em)) / 60000)),
    etapa: e.etapa, rotulo: ROTULOS[e.etapa] || e.etapa,
    criativo: e.origem?.utm_content || 'sem criativo',
    device: e.device || 'desktop'
  }));
}

/* Mesma lista de etapas do `adv-track.js`, na mesma ordem. Se uma etapa
   entrar lá, precisa entrar aqui — senão ela some do mapa sem erro. */
export const ETAPAS = [
  [0,'abertura','Abertura vista','diagnostico'],
  [1,'inicio','Começou','diagnostico'],
  [2,'q1_faturamento','P1 · Faturamento','diagnostico'],
  [3,'q2_pessoas','P2 · Pessoas','diagnostico'],
  [4,'q3_urgencia','P3 · Urgência','diagnostico'],
  [5,'q4_mentoria','P4 · Mentoria','diagnostico'],
  [6,'q5_area','P5 · Área','diagnostico'],
  [7,'q6_perfil','P6 · Perfil','diagnostico'],
  [8,'contato_visto','Tela de contato','captura'],
  [9,'contato_enviado','Dados completos','captura'],
  [10,'obrigado','Conclusão vista','agendamento'],
  [11,'agendar_visto','Agendamento aberto','agendamento'],
  [12,'agendamento_confirmado','Sessão agendada','agendamento']
];
const ROTULOS = Object.fromEntries(ETAPAS.map(([, e, r]) => [e, r]));

/* Reagrega eventos crus no mesmo formato das views. Mantém painel e SQL
   dizendo a mesma coisa, independentemente do caminho usado. */
function agregar(eventos) {
  const porEtapa = new Map();
  const valores = new Map();
  const tempos = new Map();
  const ultimaDe = new Map();

  for (const e of eventos) {
    if (!porEtapa.has(e.etapa)) porEtapa.set(e.etapa, new Set());
    porEtapa.get(e.etapa).add(e.sessao_id);
    if (e.valor) {
      const k = e.etapa + '||' + e.valor;
      valores.set(k, (valores.get(k) || 0) + 1);
    }
    if (e.ms_na_etapa > 200 && e.ms_na_etapa < 600000) {
      if (!tempos.has(e.etapa)) tempos.set(e.etapa, []);
      tempos.get(e.etapa).push(e.ms_na_etapa);
    }
    const at = ultimaDe.get(e.sessao_id);
    if (at == null || e.ordem > at) ultimaDe.set(e.sessao_id, e.ordem);
  }

  const resumo = ETAPAS.map(([ordem, etapa, rotulo, bloco], i) => {
    const s = porEtapa.get(etapa)?.size || 0;
    const ant = i === 0 ? null : (porEtapa.get(ETAPAS[i-1][1])?.size || 0);
    const topo = porEtapa.get('abertura')?.size || 0;
    return { ordem, etapa, rotulo, bloco, sessoes: s, sessoes_anterior: ant,
      taxa_passagem: ant ? +(100*s/ant).toFixed(1) : null,
      taxa_do_topo: topo ? +(100*s/topo).toFixed(1) : null,
      abandonos: ant ? Math.max(ant - s, 0) : 0 };
  });

  const totalPorEtapa = {};
  for (const [k, v] of valores) { const [et] = k.split('||'); totalPorEtapa[et] = (totalPorEtapa[et]||0) + v; }
  const respostas = [...valores].map(([k, v]) => {
    const [etapa, valor] = k.split('||');
    return { etapa, rotulo: ROTULOS[etapa], valor, sessoes: v,
             pct: +(100*v/totalPorEtapa[etapa]).toFixed(1) };
  }).sort((a,b) => a.etapa.localeCompare(b.etapa) || b.sessoes - a.sessoes);

  const mediana = a => { const s=[...a].sort((x,y)=>x-y); const m=Math.floor(s.length/2);
    return s.length%2 ? s[m] : Math.round((s[m-1]+s[m])/2); };
  const tempo = ETAPAS.filter(([,e]) => tempos.has(e)).map(([ordem, etapa, rotulo]) => {
    const a = tempos.get(etapa);
    return { ordem, etapa, rotulo, ms_mediano: mediana(a),
      ms_p90: [...a].sort((x,y)=>x-y)[Math.floor(a.length*0.9)] || mediana(a), amostras: a.length };
  });

  const contUltima = {};
  for (const o of ultimaDe.values()) contUltima[o] = (contUltima[o]||0)+1;
  const ultima_etapa = ETAPAS.map(([ordem, etapa, rotulo]) =>
    ({ ordem, etapa, rotulo, sessoes: contUltima[ordem] || 0 }));

  const porOrigem = new Map();
  for (const e of eventos) {
    const k = [e.origem?.utm_source||'direto', e.origem?.utm_campaign||'sem campanha',
               e.origem?.utm_content||'sem criativo'].join('||');
    if (!porOrigem.has(k)) porOrigem.set(k, { abriram:new Set(), comecaram:new Set(), completaram:new Set(), agendaram:new Set() });
    const b = porOrigem.get(k);
    if (e.etapa==='abertura') b.abriram.add(e.sessao_id);
    if (e.etapa==='inicio') b.comecaram.add(e.sessao_id);
    if (e.etapa==='contato_enviado') b.completaram.add(e.sessao_id);
    if (e.etapa==='agendamento_confirmado') b.agendaram.add(e.sessao_id);
  }
  const origem = [...porOrigem].map(([k,b]) => {
    const [source, campaign, criativo] = k.split('||');
    return { source, campaign, criativo, abriram:b.abriram.size, comecaram:b.comecaram.size,
             completaram:b.completaram.size, agendaram:b.agendaram.size };
  }).sort((a,b) => b.abriram - a.abriram);

  const feed = eventos.slice(-30).reverse().map(e => ({
    minutos_atras: Math.max(0, Math.round((Date.now() - new Date(e.criado_em))/60000)),
    etapa: e.etapa, rotulo: ROTULOS[e.etapa] || e.etapa,
    criativo: e.origem?.utm_content || 'sem criativo', device: e.device || 'desktop'
  }));

  return { resumo, respostas, tempo, origem, ultima_etapa, feed };
}

/* Realtime. Cada insert na tabela chama o callback com o evento cru.
   ------------------------------------------------------------------
   Degrada em silêncio: se o WebSocket não subir (rede da recepção
   bloqueando `wss`, proxy corporativo, projeto com realtime desligado),
   a aba continua servindo o número certo — ela só deixa de se atualizar
   sozinha, e o `atualizar()` manual do seletor de período resolve.

   `assinarAoVivo` devolve uma função de encerramento, e quem chama
   PRECISA chamá-la ao sair da aba. Diferente do painel original, que
   vivia numa página só, aqui a aba monta e desmonta a cada troca: sem
   isso sobrariam um socket e um heartbeat por visita. O heartbeat é
   limpo junto — no original ele ficava rodando mesmo com o socket
   fechado.
   ------------------------------------------------------------------ */
export function assinarAoVivo(aoReceber) {
  if (!configurado) return () => {};

  let ws, pulso;
  try {
    ws = new WebSocket(
      `${ANALYTICS_URL.replace('https://','wss://')}/realtime/v1/websocket?apikey=${ANALYTICS_KEY}&vsn=1.0.0`);
  } catch (e) {
    console.warn('[funil] realtime indisponível', e);
    return () => {};
  }

  let ref = 0;
  const envia = m => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };

  ws.onopen = () => {
    envia({ topic:'realtime:public:funil_eventos', event:'phx_join',
      payload:{ config:{ postgres_changes:[{ event:'INSERT', schema:'public', table:'funil_eventos' }] } },
      ref: String(++ref) });
    pulso = setInterval(() => envia({ topic:'phoenix', event:'heartbeat', payload:{}, ref:String(++ref) }), 25000);
  };
  ws.onmessage = ev => {
    try {
      const m = JSON.parse(ev.data);
      if (m.event === 'postgres_changes' && m.payload?.data?.record) aoReceber(m.payload.data.record);
    } catch { /* ignora quadro malformado */ }
  };
  ws.onerror = e => console.warn('[funil] realtime erro', e);
  ws.onclose = () => clearInterval(pulso);

  return () => {
    clearInterval(pulso);
    /* Solta os handlers ANTES de fechar: fechar um socket que ainda está
       conectando dispara `error`, e sem isto a saída da aba deixaria um
       aviso vermelho no console que não é problema nenhum. */
    ws.onmessage = ws.onerror = ws.onclose = null;
    try { ws.close(); } catch { /* já estava fechado */ }
  };
}
