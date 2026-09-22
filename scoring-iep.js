/* Pesquisa de perfil de quem comprou a Imersão Escritório Previsível (IEP).

   Mesmo modelo do quiz da Sessão Estratégica (scoring.js): os mesmos quatro
   critérios, os mesmos pesos, os mesmos cortes de classe, a mesma escada, o
   mesmo ajuste por área e a mesma tipologia. De propósito: uma classe A da
   pesquisa tem de significar o mesmo que uma classe A do quiz, senão o
   comercial passa a ter duas réguas.

   O que muda é o que é próprio de quem já comprou:
   - a pergunta de urgência vira "como você vai colocar o plano em prática
     depois da imersão". Para quem já está dentro, a pressa que importa é a de
     ter acompanhamento, que é exatamente o que a oferta do fim do dia vende;
   - entram três perguntas que não pontuam e servem para o Guilherme preparar
     o sábado: maior desafio, tempo de advocacia e um campo livre.

   Como no quiz, a leitura comercial nunca aparece para quem responde. */

import {
  CRITERIOS as CRITERIOS_SESSAO, PERGUNTAS as PERGUNTAS_SESSAO,
  ESCADA, ADERENCIA, PERFIS, CLASSES, letra
} from './scoring.js';

export { ESCADA, ADERENCIA, PERFIS, CLASSES };

export const CRITERIOS = {
  ...CRITERIOS_SESSAO,
  urgencia: { ...CRITERIOS_SESSAO.urgencia, nome: 'Intenção de acompanhamento' }
};

const daSessao = chave => PERGUNTAS_SESSAO.find(q => q.crit === chave || q.campo === chave);

export const PERGUNTAS = [
  daSessao('faturamento'),
  daSessao('pessoas'),
  daSessao('area'),
  {
    crit: null, campo: 'oab',
    titulo: 'Há quanto tempo você advoga?',
    ajuda: null,
    opcoes: [
      { txt: 'Menos de 2 anos', tipo: 'ate2' },
      { txt: 'De 2 a 5 anos',   tipo: '2a5' },
      { txt: 'De 6 a 10 anos',  tipo: '6a10' },
      { txt: 'Mais de 10 anos', tipo: 'mais10' }
    ]
  },
  daSessao('perfil'),
  {
    crit: null, campo: 'desafio',
    titulo: 'Qual destes é o seu maior desafio hoje?',
    ajuda: 'Escolha o que mais pesa agora. O Guilherme vai usar isso para preparar o sábado.',
    opcoes: [
      { txt: 'Fazer contrato entrar todo mês, sem depender de indicação', tipo: 'vendas' },
      { txt: 'Saber quanto entra, quanto sobra e quanto custa cada contrato', tipo: 'dinheiro' },
      { txt: 'Sair do operacional: delegar, automatizar e contratar', tipo: 'operacional' },
      { txt: 'Montar, treinar e liderar a equipe', tipo: 'equipe' }
    ]
  },
  daSessao('mentoria'),
  {
    crit: 'urgencia',
    titulo: 'Depois da imersão, como você pretende colocar o plano em prática?',
    ajuda: null,
    opcoes: [
      { txt: 'Com acompanhamento de perto, já no próximo mês', pts: 25, tag: 'acomp_ja' },
      { txt: 'Com acompanhamento, nos próximos 3 meses',       pts: 20, tag: 'acomp_trimestre' },
      { txt: 'Ainda não sei',                                  pts: 10, tag: 'nao_sei' },
      { txt: 'Sozinho, com o material da imersão',             pts: 5,  tag: 'sozinho' }
    ]
  }
];

const QUALIDADE_TXT = {
  Alta:  'Quer acompanhamento logo e tem histórico de investir nisso. Ataque na semana da imersão.',
  Média: 'Existe intenção de acompanhamento, mas o prazo ou o histórico ainda não sustentam pressa total.',
  Baixa: 'Pretende seguir sozinho ou não decidiu, sem histórico de acompanhamento. Relacionamento antes de proposta.'
};

export const textoQualidade = nivel => QUALIDADE_TXT[nivel];

function qualidade(pontos) {
  const q = (pontos.urgencia ?? 0) + (pontos.mentoria ?? 0);
  const nivel = q >= 40 ? 'Alta' : q >= 25 ? 'Média' : 'Baixa';
  return { nivel, valor: q, txt: QUALIDADE_TXT[nivel] };
}

export function analisar(pontos, tags, area, perfil, divergencia) {
  const ad = ADERENCIA[area];
  const pos = [], neg = [];

  if (pontos.faturamento >= 20) pos.push('Faturamento no topo da régua: comporta os produtos mais altos da escada.');
  if (pontos.pessoas >= 20) pos.push('Equipe montada: a dor de gestão é concreta e a estrutura absorve o programa.');
  if (tags.urgencia === 'acomp_ja') pos.push('Quer acompanhamento para implementar já no próximo mês. Janela real para a oferta do fim da imersão.');
  if (tags.urgencia === 'acomp_trimestre') pos.push('Quer acompanhamento nos próximos 3 meses: intenção declarada e compatível com o ciclo.');
  if (tags.mentoria === 'implementou') pos.push('Já participou de acompanhamento e implementou. Perfil executor, com referência de valor.');
  if (tags.mentoria === 'parcial') pos.push('Tem histórico de acompanhamento e implementou parte: já entende o formato.');
  if (perfil === 'empresario') pos.push('Perfil empresário: entende delegação e a lógica de investir no negócio.');
  if (perfil === 'digital') pos.push('Perfil digital, que é o coração histórico da base: consciência de gestão vinda da escala.');
  if (area === 'massa') pos.push('Atua em ações em massa, onde o método tem o melhor histórico de resultado.');

  if (tags.urgencia === 'sozinho') neg.push('Pretende implementar sozinho. Não force: use a conversa para mostrar o custo de errar a ordem.');
  if (tags.urgencia === 'nao_sei') neg.push('Ainda não sabe como vai implementar. A conversa é para ajudar a decidir, não para fechar.');
  if (tags.mentoria === 'nao_aplicou') neg.push('Já participou de um programa e não conseguiu aplicar. Validar comprometimento antes de avançar.');
  if (tags.mentoria === 'nunca') neg.push('Nunca participou de acompanhamento. Sem referência de valor, a objeção costuma ser "será que funciona".');
  if (pontos.faturamento === 5) neg.push('Faturamento até R$ 10 mil. Oferecer os degraus altos aqui gera objeção de preço quase certa.');
  if (pontos.pessoas === 5) neg.push('Trabalha sozinho. Boa parte do conteúdo de gestão de equipe não se aplica ainda.');
  if (ad && ad.ajuste < 0) neg.push(ad.nota);
  if (perfil === 'tradicional') neg.push('Perfil tradicional, com resistência a digital e tecnologia. Exige mais construção de consciência.');
  if (divergencia) neg.push('Faturamento e estrutura apontam degraus distantes na escada. Confirme na conversa qual dos dois reflete a realidade.');

  return { pos, neg };
}

/* `respostas` é um array na ordem de PERGUNTAS, cada item é a opção escolhida. */
export function calcular(respostas) {
  const pontos = {}, tags = {}, campos = {};
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
    if (q.campo) campos[q.campo] = r.txt;
  });

  const teto = Object.values(CRITERIOS).reduce((a, c) => a + c.max * c.peso, 0);
  const ponderado = Object.keys(CRITERIOS)
    .reduce((a, k) => a + (pontos[k] ?? 0) * CRITERIOS[k].peso, 0);
  const base = Math.round((ponderado / teto) * 100);
  const ad = ADERENCIA[area];
  const total = Math.max(0, base + (ad?.ajuste ?? 0));
  const classe = letra(total);
  const divergencia = Math.abs(degrauFat - degrauPes) >= 2;
  const { pos, neg } = analisar(pontos, tags, area, perfil, divergencia);
  const plano = PERGUNTAS.find(q => q.crit === 'urgencia').opcoes.find(o => o.tag === tags.urgencia);

  return {
    pontos, tags, area, perfil, base, ajuste: ad?.ajuste ?? 0, total, classe,
    sla: CLASSES[classe].sla,
    degrau: ESCADA[degrauFat], degrauEstrutura: ESCADA[degrauPes], divergencia,
    qualidade: qualidade(pontos), pos, neg,
    desafio: campos.desafio ?? null,
    tempoOab: campos.oab ?? null,
    plano: plano?.txt ?? null,
    respostas: respostas.map((r, i) => ({
      pergunta: PERGUNTAS[i].titulo,
      criterio: PERGUNTAS[i].crit || PERGUNTAS[i].campo,
      resposta: r.txt,
      pts: r.pts ?? null
    }))
  };
}
