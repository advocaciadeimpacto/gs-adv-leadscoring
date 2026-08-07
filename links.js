/* Geração e diagnóstico dos links de campanha.
   ------------------------------------------------------------------
   O gerador existe menos por conveniência e mais por padronização: é ele
   que impede "Meta Ads", "meta-ads" e "metaads" virarem três canais
   diferentes no relatório. Tudo que passa por aqui sai normalizado.
   ------------------------------------------------------------------ */

export const BASE = 'https://lead-scoring-adv-impacto.vercel.app/';

/* Minúsculo, sem acento, sem espaço. As chaves {} ficam de fora da limpeza
   para as macros do Meta ({{campaign.name}}) sobreviverem. */
export function slug(s) {
  return String(s ?? '')
    .trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9{}._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const temMacro = l => /\{\{|\{[a-z_]+\}/.test(
  [l.campaign, l.content, l.term].filter(Boolean).join(' ')
);

export function montarURL({ source, medium, campaign, content, term }) {
  const u = new URL(BASE);
  const p = u.searchParams;
  if (source) p.set('utm_source', source);
  if (medium) p.set('utm_medium', medium);
  if (campaign) p.set('utm_campaign', campaign);
  if (content) p.set('utm_content', content);
  if (term) p.set('utm_term', term);
  // as macros não podem ir codificadas, senão a plataforma não substitui
  return decodeURIComponent(u.toString());
}

/* Uma resposta pertence ao link quando todos os campos definidos no link
   batem com a origem gravada. Link mais específico casa mais estreito;
   link só com source e campaign agrupa todos os criativos daquela campanha. */
export function respostasDoLink(link, respostas) {
  const campos = [['source', 'utm_source'], ['medium', 'utm_medium'],
                  ['campaign', 'utm_campaign'], ['content', 'utm_content'],
                  ['term', 'utm_term']];
  return respostas.filter(r => {
    const o = r.origem;
    if (!o) return false;
    return campos.every(([k, utm]) => !link[k] || slug(o[utm]) === slug(link[k]));
  });
}

/* Links com macro têm campaign e content dinâmicos, então a comparação
   estreita nunca casaria. Nesses, vale só source e medium. */
export function respostasDoLinkComMacro(link, respostas) {
  return respostas.filter(r => {
    const o = r.origem;
    if (!o) return false;
    return slug(o.utm_source) === slug(link.source) &&
           (!link.medium || slug(o.utm_medium) === slug(link.medium));
  });
}

const DIAS_ATIVO = 30;

/* Status derivado do uso real, nunca digitado à mão. */
export function statusDoLink(link, respostas) {
  const casadas = temMacro(link) ? respostasDoLinkComMacro(link, respostas)
                                 : respostasDoLink(link, respostas);
  const total = casadas.length;
  if (!total) {
    const diasDeVida = (Date.now() - new Date(link.criado_em)) / 864e5;
    return {
      total: 0, ultimo: null,
      chave: diasDeVida < 3 ? 'novo' : 'sem-uso',
      rotulo: diasDeVida < 3 ? 'Recém-criado' : 'Nunca usado',
      nota: diasDeVida < 3 ? 'Criado há pouco, ainda sem leads.'
                           : 'Nenhum lead chegou por este link desde que foi criado.'
    };
  }
  const ultimo = casadas.reduce((a, b) => new Date(a.criado_em) > new Date(b.criado_em) ? a : b);
  const dias = Math.floor((Date.now() - new Date(ultimo.criado_em)) / 864e5);
  return dias <= DIAS_ATIVO
    ? { total, ultimo: ultimo.criado_em, chave: 'ativo', rotulo: 'Ativo',
        nota: `Último lead há ${dias === 0 ? 'menos de um dia' : dias + (dias === 1 ? ' dia' : ' dias')}.` }
    : { total, ultimo: ultimo.criado_em, chave: 'parado', rotulo: 'Parado',
        nota: `Já trouxe leads, mas o último foi há ${dias} dias.` };
}

/* Atalhos com a convenção já preenchida, para o time não inventar nomenclatura. */
export const PRESETS = [
  { nome: 'Meta Ads', source: 'meta', medium: 'cpc',
    campaign: '{{campaign.name}}', term: '{{adset.name}}', content: '{{ad.name}}',
    dica: 'Cole os parâmetros no campo "Parâmetros de URL" do anúncio. O Meta preenche sozinho.' },
  { nome: 'Bio Instagram', source: 'instagram-bio', medium: 'organico', campaign: 'sessao-estrategica' },
  { nome: 'Stories', source: 'instagram', medium: 'organico', campaign: 'sessao-estrategica', content: 'stories' },
  { nome: 'Live semanal', source: 'live', medium: 'organico', campaign: 'live-semanal' },
  { nome: 'E-mail base', source: 'email', medium: 'email', campaign: 'base-lowticket' },
  { nome: 'WhatsApp', source: 'whatsapp', medium: 'mensagem', campaign: 'base-lowticket' },
  { nome: 'Indicação', source: 'indicacao', medium: 'indicacao', campaign: 'evergreen-indicacao' },
  { nome: 'YouTube', source: 'youtube', medium: 'organico', campaign: 'sessao-estrategica' }
];
