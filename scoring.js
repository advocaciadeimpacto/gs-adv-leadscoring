/* Modelo de lead scoring — Advocacia de Impacto · v3
   Base: 4 critérios de 25 pontos (Vitor). Escada e tipologia (Guilherme).
   Usado pelo quiz público e pelo painel interno, para os dois nunca
   divergirem sobre como a nota é calculada. */

export const CRITERIOS = {
  faturamento: { nome: 'Faturamento', max: 25 },
  pessoas:     { nome: 'Quantidade de pessoas', max: 25 },
  urgencia:    { nome: 'Urgência', max: 25 },
  mentoria:    { nome: 'Histórico de acompanhamento', max: 25 }
};

export const ESCADA = ['Trincheira', 'Gestão Descomplicada', 'Gestão de Impacto', 'Implementação ou Impactus'];

export const PERGUNTAS = [
  {
    crit: 'faturamento',
    titulo: 'Qual o faturamento mensal do seu escritório?',
    ajuda: 'Considere a média dos últimos três meses.',
    opcoes: [
      { txt: 'Até R$ 10 mil',            pts: 5,  degrau: 0 },
      { txt: 'De R$ 11 mil a R$ 30 mil', pts: 10, degrau: 1 },
      { txt: 'De R$ 31 mil a R$ 80 mil', pts: 20, degrau: 2 },
      { txt: 'Acima de R$ 80 mil',       pts: 25, degrau: 3 }
    ]
  },
  {
    crit: 'pessoas',
    titulo: 'Quantas pessoas trabalham no escritório, além de você?',
    ajuda: 'Sócios, advogados, estagiários e administrativo.',
    opcoes: [
      { txt: 'Nenhuma, trabalho sozinho', pts: 5,  degrau: 0 },
      { txt: 'De 1 a 3 pessoas',          pts: 10, degrau: 1 },
      { txt: 'De 4 a 15 pessoas',         pts: 20, degrau: 2 },
      { txt: 'Mais de 15 pessoas',        pts: 25, degrau: 3 }
    ]
  },
  {
    crit: 'urgencia',
    titulo: 'Em quanto tempo você quer resolver isso?',
    ajuda: null,
    opcoes: [
      { txt: 'Agora, ainda neste mês',          pts: 25, tag: 'agora' },
      { txt: 'Em até 3 meses',                  pts: 20, tag: 'trimestre' },
      { txt: 'Em até 6 meses',                  pts: 12, tag: 'semestre' },
      { txt: 'Em até 12 meses',                 pts: 6,  tag: 'ano' },
      { txt: 'Não tenho prazo, só pesquisando', pts: 0,  tag: 'sem_prazo' }
    ]
  },
  {
    crit: 'mentoria',
    titulo: 'Você já participou de algum programa de acompanhamento ou mentoria?',
    ajuda: 'Vale qualquer programa de gestão ou crescimento, dentro ou fora do direito.',
    opcoes: [
      { txt: 'Sim, e implementei o que aprendi', pts: 25, tag: 'implementou' },
      { txt: 'Sim, e implementei uma parte',     pts: 18, tag: 'parcial' },
      { txt: 'Sim, mas não consegui aplicar',    pts: 8,  tag: 'nao_aplicou' },
      { txt: 'Não, nunca participei',            pts: 5,  tag: 'nunca' }
    ]
  },
  {
    crit: null, campo: 'area',
    titulo: 'Qual a sua principal área de atuação?',
    ajuda: null,
    opcoes: [
      { txt: 'Previdenciário', tipo: 'massa' },     { txt: 'Bancário', tipo: 'massa' },
      { txt: 'Trabalhista', tipo: 'massa' },        { txt: 'Consumidor', tipo: 'massa' },
      { txt: 'Direito digital', tipo: 'massa' },    { txt: 'Marcas e patentes', tipo: 'massa' },
      { txt: 'Saúde', tipo: 'hibrido' },            { txt: 'Tributário', tipo: 'hibrido' },
      { txt: 'Família', tipo: 'artesanal' },        { txt: 'Sucessões e inventário', tipo: 'artesanal' },
      { txt: 'Empresarial', tipo: 'artesanal' },    { txt: 'Criminal', tipo: 'criminal' },
      { txt: 'Atuo em várias áreas', tipo: 'varias' }
    ]
  },
  {
    crit: null, campo: 'perfil',
    titulo: 'O que mais se parece com o seu escritório hoje?',
    ajuda: null,
    opcoes: [
      { txt: 'Capto por indicação e boca a boca, e faço quase tudo eu mesmo', tipo: 'tradicional' },
      { txt: 'Tenho bom volume de clientes pelo digital, mas a gestão não acompanha', tipo: 'digital' },
      { txt: 'Já tenho equipe, delego e invisto no crescimento do escritório', tipo: 'empresario' }
    ]
  }
];

export const ADERENCIA = {
  massa:     { ajuste: 0,   rotulo: 'Ações em massa', nota: 'Perfil histórico da base: a necessidade de escala já criou consciência de gestão.' },
  hibrido:   { ajuste: 0,   rotulo: 'Híbrido',        nota: 'Modelo híbrido, atende bem ao método.' },
  varias:    { ajuste: 0,   rotulo: 'Generalista',    nota: 'Atuação em várias áreas: confirmar na call qual delas sustenta o faturamento.' },
  artesanal: { ajuste: -5,  rotulo: 'Artesanal',      nota: 'Operação mais artesanal, com menos ganho de escala por processo. Aderência média.' },
  criminal:  { ajuste: -15, rotulo: 'Criminal',       nota: 'Grau artesanal muito intenso. É o perfil que o método atende pior, segundo o histórico.' }
};

export const PERFIS = {
  tradicional: {
    rotulo: 'Tradicional',
    leitura: 'Capta pelo modelo antigo e centraliza tarefas. Público que o low ticket de pessoas está começando a abrir.',
    abordagem: 'Construa consciência antes de falar de método. Espere ciclo mais longo e resistência a tecnologia.'
  },
  digital: {
    rotulo: 'Digital',
    leitura: 'Tem alavancagem por marketing, mas a gestão de pessoas, processos e clientes não acompanhou.',
    abordagem: 'Fale a língua de escala. A dor de gestão já é consciente, vá direto ao gargalo operacional.'
  },
  empresario: {
    rotulo: 'Empresário',
    leitura: 'Já entende delegação, multicanal e a lógica de investir no próprio negócio.',
    abordagem: 'Conversa de ROI e estrutura. Ciclo curto, decisão baseada em retorno.'
  }
};

export const CLASSES = {
  A: { min: 85, cor: 'var(--a)', nome: 'Classe A',
       lede: 'Porte, urgência e histórico de acompanhamento aparecem juntos. É o ICP na definição mais estrita.',
       sla: 'Contato em até 1 hora, pelo closer' },
  B: { min: 65, cor: 'var(--b)', nome: 'Classe B',
       lede: 'Bom lead, com um dos quatro critérios abaixo do ideal. Costuma virar A depois de uma conversa bem feita.',
       sla: 'Contato no mesmo dia' },
  C: { min: 45, cor: 'var(--c)', nome: 'Classe C',
       lede: 'Cabe num degrau menor da escada, ou tem porte sem pressa. Vale relacionamento antes de proposta.',
       sla: 'Contato em até 48 horas' },
  D: { min: 0,  cor: 'var(--d)', nome: 'Classe D',
       lede: 'Porte pequeno e sem prazo definido. Não descarte: nutra e reavalie quando houver movimento.',
       sla: 'Automação e conteúdo, sem consumir tempo de closer' }
};

export const letra = s => s >= 85 ? 'A' : s >= 65 ? 'B' : s >= 45 ? 'C' : 'D';

function qualidade(pontos) {
  const q = pontos.urgencia + pontos.mentoria;
  if (q >= 40) return { nivel: 'Alta', valor: q, txt: 'Tem pressa e histórico de investir em acompanhamento. Ataque agora, mesmo que o porte seja menor.' };
  if (q >= 25) return { nivel: 'Média', valor: q, txt: 'Existe intenção, mas o prazo ou o histórico ainda não sustentam pressa total.' };
  return { nivel: 'Baixa', valor: q, txt: 'Sem prazo claro nem histórico de acompanhamento. Amadurecer antes de investir hora de closer.' };
}

/* Recebe as respostas escolhidas e devolve o diagnóstico completo.
   `respostas` é um array na ordem de PERGUNTAS, cada item { txt, pts, tag, tipo, degrau }. */
export function calcular(respostas) {
  const pontos = {}, tags = {};
  let area = 'varias', perfil = 'digital', degrauFat = 0, degrauPes = 0;

  respostas.forEach((r, idx) => {
    const q = PERGUNTAS[idx];
    if (q.crit) {
      pontos[q.crit] = r.pts;
      if (r.tag) tags[q.crit] = r.tag;
      if (q.crit === 'faturamento') degrauFat = r.degrau;
      if (q.crit === 'pessoas') degrauPes = r.degrau;
    }
    if (q.campo === 'area') area = r.tipo;
    if (q.campo === 'perfil') perfil = r.tipo;
  });

  const base = Object.values(pontos).reduce((a, b) => a + b, 0);
  const ad = ADERENCIA[area];
  const total = Math.max(0, base + ad.ajuste);
  const classe = letra(total);
  const qual = qualidade(pontos);
  const divergencia = Math.abs(degrauFat - degrauPes) >= 2;

  const pos = [], neg = [];
  if (pontos.faturamento >= 20) pos.push('Faturamento no topo da régua: comporta os produtos mais altos da escada.');
  if (pontos.pessoas >= 20) pos.push('Equipe montada: a dor de gestão é concreta e a estrutura absorve o programa.');
  if (tags.urgencia === 'agora') pos.push('Quer resolver ainda este mês. Existe janela real de fechamento.');
  if (tags.urgencia === 'trimestre') pos.push('Prazo de até 3 meses: urgência declarada e compatível com o ciclo.');
  if (tags.mentoria === 'implementou') pos.push('Já participou de acompanhamento e implementou. Perfil executor, com referência de valor.');
  if (tags.mentoria === 'parcial') pos.push('Tem histórico de acompanhamento e implementou parte: já entende o formato.');
  if (perfil === 'empresario') pos.push('Perfil empresário: entende delegação e a lógica de investir no negócio.');
  if (perfil === 'digital') pos.push('Perfil digital, que é o coração histórico da base: consciência de gestão vinda da escala.');
  if (area === 'massa') pos.push('Atua em ações em massa, onde o método tem o melhor histórico de resultado.');

  if (tags.urgencia === 'sem_prazo') neg.push('Sem prazo definido. Não force fechamento: use a call para dimensionar o custo de continuar como está.');
  if (tags.urgencia === 'ano') neg.push('Prazo de até 12 meses. A intenção existe, mas a pressa não. Ciclo longo.');
  if (tags.mentoria === 'nao_aplicou') neg.push('Já participou de um programa e não conseguiu aplicar. Validar comprometimento antes de avançar.');
  if (tags.mentoria === 'nunca') neg.push('Nunca participou de acompanhamento. Sem referência de valor, a objeção costuma ser "será que funciona".');
  if (pontos.faturamento === 5) neg.push('Faturamento até R$ 10 mil. Oferecer os degraus altos aqui gera objeção de preço quase certa.');
  if (pontos.pessoas === 5) neg.push('Trabalha sozinho. Boa parte do conteúdo de gestão de equipe não se aplica ainda.');
  if (ad.ajuste < 0) neg.push(ad.nota);
  if (perfil === 'tradicional') neg.push('Perfil tradicional, com resistência a digital e tecnologia. Exige mais construção de consciência.');
  if (divergencia) neg.push('Faturamento e estrutura apontam degraus distantes na escada. Confirme na call qual dos dois reflete a realidade.');

  return {
    pontos, tags, area, perfil, base, ajuste: ad.ajuste, aderencia: ad, total, classe,
    degrau: ESCADA[degrauFat], degrauEstrutura: ESCADA[degrauPes], divergencia,
    qualidade: qual, pos, neg,
    respostas: respostas.map((r, i) => ({
      pergunta: PERGUNTAS[i].titulo,
      criterio: PERGUNTAS[i].crit || PERGUNTAS[i].campo,
      resposta: r.txt,
      pts: r.pts ?? null
    }))
  };
}

export function abordagem(res) {
  return PERFIS[res.perfil].abordagem;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Visão do comercial. Interna: nunca deve ser mostrada ao lead. */
export function htmlResultado(res, { titulo = null } = {}) {
  const k = CLASSES[res.classe];
  const p = PERFIS[res.perfil];

  const barras = Object.keys(CRITERIOS).map(key => {
    const pct = Math.round((res.pontos[key] / 25) * 100);
    const cls = pct >= 70 ? 'strong' : pct >= 35 ? '' : 'weak';
    return `<div class="axis">
        <div class="axis-top"><span>${CRITERIOS[key].nome}</span><b>${res.pontos[key]} / 25</b></div>
        <div class="track"><div class="fill ${cls}" style="width:${pct}%"></div></div>
      </div>`;
  }).join('');

  const linhaScore = res.ajuste !== 0
    ? `<p class="score-line">Perfil <b>${res.base}</b> · aderência <b>${res.ajuste}</b> (${esc(res.aderencia.rotulo)}) · final <b>${res.total}</b> de 100</p>`
    : `<p class="score-line"><b>${res.total}</b> de 100 pontos</p>`;

  return `
    <div class="res-head">
      <div class="grade chanfro" style="background:${k.cor}">${res.classe}</div>
      <div>
        <span class="eyebrow">${titulo ? esc(titulo) : 'Classificação do lead'}</span>
        <h1>${k.nome}</h1>
        <p class="res-lede">${k.lede}</p>
        ${linhaScore}
      </div>
    </div>

    <dl class="dispatch">
      <div class="d-row"><dt>Prioridade</dt><dd><em>${k.sla}</em></dd></div>
      <div class="d-row"><dt>Degrau da escada</dt><dd>${esc(res.degrau)}${res.divergencia ? ` <span class="alerta">estrutura sugere ${esc(res.degrauEstrutura)}</span>` : ''}</dd></div>
      <div class="d-row"><dt>Qualidade</dt><dd><em>${res.qualidade.nivel}</em> (${res.qualidade.valor}/50). ${res.qualidade.txt}</dd></div>
      <div class="d-row"><dt>Tipo de advogado</dt><dd><em>${p.rotulo}</em>. ${p.leitura}</dd></div>
      <div class="d-row"><dt>Abordagem</dt><dd>${p.abordagem}</dd></div>
    </dl>

    <section class="axes"><h2>Composição da nota</h2>${barras}</section>

    <div class="reads">
      <section class="pos"><h2>A favor</h2>
        ${res.pos.length ? `<ul>${res.pos.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="empty">Nenhum sinal forte identificado.</p>'}
      </section>
      <section class="neg"><h2>Atenção na conversa</h2>
        ${res.neg.length ? `<ul>${res.neg.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p class="empty">Nenhum ponto de atrito identificado.</p>'}
      </section>
    </div>

    <section class="axes">
      <h2>Respostas dadas</h2>
      <dl class="dispatch">
        ${res.respostas.map(r => `<div class="d-row">
            <dt>${esc(r.criterio)}</dt>
            <dd>${esc(r.resposta)}${r.pts !== null ? ` <span class="meta">${r.pts} pts</span>` : ''}</dd>
          </div>`).join('')}
      </dl>
    </section>`;
}
