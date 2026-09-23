/* Pesquisa de perfil de quem comprou os produtos low ticket:
   Pós-Venda no Piloto Automático (R$ 47) e ImpactMind RH (R$ 37).

   UM formulário, dois produtos. O produto vem da URL (?p=posvenda |
   ?p=impactrh) e muda quatro coisas: o nome escrito na página, as duas
   primeiras perguntas, o texto da pergunta de intenção e o agradecimento.

   Todo o resto — critérios, pesos, cortes de classe, escada, aderência e
   tipologia — é importado de scoring.js, pelo mesmo motivo do
   scoring-iep.js: uma classe A daqui tem de significar o mesmo que uma
   classe A do quiz, senão o comercial passa a ter três réguas.

   O que é próprio de quem comprou low ticket:
   - a urgência vira "quando você vai usar isso", e não "em quanto tempo
     quer resolver". Quem pagou R$ 47 já decidiu; o que separa um comprador
     do outro é se o material vai rodar nesta semana ou virar PDF parado;
   - as duas perguntas de abertura são sobre o problema que o produto
     resolve. Elas não pontuam: servem para o Guilherme saber com quem
     está falando e para o conteúdo de e-mail e grupo falar a língua certa;
   - a leitura comercial aqui é de ESCADA, não de fechamento. A pergunta
     que o painel responde é "quem desses R$ 47 cabe na Imersão ou num
     degrau acima", e isso sai do faturamento, da estrutura e da qualidade.

   Como no quiz, a leitura comercial nunca aparece para quem responde. */

import {
  CRITERIOS as CRITERIOS_SESSAO, PERGUNTAS as PERGUNTAS_SESSAO,
  ESCADA, ADERENCIA, PERFIS, CLASSES, letra
} from './scoring.js';

export { ESCADA, ADERENCIA, PERFIS, CLASSES };

export const CRITERIOS = {
  ...CRITERIOS_SESSAO,
  urgencia: { ...CRITERIOS_SESSAO.urgencia, nome: 'Intenção de aplicar' }
};

/* ------------------------------------------------------------------
   Os dois produtos.

   `slug` é o que vai para o banco e para o webhook; `nome` é o que
   aparece escrito na página. O painel e a mensagem do WhatsApp leem
   daqui, para o nome do produto ser escrito uma vez só.
   ------------------------------------------------------------------ */
export const PRODUTOS = {
  posvenda: {
    slug: 'posvenda',
    nome: 'Pós-Venda no Piloto Automático',
    curto: 'Pós-Venda',
    eyebrow: 'Pós-Venda no Piloto Automático · Método Trilha do Cliente',
    titulo: 'Conta pra gente como é o seu pós-venda hoje.',
    chamada: 'Com o que você responder, o Guilherme ajusta os exemplos da aula e as mensagens que a gente manda depois — para o kit sair do download e entrar na entrada do seu próximo cliente.',
    compra: 'Use o mesmo e-mail e WhatsApp da compra do Pós-Venda, para a gente saber que é você.',
    livre: {
      titulo: 'O que você quer que pare de acontecer no seu escritório?',
      ajuda: 'Uma frase já ajuda. Se preferir, pode pular.',
      placeholder: 'Ex.: cliente me chamar no particular no domingo perguntando do processo'
    },
    obrigado: 'O acesso ao kit e a aula estão no seu e-mail. Comece pelo <strong>Manual do Cliente</strong>: troque a logo e os campos entre colchetes e mande na entrada do próximo cliente que assinar.'
  },
  impactrh: {
    slug: 'impactrh',
    nome: 'ImpactMind RH',
    curto: 'ImpactMind RH',
    eyebrow: 'ImpactMind RH · Recrutamento com IA',
    titulo: 'Conta pra gente como você contrata hoje.',
    chamada: 'Com o que você responder, o especialista já chega na implementação sabendo qual vaga é a sua e o que ela precisa resolver — em vez de gastar a call perguntando.',
    compra: 'Use o mesmo e-mail e WhatsApp da compra do ImpactMind RH, para a gente saber que é você.',
    livre: {
      titulo: 'Qual vaga você vai abrir primeiro, e o que essa pessoa precisa dar conta?',
      ajuda: 'Uma frase já ajuda. É por aqui que o especialista prepara a sua implementação.',
      placeholder: 'Ex.: estagiário de previdenciário para cuidar de protocolo e andamento'
    },
    obrigado: 'O acesso está no seu e-mail e, nas boas-vindas, o link para <strong>agendar a implementação com o especialista</strong>. Agende antes de abrir a vaga: a IA ajuda a escrever o anúncio na própria call.'
  }
};

/* O parâmetro da URL. Aceita variações de escrita porque o link vai ser
   colado à mão em e-mail, grupo e área de membros — um `pos-venda` ou um
   `rh` no lugar do slug não pode quebrar a pesquisa. Valor irreconhecível
   devolve null, e aí a página pergunta qual produto a pessoa comprou. */
const APELIDOS = {
  posvenda: 'posvenda', 'pos-venda': 'posvenda', pos: 'posvenda', pv: 'posvenda',
  impactrh: 'impactrh', 'impactmind-rh': 'impactrh', impactmind: 'impactrh', rh: 'impactrh'
};

export const produtoDaUrl = valor => {
  const v = String(valor ?? '').trim().toLowerCase();
  return PRODUTOS[APELIDOS[v]] || null;
};

/* ------------------------------------------------------------------
   As perguntas.
   ------------------------------------------------------------------ */
const daSessao = chave => PERGUNTAS_SESSAO.find(q => q.crit === chave || q.campo === chave);

/* As duas de abertura e a de intenção, por produto. Abrem pelo assunto do
   produto de propósito: "qual o faturamento do seu escritório" como
   primeira pergunta para quem acabou de pagar R$ 47 derruba resposta. */
const PROPRIAS = {
  posvenda: {
    situacao: {
      crit: null, campo: 'situacao',
      titulo: 'Como o seu cliente fica sabendo do andamento do processo hoje?',
      ajuda: null,
      opcoes: [
        { txt: 'Ele pergunta e alguém responde na hora', tipo: 'reativo' },
        { txt: 'A gente avisa quando lembra', tipo: 'improviso' },
        { txt: 'Existe uma rotina, mas cada um manda de um jeito', tipo: 'rotina' },
        { txt: 'Não avisamos nada até o processo terminar', tipo: 'nenhum' }
      ]
    },
    desafio: {
      crit: null, campo: 'desafio',
      titulo: 'Onde a falta de pós-venda mais dói hoje?',
      ajuda: 'Escolha o que mais pesa agora. É o que o Guilherme vai atacar primeiro no acompanhamento.',
      opcoes: [
        { txt: 'No meu celular pessoal: sou eu que respondo cliente, inclusive no fim de semana', tipo: 'celular' },
        { txt: 'Na inadimplência: cliente sem notícia segura a parcela', tipo: 'inadimplencia' },
        { txt: 'Na equipe: ninguém responde cliente sem me perguntar antes', tipo: 'equipe' },
        { txt: 'Na indicação: cliente sai satisfeito e não indica ninguém', tipo: 'indicacao' }
      ]
    },
    urgencia: {
      crit: 'urgencia',
      titulo: 'Quando você pretende colocar o kit para rodar?',
      ajuda: null,
      opcoes: [
        { txt: 'Na entrada do próximo cliente, ainda esta semana', pts: 25, tag: 'semana' },
        { txt: 'Ainda neste mês',                                  pts: 20, tag: 'mes' },
        { txt: 'Quando sobrar tempo para personalizar',            pts: 10, tag: 'quando_der' },
        { txt: 'Comprei para ter, ainda não sei quando vou usar',  pts: 5,  tag: 'sem_prazo' }
      ]
    }
  },
  impactrh: {
    situacao: {
      crit: null, campo: 'situacao',
      titulo: 'Como foi a última contratação do escritório?',
      ajuda: null,
      opcoes: [
        { txt: 'Por indicação de alguém de confiança', tipo: 'indicacao' },
        { txt: 'Li os currículos eu mesmo e entrevistei', tipo: 'sozinho' },
        { txt: 'Alguém da equipe filtrou e eu decidi na entrevista', tipo: 'equipe' },
        { txt: 'Ainda não contratei ninguém', tipo: 'nunca' }
      ]
    },
    desafio: {
      crit: null, campo: 'desafio',
      titulo: 'O que mais pesa para você na hora de contratar?',
      ajuda: 'Escolha o que mais dói agora. É o que o especialista vai resolver primeiro na sua implementação.',
      opcoes: [
        { txt: 'O tempo: parar tudo para ler currículo um por um', tipo: 'tempo' },
        { txt: 'O erro: já contratei quem não dava conta e descobri tarde', tipo: 'erro' },
        { txt: 'O critério: não sei o que avaliar além da conversa da entrevista', tipo: 'criterio' },
        { txt: 'O funil: só aparece candidato por indicação', tipo: 'candidatos' }
      ]
    },
    urgencia: {
      crit: 'urgencia',
      titulo: 'Quando você vai abrir a próxima vaga?',
      ajuda: null,
      opcoes: [
        { txt: 'A vaga já está aberta, ou abre ainda esta semana', pts: 25, tag: 'semana' },
        { txt: 'Ainda neste mês',                                  pts: 20, tag: 'mes' },
        { txt: 'Nos próximos 3 meses',                             pts: 10, tag: 'quando_der' },
        { txt: 'Ainda não tenho vaga prevista',                    pts: 5,  tag: 'sem_prazo' }
      ]
    }
  }
};

/* A ordem é a mesma nos dois produtos, e o painel conta pelo CRITÉRIO
   gravado em cada resposta — não pela posição. */
export function perguntas(produto) {
  const p = PROPRIAS[produto?.slug] || PROPRIAS.posvenda;
  return [
    p.situacao,
    p.desafio,
    daSessao('faturamento'),
    daSessao('pessoas'),
    daSessao('area'),
    daSessao('perfil'),
    daSessao('mentoria'),
    p.urgencia
  ];
}

const QUALIDADE_TXT = {
  Alta:  'Vai aplicar já e tem histórico de investir em acompanhamento. É o comprador de R$ 47 que cabe num degrau bem acima.',
  Média: 'Existe intenção de aplicar, mas o prazo ou o histórico ainda não sustentam convite direto.',
  Baixa: 'Comprou e ainda não sabe quando vai usar, sem histórico de acompanhamento. Conteúdo e implementação antes de qualquer oferta.'
};

export const textoQualidade = nivel => QUALIDADE_TXT[nivel];

function qualidade(pontos) {
  const q = (pontos.urgencia ?? 0) + (pontos.mentoria ?? 0);
  const nivel = q >= 40 ? 'Alta' : q >= 25 ? 'Média' : 'Baixa';
  return { nivel, valor: q, txt: QUALIDADE_TXT[nivel] };
}

export function analisar(pontos, tags, tipos, area, perfil, divergencia, produto) {
  const ad = ADERENCIA[area];
  const slug = produto?.slug;
  const pos = [], neg = [];

  if (pontos.faturamento >= 20) pos.push('Faturamento no topo da régua: o low ticket foi porta de entrada, não teto. Cabe convite para os degraus altos da escada.');
  if (pontos.pessoas >= 20) pos.push('Equipe montada: a dor de gestão é concreta e a estrutura absorve um programa inteiro.');
  if (tags.urgencia === 'semana') pos.push(slug === 'impactrh'
    ? 'Vaga aberta ou abrindo esta semana. Implementação agendada agora vale o dobro: ele decide com o produto na mão.'
    : 'Vai usar na entrada do próximo cliente, esta semana. Quem aplica rápido vira caso de uso e depoimento.');
  if (tags.urgencia === 'mes') pos.push('Pretende aplicar ainda neste mês: intenção declarada e dentro da janela do acompanhamento.');
  if (tags.mentoria === 'implementou') pos.push('Já participou de acompanhamento e implementou. Perfil executor, com referência de valor.');
  if (tags.mentoria === 'parcial') pos.push('Tem histórico de acompanhamento e implementou parte: já entende o formato.');
  if (perfil === 'empresario') pos.push('Perfil empresário: entende delegação e a lógica de investir no negócio.');
  if (perfil === 'digital') pos.push('Perfil digital, que é o coração histórico da base: consciência de gestão vinda da escala.');
  if (area === 'massa') pos.push('Atua em ações em massa, onde o método tem o melhor histórico de resultado.');

  /* Sinais próprios de cada produto. O mesmo dado lido do jeito certo:
     quem trabalha sozinho é um problema no Pós-Venda (não há equipe para
     executar a rotina) e é uma janela no ImpactMind RH — é a PRIMEIRA
     contratação do escritório, o momento mais aberto que existe. */
  if (slug === 'posvenda') {
    if (tipos.situacao === 'nenhum' || tipos.situacao === 'improviso') pos.push('Hoje não existe rotina nenhuma de aviso ao cliente: o ganho do kit aparece na primeira semana e é fácil de medir.');
    if (tipos.situacao === 'rotina') pos.push('Já tem uma rotina, ainda que cada um mande de um jeito. Aqui o kit é padronização, e o passo seguinte natural é gestão de equipe.');
    if (tipos.desafio === 'equipe') pos.push('A dor declarada é a equipe não responder sem ele. É exatamente a promessa dos degraus de gestão.');
    if (pontos.pessoas === 5) neg.push('Trabalha sozinho: não há equipe para executar a rotina do kit, e boa parte do conteúdo de gestão ainda não se aplica.');
  }

  if (slug === 'impactrh') {
    if (tipos.situacao === 'nunca') pos.push('Nunca contratou ninguém: é a primeira contratação do escritório, e ela vai acontecer com o produto na mão. Acompanhar de perto.');
    if (pontos.pessoas === 5) pos.push('Trabalha sozinho e comprou um produto de contratação: está montando o time do zero. Janela rara de abertura.');
    if (tipos.desafio === 'erro') pos.push('Já contratou errado e sentiu o custo. A dor tem valor calculado — é a conversa mais fácil da escada.');
    if (tipos.situacao === 'indicacao') neg.push('Contrata por indicação. A objeção vai ser "sempre deu certo assim": mostrar o custo da contratação errada antes de falar de processo.');
  }

  if (tags.urgencia === 'sem_prazo') neg.push('Comprou e não sabe quando vai usar. Risco de virar PDF parado: tratar como implementação, não como oportunidade comercial.');
  if (tags.urgencia === 'quando_der') neg.push('Aplicação condicionada a "quando sobrar tempo". Sem um gatilho de data, não sai do lugar.');
  if (tags.mentoria === 'nao_aplicou') neg.push('Já participou de um programa e não conseguiu aplicar. Validar comprometimento antes de avançar na escada.');
  if (tags.mentoria === 'nunca') neg.push('Nunca participou de acompanhamento. Este produto é a primeira referência de valor dele com a marca: entregar bem vale mais que ofertar rápido.');
  if (pontos.faturamento === 5) neg.push('Faturamento até R$ 10 mil. O ticket de R$ 47 provavelmente é o teto por agora: nutrir com conteúdo em vez de convidar para degrau pago.');
  if (ad && ad.ajuste < 0) neg.push(ad.nota);
  if (perfil === 'tradicional') neg.push('Perfil tradicional, com resistência a digital e tecnologia. Exige mais construção de consciência.');
  if (divergencia) neg.push('Faturamento e estrutura apontam degraus distantes na escada. Confirme na conversa qual dos dois reflete a realidade.');

  return { pos, neg };
}

/* `respostas` é um array na ordem de perguntas(produto), cada item é a
   opção escolhida. */
export function calcular(respostas, produto) {
  const PERGUNTAS = perguntas(produto);
  const pontos = {}, tags = {}, tipos = {}, campos = {};
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
    if (q.campo) { campos[q.campo] = r.txt; tipos[q.campo] = r.tipo; }
  });

  const teto = Object.values(CRITERIOS).reduce((a, c) => a + c.max * c.peso, 0);
  const ponderado = Object.keys(CRITERIOS)
    .reduce((a, k) => a + (pontos[k] ?? 0) * CRITERIOS[k].peso, 0);
  const base = Math.round((ponderado / teto) * 100);
  const ad = ADERENCIA[area];
  const total = Math.max(0, base + (ad?.ajuste ?? 0));
  const classe = letra(total);
  const divergencia = Math.abs(degrauFat - degrauPes) >= 2;
  const { pos, neg } = analisar(pontos, tags, tipos, area, perfil, divergencia, produto);
  const urg = PERGUNTAS.find(q => q.crit === 'urgencia');
  const plano = urg.opcoes.find(o => o.tag === tags.urgencia);

  return {
    produto: produto.slug, produtoNome: produto.nome,
    pontos, tags, area, perfil, base, ajuste: ad?.ajuste ?? 0, total, classe,
    sla: CLASSES[classe].sla,
    degrau: ESCADA[degrauFat], degrauEstrutura: ESCADA[degrauPes], divergencia,
    qualidade: qualidade(pontos), pos, neg,
    situacao: campos.situacao ?? null,
    desafio: campos.desafio ?? null,
    plano: plano?.txt ?? null,
    respostas: respostas.map((r, i) => ({
      pergunta: PERGUNTAS[i].titulo,
      criterio: PERGUNTAS[i].crit || PERGUNTAS[i].campo,
      resposta: r.txt,
      pts: r.pts ?? null
    }))
  };
}
