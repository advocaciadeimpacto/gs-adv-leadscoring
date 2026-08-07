/* Origem do lead.
   ------------------------------------------------------------------
   Um único formulário atende todos os canais: o que muda é o link.

   O problema que isso resolve: a UTM só existe na URL da PRIMEIRA página.
   Quando o lead vai de index para obrigado e depois para agendar, os
   parâmetros somem e a origem se perde justamente na hora de gravar.
   Por isso capturamos na chegada e carregamos até o fim do funil.

   Guardamos duas atribuições:
     primeiro  -> como ele conheceu (first-touch)
     ultimo    -> o que trouxe ele desta vez (last-touch)
   Guardar as duas é barato e evita a discussão de "qual canal levou o
   crédito" quando a pessoa vem de anúncio e volta por link direto.
   ------------------------------------------------------------------ */

const CHAVE = 'adv_origem';

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

/* Identificadores de clique das plataformas. Vêm sozinhos no link do
   anúncio e permitem casar o lead com o clique real lá dentro, mesmo
   quando alguém esquece de montar a UTM. */
const CLICK_IDS = ['fbclid', 'gclid', 'ttclid', 'msclkid', 'ctwa_clid'];

const ler = () => {
  try { return JSON.parse(localStorage.getItem(CHAVE)); } catch { return null; }
};
const gravar = v => {
  try { localStorage.setItem(CHAVE, JSON.stringify(v)); } catch { /* sem storage */ }
};

/* Sem UTM, o referrer ainda diz de onde a pessoa veio. Cobre o tráfego
   orgânico, onde ninguém controla o link. */
function inferirDoReferrer(ref) {
  if (!ref) return { utm_source: 'direto', utm_medium: 'nenhum' };
  let host = '';
  try { host = new URL(ref).hostname.replace('www.', ''); } catch { return { utm_source: 'direto', utm_medium: 'nenhum' }; }
  if (host.includes(location.hostname)) return null; // navegação interna, ignora
  const mapa = {
    'instagram.com': 'instagram', 'l.instagram.com': 'instagram',
    'facebook.com': 'facebook', 'l.facebook.com': 'facebook',
    'youtube.com': 'youtube', 'google.com': 'google', 'google.com.br': 'google',
    'bing.com': 'bing', 't.co': 'twitter', 'linkedin.com': 'linkedin',
    'web.whatsapp.com': 'whatsapp', 'api.whatsapp.com': 'whatsapp'
  };
  return { utm_source: mapa[host] || host, utm_medium: 'organico', referrer: ref };
}

/* Roda em toda página do funil. Só grava a origem uma vez por jornada. */
export function capturarOrigem() {
  const p = new URLSearchParams(location.search);
  const achado = {};
  [...UTM, ...CLICK_IDS].forEach(k => { const v = p.get(k); if (v) achado[k] = v; });

  const salvo = ler();
  const agora = new Date().toISOString();

  if (Object.keys(achado).length) {
    const toque = { ...achado, em: agora, landing: location.pathname, referrer: document.referrer || null };
    gravar({ primeiro: salvo?.primeiro || toque, ultimo: toque });
  } else if (!salvo) {
    const inferida = inferirDoReferrer(document.referrer);
    if (inferida) {
      const toque = { ...inferida, em: agora, landing: location.pathname };
      gravar({ primeiro: toque, ultimo: toque });
    }
  }
  return ler();
}

/* Formato achatado, pronto para virar colunas no banco. */
export function origemAtual() {
  const o = ler();
  if (!o) return null;
  return {
    ...o.ultimo,
    primeiro_source: o.primeiro?.utm_source || null,
    primeiro_campaign: o.primeiro?.utm_campaign || null,
    primeiro_em: o.primeiro?.em || null
  };
}

export function rotuloOrigem(o) {
  if (!o) return 'não identificada';
  const s = o.utm_source || 'direto';
  const c = o.utm_campaign;
  const t = o.utm_content;
  return [s, c, t].filter(Boolean).join(' · ');
}
