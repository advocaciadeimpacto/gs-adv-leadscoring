/* Pixel da Meta + Conversions API — Advocacia de Impacto
   ------------------------------------------------------------------
   As campanhas desta conta otimizam para o evento personalizado
   `EndForm`. O nome não é escolha nossa: é o que o form.respondi.app
   vinha disparando e é onde está todo o histórico de aprendizado da
   conta (offsite_conversion.fb_pixel_custom.EndForm). Qualquer outra
   grafia vira evento novo para a Meta e joga as campanhas de volta
   para a fase de aprendizado. Por isso ele aparece literal aqui e no
   servidor, e por isso vai por `trackCustom` — evento personalizado
   não passa por `track`.

   Toda conversão sai por dois caminhos ao mesmo tempo:
     navegador -> fbq(...)         rápido, mas adblock e ITP derrubam
     servidor  -> /api/meta-capi   sobrevive a bloqueio e a navegação
   Os dois levam o MESMO event_id. É só isso que impede a Meta de
   contar a mesma conversão duas vezes.

   Regras herdadas do adv-track.js, que valem igual aqui:
   - Não altera nenhuma regra de negócio do funil. Só observa.
   - Falha de rede nunca bloqueia o lead. Tudo é fire-and-forget.
   ------------------------------------------------------------------ */

import { sessaoId } from './adv-track.js';

const PIXEL_ID = window.ADV_META_PIXEL_ID || '';
const ROTA_CAPI = '/api/meta-capi';

/* Identificadores de clique e geolocalização em localStorage, PII em
   sessionStorage, de propósito.
   fbp/fbc não são dado pessoal e precisam sobreviver a fechar a aba:
   quem clica no anúncio hoje e agenda amanhã ainda tem que casar com o
   clique original. A geo é derivada do IP e muda pouco, então guardar
   entre visitas evita reinicializar o pixel de novo a cada página.
   Já nome, e-mail e telefone só precisam durar a jornada
   index -> obrigado -> agendar, que acontece na mesma aba — guardar
   dado da pessoa pelo menor tempo que resolve é a escolha certa. */
const CHAVE_CLIQUE = 'adv_meta_clique';
const CHAVE_PII = 'adv_meta_pii';
const CHAVE_GEO = 'adv_meta_geo';

const ler = (store, chave) => {
  try { return JSON.parse(store.getItem(chave)) || null; } catch { return null; }
};
const gravar = (store, chave, valor) => {
  try { store.setItem(chave, JSON.stringify(valor)); } catch { /* sem storage */ }
};

const lerCookie = nome => {
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]*)'));
  try { return m ? decodeURIComponent(m[1]) : null; } catch { return m ? m[1] : null; }
};

/* ---------- normalização do que vira Advanced Matching ---------- */

/* A Meta casa telefone em E.164, só dígitos e com o código do país. O
   formulário entrega DDD + número (10 ou 11 dígitos), então o 55 entra
   aqui. O teste de tamanho evita o caso chato do DDD 55 (Santa Maria),
   que já começa com 55 e viraria 5555... se prefixássemos no escuro. */
function telefoneE164(v) {
  const n = String(v ?? '').replace(/\D/g, '');
  if (n.length === 10 || n.length === 11) return '55' + n;
  if ((n.length === 12 || n.length === 13) && n.startsWith('55')) return n;
  return n || null;
}

/* fn e ln são campos separados no match da Meta e pontuam separado —
   mandar o nome inteiro em um só desperdiça metade do sinal. Tudo
   depois do primeiro espaço é sobrenome. */
function partirNome(nome) {
  const partes = String(nome ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!partes.length) return {};
  return { fn: partes[0], ln: partes.slice(1).join(' ') || null };
}

/* Os valores vão CRUS no fbq('init', ...). A biblioteca da Meta faz o
   SHA-256 no cliente antes de qualquer coisa sair do navegador — hash
   feito por nós aqui seria hash de hash e o match falharia em silêncio.
   No servidor é o contrário: lá o hash é nossa responsabilidade. */
function dadosAvancados() {
  const dados = {
    ...(ler(sessionStorage, CHAVE_PII) || {}),
    ...(ler(localStorage, CHAVE_GEO) || {}),
    /* Mesmo external_id dos dois lados: é o que amarra a sessão do
       navegador ao evento que sai do servidor. Reusa o sessao_id que o
       adv-track.js já gera, em vez de inventar um segundo identificador
       que diria a mesma coisa. */
    external_id: sessaoId()
  };
  Object.keys(dados).forEach(k => { if (!dados[k]) delete dados[k]; });
  return dados;
}

/* ---------- identificadores de clique ---------- */

const fbclidDe = fbc => String(fbc || '').split('.')[3] || null;

function identificadoresDeClique() {
  const salvo = ler(localStorage, CHAVE_CLIQUE) || {};

  /* Quem cria o _fbp é a própria biblioteca da Meta. Só lemos. Se o
     adblock impedir a criação depois, o valor que já tínhamos vale. */
  const fbp = lerCookie('_fbp') || salvo.fbp || null;

  /* O _fbc só existe quando a pessoa chegou por link de anúncio. Se o
     fbclid está na URL e o cookie ainda não foi escrito (biblioteca
     bloqueada, ou lemos antes dela carregar), montamos no formato que a
     Meta espera: fb.1.<timestamp>.<fbclid>. Sem isso o clique pago
     chega ao CAPI sem o que casa o lead com o anúncio.
     Quando o fbclid da URL é o mesmo que já tínhamos, reaproveitamos o
     valor antigo para preservar o timestamp do clique de verdade em vez
     de carimbar a hora de agora a cada página. */
  const fbclid = new URLSearchParams(location.search).get('fbclid');
  const anterior = lerCookie('_fbc') || salvo.fbc || null;
  let fbc = anterior;
  if (fbclid && fbclidDe(anterior) !== fbclid) fbc = `fb.1.${Date.now()}.${fbclid}`;

  if (fbp !== salvo.fbp || fbc !== salvo.fbc) gravar(localStorage, CHAVE_CLIQUE, { fbp, fbc });
  return { fbp, fbc };
}

/* ---------- biblioteca da Meta ---------- */

/* Snippet padrão do fbq, sem o init e sem o PageView que a Meta cola
   junto: os dois precisam esperar o Advanced Matching e o event_id, que
   só existem depois deste módulo rodar. A fila (n.queue) segura qualquer
   chamada feita antes do fbevents.js terminar de carregar, então a ordem
   init -> track continua garantida. */
function carregarBiblioteca() {
  if (window.fbq) return;
  const n = window.fbq = function () {
    n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
  };
  if (!window._fbq) window._fbq = n;
  n.push = n;
  n.loaded = true;
  n.version = '2.0';
  n.queue = [];
  const t = document.createElement('script');
  t.async = true;
  t.src = 'https://connect.facebook.net/en_US/fbevents.js';
  const s = document.getElementsByTagName('script')[0];
  s.parentNode.insertBefore(t, s);
}

let pixelIniciado = false;

/* IMPORTANTE, e verificado no navegador: a fbevents.js só aceita dados
   de identificação no PRIMEIRO fbq('init') da página. Um segundo init
   com dados novos é descartado — a biblioteca registra "Duplicate Pixel
   ID" e mantém o userData original. `fbq('set','userData', ...)` também
   é recusado nesta versão, em qualquer ordem de argumento.

   Consequência prática: o Advanced Matching do navegador é o que estiver
   guardado NO MOMENTO em que a página carrega. Como o lead só se
   identifica ao enviar o formulário, o que ele digitou fica em
   sessionStorage e entra no init da página seguinte — e o evento de
   conversão do navegador é adiado junto (ver `enfileirar`). Quem não
   espera é o CAPI: ele sai na hora, com o PII completo hasheado no
   servidor e o mesmo event_id. */
function aplicarIdentificacao() {
  if (!PIXEL_ID || !window.fbq || pixelIniciado) return;
  pixelIniciado = true;
  try { window.fbq('init', PIXEL_ID, dadosAvancados()); }
  catch (e) { console.warn('[meta] init falhou, o CAPI cobre', e); }
}

/* ---------- envio ---------- */

const novoEventId = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch { /* contexto inseguro */ }
  return 'e_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
};

/* O navegador não sabe cidade, estado nem CEP de quem está do outro
   lado — e pedir permissão de geolocalização espantaria o lead. Quem
   sabe é a borda da Vercel, que carimba isso em todo request. Então a
   função do CAPI devolve o que descobriu e guardamos para o próximo
   fbq('init') levar ct/st/zp/country também no lado do navegador. */
function guardarGeo(resposta) {
  const geo = resposta?.geo;
  if (!geo) return;
  if (JSON.stringify(ler(localStorage, CHAVE_GEO)) === JSON.stringify(geo)) return;
  gravar(localStorage, CHAVE_GEO, geo);
  /* Não reinicializa o pixel: o segundo init seria descartado. A geo
     entra no init da próxima página, e como mora em localStorage vale
     também para as visitas seguintes. */
}

function enviarCapi(evento) {
  const { fbp, fbc } = identificadoresDeClique();
  const corpo = JSON.stringify({
    ...evento,
    event_time: Math.floor(Date.now() / 1000),
    event_source_url: location.href,
    action_source: 'website',
    external_id: sessaoId(),
    fbp,
    fbc,
    /* PII vai cru para a NOSSA função, no mesmo domínio e por HTTPS. O
       hash acontece lá, junto com o IP e o user agent que só o servidor
       enxerga. Hashear aqui deixaria o servidor sem como normalizar. */
    user: ler(sessionStorage, CHAVE_PII) || {}
  });

  /* keepalive porque finalizar() no quiz.js navega logo depois de
     disparar a conversão: sem ele o navegador cancela a requisição no
     meio do caminho e o EndForm nunca chega ao servidor. */
  try {
    fetch(ROTA_CAPI, {
      method: 'POST',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: corpo
    })
      .then(r => (r.ok ? r.json() : null))
      .then(guardarGeo)
      .catch(e => console.warn('[meta] CAPI falhou, seguindo assim mesmo', e));
  } catch (e) {
    console.warn('[meta] CAPI não pôde ser chamado', e);
  }
}

/* ---------- API pública ---------- */

function dispararNoNavegador(nome, eventId, dados, personalizado) {
  if (!PIXEL_ID || !window.fbq) return;
  try {
    window.fbq(personalizado ? 'trackCustom' : 'track', nome, dados || {}, { eventID: eventId });
  } catch (e) {
    console.warn('[meta] fbq falhou, o CAPI cobre', e);
  }
}

/* Fila de eventos que só devem sair do navegador na página seguinte,
   quando o fbq('init') já puder nascer com o nome/e-mail/telefone do
   lead. Guarda o event_id junto: é o mesmo que o CAPI já usou, então a
   Meta continua tratando os dois como uma conversão só. */
const CHAVE_PENDENTES = 'adv_meta_pendentes';

function enfileirar(evento) {
  const fila = ler(sessionStorage, CHAVE_PENDENTES) || [];
  fila.push(evento);
  gravar(sessionStorage, CHAVE_PENDENTES, fila);
}

function dispararPendentes() {
  const fila = ler(sessionStorage, CHAVE_PENDENTES);
  if (!fila || !fila.length) return;
  // limpa antes de disparar: se algo estourar no meio, a fila não fica
  // presa repetindo o mesmo evento a cada página
  gravar(sessionStorage, CHAVE_PENDENTES, []);
  fila.forEach(e => dispararNoNavegador(e.nome, e.eventId, e.dados, e.personalizado));
}

/* `personalizado` decide entre track e trackCustom: evento padrão da
   Meta (PageView, Lead, Schedule) vai por track; `EndForm` é custom e
   só existe por trackCustom.

   `adiarNavegador` serve para a conversão do quiz — ver a explicação em
   aplicarIdentificacao(). O CAPI nunca é adiado. */
export function rastrear(nome, { dados = null, personalizado = false, adiarNavegador = false } = {}) {
  const eventId = novoEventId();

  if (adiarNavegador) enfileirar({ nome, eventId, dados, personalizado });
  else dispararNoNavegador(nome, eventId, dados, personalizado);

  enviarCapi({ event_name: nome, event_id: eventId, custom_data: dados || null });
  return eventId;
}

/* Guarda o que o lead acabou de informar. Chamado assim que o cadastro
   é válido, nunca antes: dado meio digitado vira hash errado e piora o
   match em vez de melhorar.
   Só persiste — não mexe no pixel já inicializado, porque a biblioteca
   ignoraria. Quem usa isso é o init da próxima página e o CAPI, que lê
   o mesmo sessionStorage na hora de montar o corpo. */
export function identificar(lead) {
  if (!lead) return;
  const { fn, ln } = partirNome(lead.nome);
  const pii = {
    em: String(lead.email ?? '').trim().toLowerCase() || null,
    ph: telefoneE164(lead.whatsapp),
    fn: fn || null,
    ln: ln || null
  };
  Object.keys(pii).forEach(k => { if (!pii[k]) delete pii[k]; });
  gravar(sessionStorage, CHAVE_PII, { ...(ler(sessionStorage, CHAVE_PII) || {}), ...pii });
}

/* Roda em toda página do funil. */
export function iniciarPixel() {
  if (!PIXEL_ID) console.info('[meta] sem ADV_META_PIXEL_ID: só o CAPI vai receber');
  else carregarBiblioteca();

  // antes do PageView: é a chegada que traz o fbclid na URL
  identificadoresDeClique();
  aplicarIdentificacao();
  // depois do init (que já leva o PII guardado) e antes do PageView
  dispararPendentes();
  rastrear('PageView');
}

const CONTEUDO_QUIZ = { content_name: 'Diagnóstico do escritório', content_category: 'quiz' };

/* Cadastro concluído. Dois eventos de propósito: `Lead` é o padrão da
   Meta e alimenta públicos e otimização genérica; `EndForm` é o custom
   que as campanhas desta conta otimizam hoje e o que não pode faltar.
   Cada um ganha seu próprio event_id, compartilhado com o CAPI.

   Os dois saem adiados no navegador. O quiz.js manda para `obrigado`
   logo depois desta chamada, e é lá que o fbq('init') consegue nascer
   com o e-mail, o telefone e o nome que a pessoa acabou de digitar —
   nesta página o pixel já está inicializado e não aceita mais dado de
   identificação. O CAPI, esse sim, sai agora: a conversão é registrada
   com o PII completo mesmo que a navegação nunca aconteça. */
export function rastrearCadastro(lead) {
  identificar(lead);
  rastrear('Lead', { dados: CONTEUDO_QUIZ, adiarNavegador: true });
  rastrear('EndForm', { dados: CONTEUDO_QUIZ, personalizado: true, adiarNavegador: true });
}

/* Agendamento é a última tela do funil: não existe página seguinte para
   adiar o evento do navegador, então ele sai na hora. O Advanced
   Matching aqui é o que veio guardado do quiz, que é o caso normal
   (agendar.html já pré-preenche o formulário com esses mesmos dados).
   Se a pessoa tiver corrigido algum campo, quem carrega o valor novo é
   o CAPI, que lê o sessionStorage recém-atualizado por identificar(). */
export function rastrearAgendamento(lead) {
  identificar(lead);
  rastrear('Schedule', { dados: { content_name: 'Sessão Estratégica' } });
}
