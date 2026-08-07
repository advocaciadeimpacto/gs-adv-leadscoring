/* Painel interno: respostas do quiz, agenda dos closers e critérios do modelo. */

import { db } from './db.js';
import { fmtHora, fmtDataCurta, iso } from './agenda-core.js';
import { htmlResultado, CRITERIOS, PERGUNTAS, ADERENCIA, CLASSES, PERFIS, ESCADA } from './scoring.js';
import { rotuloOrigem } from './origem.js';
import { slug, montarURL, statusDoLink, temMacro, PRESETS, BASE } from './links.js';

const palco = document.querySelector('#palco');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const CORES = { A: 'var(--a)', B: 'var(--b)', C: 'var(--c)', D: 'var(--d)' };
const fmtTel = t => {
  const n = String(t || '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return t || '';
};
const dataHora = s => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

let aba = 'respostas';
let filtroClasse = 'todas';
let filtroCloser = 'todos';
let abertoId = null;

document.querySelectorAll('.aba').forEach(b => {
  b.onclick = () => {
    aba = b.dataset.aba;
    document.querySelectorAll('.aba').forEach(x => x.classList.toggle('on', x === b));
    abertoId = null;
    render();
  };
});

async function render() {
  palco.innerHTML = '<p class="carregando">Carregando...</p>';
  if (aba === 'respostas') return telaRespostas();
  if (aba === 'links') return telaLinks();
  if (aba === 'agenda') return telaAgenda();
  return telaCriterios();
}

/* ---------- respostas ---------- */

async function telaRespostas() {
  const { data: todas } = await db.listarRespostas();

  if (abertoId) {
    const r = todas.find(x => x.id === abertoId);
    if (r) return telaDetalhe(r);
  }

  const lista = filtroClasse === 'todas' ? todas
    : filtroClasse.startsWith('src:') ? todas.filter(r => (r.origem?.utm_source || 'direto') === filtroClasse.slice(4))
    : todas.filter(r => r.classe === filtroClasse);
  const comContato = todas.filter(r => r.lead).length;
  const contagem = c => todas.filter(r => r.classe === c).length;

  // canais presentes na base, para virar filtro sem precisar cadastrar nada
  const canais = [...new Set(todas.map(r => r.origem?.utm_source || 'direto'))].sort();

  palco.innerHTML = `
    <div class="step">
      <span class="eyebrow">Respostas do quiz</span>
      <h1 class="q-title">Quem preencheu</h1>
      <p class="q-help">Toda resposta é registrada, mesmo sem contato. Quem respondeu e não agendou aparece sem dados: é a medida de abandono do funil.</p>

      <section class="carga">
        <div class="carga-item"><strong>Respostas</strong><span class="carga-num">${todas.length}</span><span class="carga-lbl">preenchimentos no total</span></div>
        <div class="carga-item"><strong>Com contato</strong><span class="carga-num">${comContato}</span><span class="carga-lbl">${todas.length ? Math.round(comContato / todas.length * 100) : 0}% seguiram para o agendamento</span></div>
        <div class="carga-item"><strong>Classe A e B</strong><span class="carga-num">${contagem('A') + contagem('B')}</span><span class="carga-lbl">leads de maior porte</span></div>
      </section>

      <div class="filtros">
        <button class="chip${filtroClasse === 'todas' ? ' on' : ''}" data-c="todas">Todas</button>
        ${['A','B','C','D'].map(c => `<button class="chip${filtroClasse === c ? ' on' : ''}" data-c="${c}">Classe ${c} (${contagem(c)})</button>`).join('')}
      </div>
      ${canais.length > 1 ? `<div class="filtros filtros-canal">
        ${canais.map(s => {
          const n = todas.filter(r => (r.origem?.utm_source || 'direto') === s).length;
          return `<button class="chip${filtroClasse === 'src:' + s ? ' on' : ''}" data-c="src:${esc(s)}">${esc(s)} (${n})</button>`;
        }).join('')}
      </div>` : ''}

      ${lista.length ? `<div class="lista">${lista.map(linhaResposta).join('')}</div>`
        : '<p class="empty">Nenhuma resposta ainda. Preencha o quiz para ver aqui.</p>'}

      <div class="res-foot">
        <a class="btn btn-ghost chanfro" href="index.html">Abrir o quiz</a>
        <button class="btn-link perigo" id="limpar">Apagar dados de teste</button>
      </div>
    </div>`;

  palco.querySelectorAll('.chip').forEach(b => {
    b.onclick = () => { filtroClasse = b.dataset.c; render(); };
  });
  palco.querySelectorAll('[data-abrir]').forEach(b => {
    b.onclick = () => { abertoId = b.dataset.abrir; render(); };
  });
  document.querySelector('#limpar').onclick = async () => {
    if (!confirm('Apagar respostas, agendamentos e webhooks deste navegador?')) return;
    await db.limparTudo();
    render();
  };
}

function linhaResposta(r) {
  return `
    <div class="linha">
      <div class="linha-quando"><strong>${dataHora(r.criado_em).split(',')[0]}</strong>
        <span>${dataHora(r.criado_em).split(', ')[1] || ''}</span></div>
      <div class="linha-lead">
        <strong>${r.lead ? esc(r.lead.nome) : 'Sem contato'}</strong>
        ${r.lead?.escritorio ? `<span class="meta">${esc(r.lead.escritorio)}</span>` : ''}
        <span class="meta">${r.lead ? `${esc(fmtTel(r.lead.whatsapp))} · ${esc(r.lead.email)}`
                                    : 'respondeu e não agendou'}</span>
      </div>
      <div class="linha-score">
        <span class="mini-badge" style="background:${CORES[r.classe]}">${esc(r.classe)}</span>
        <span class="meta">${r.score} pts · ${esc(r.degrau)}</span>
      </div>
      <div class="linha-closer">
        <span class="meta">origem</span> <strong>${esc(rotuloOrigem(r.origem))}</strong>
      </div>
      <button class="btn-link" data-abrir="${r.id}">abrir</button>
    </div>`;
}

function telaDetalhe(r) {
  // reconstrói a visão do comercial a partir do que foi gravado
  const res = {
    pontos: r.pontos, area: r.area, perfil: r.perfil,
    base: r.score_base, ajuste: r.ajuste, aderencia: ADERENCIA[r.area],
    total: r.score, classe: r.classe, degrau: r.degrau, degrauEstrutura: r.degrau_estrutura,
    divergencia: ESCADA.indexOf(r.degrau) - ESCADA.indexOf(r.degrau_estrutura) <= -2 ||
                 ESCADA.indexOf(r.degrau) - ESCADA.indexOf(r.degrau_estrutura) >= 2,
    qualidade: { nivel: r.qualidade, valor: (r.pontos.urgencia + r.pontos.mentoria), txt: textoQualidade(r.qualidade) },
    pos: r.pos || [], neg: r.neg || [], respostas: r.detalhe || []
  };
  Object.assign(res, recalcularLeituras(r, res));

  palco.innerHTML = `
    <div class="step">
      <button class="btn-back" id="voltar">← Todas as respostas</button>
      ${r.lead ? `<div class="ficha-lead chanfro">
          <div><span class="eyebrow">Contato</span><strong>${esc(r.lead.nome)}</strong>
            ${r.lead.escritorio ? `<span class="meta">${esc(r.lead.escritorio)}</span>` : ''}</div>
          <div class="ficha-cols">
            <span>${esc(fmtTel(r.lead.whatsapp))}</span>
            <span>${esc(r.lead.email)}</span>
            <span class="meta">respondeu em ${dataHora(r.criado_em)}</span>
          </div>
        </div>`
        : `<p class="marcado chanfro">Respondeu em ${dataHora(r.criado_em)} e <strong>não seguiu para o agendamento</strong>, então não há contato.</p>`}
      ${htmlResultado(res)}
      <section class="axes">
        <h2>Origem</h2>
        <dl class="dispatch">
          ${r.origem ? Object.entries(r.origem)
              .filter(([, v]) => v)
              .map(([k, v]) => `<div class="d-row"><dt>${esc(k.replace('utm_', ''))}</dt><dd>${esc(v)}</dd></div>`).join('')
            : '<div class="d-row"><dt>origem</dt><dd class="meta">não identificada (resposta anterior ao rastreio)</dd></div>'}
        </dl>
      </section>
    </div>`;

  document.querySelector('#voltar').onclick = () => { abertoId = null; render(); };
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

const textoQualidade = n =>
  n === 'Alta' ? 'Tem pressa e histórico de investir em acompanhamento. Ataque agora, mesmo que o porte seja menor.'
: n === 'Média' ? 'Existe intenção, mas o prazo ou o histórico ainda não sustentam pressa total.'
: 'Sem prazo claro nem histórico de acompanhamento. Amadurecer antes de investir hora de closer.';

/* As leituras de "a favor" e "atenção" não são gravadas: derivam das respostas,
   então são recalculadas na abertura para nunca ficarem desatualizadas em
   relação ao modelo vigente. */
function recalcularLeituras(r, res) {
  const detalhe = r.detalhe || [];
  const escolhida = crit => detalhe.find(d => d.criterio === crit)?.resposta || '';
  const tagDe = crit => {
    const q = PERGUNTAS.find(p => p.crit === crit);
    return q?.opcoes.find(o => o.txt === escolhida(crit))?.tag;
  };
  const tags = { urgencia: tagDe('urgencia'), mentoria: tagDe('mentoria') };
  const p = r.pontos, ad = ADERENCIA[r.area];
  const pos = [], neg = [];

  if (p.faturamento >= 20) pos.push('Faturamento no topo da régua: comporta os produtos mais altos da escada.');
  if (p.pessoas >= 20) pos.push('Equipe montada: a dor de gestão é concreta e a estrutura absorve o programa.');
  if (tags.urgencia === 'agora') pos.push('Quer resolver ainda este mês. Existe janela real de fechamento.');
  if (tags.urgencia === 'trimestre') pos.push('Prazo de até 3 meses: urgência declarada e compatível com o ciclo.');
  if (tags.mentoria === 'implementou') pos.push('Já participou de acompanhamento e implementou. Perfil executor, com referência de valor.');
  if (tags.mentoria === 'parcial') pos.push('Tem histórico de acompanhamento e implementou parte: já entende o formato.');
  if (r.perfil === 'empresario') pos.push('Perfil empresário: entende delegação e a lógica de investir no negócio.');
  if (r.perfil === 'digital') pos.push('Perfil digital, que é o coração histórico da base: consciência de gestão vinda da escala.');
  if (r.area === 'massa') pos.push('Atua em ações em massa, onde o método tem o melhor histórico de resultado.');

  if (tags.urgencia === 'sem_prazo') neg.push('Sem prazo definido. Não force fechamento: use a call para dimensionar o custo de continuar como está.');
  if (tags.urgencia === 'ano') neg.push('Prazo de até 12 meses. A intenção existe, mas a pressa não. Ciclo longo.');
  if (tags.mentoria === 'nao_aplicou') neg.push('Já participou de um programa e não conseguiu aplicar. Validar comprometimento antes de avançar.');
  if (tags.mentoria === 'nunca') neg.push('Nunca participou de acompanhamento. Sem referência de valor, a objeção costuma ser "será que funciona".');
  if (p.faturamento === 5) neg.push('Faturamento até R$ 10 mil. Oferecer os degraus altos aqui gera objeção de preço quase certa.');
  if (p.pessoas === 5) neg.push('Trabalha sozinho. Boa parte do conteúdo de gestão de equipe não se aplica ainda.');
  if (ad.ajuste < 0) neg.push(ad.nota);
  if (r.perfil === 'tradicional') neg.push('Perfil tradicional, com resistência a digital e tecnologia. Exige mais construção de consciência.');
  if (res.divergencia) neg.push('Faturamento e estrutura apontam degraus distantes na escada. Confirme na call qual dos dois reflete a realidade.');

  return { pos, neg };
}

/* ---------- links e utms ---------- */

let rascunho = { source: '', medium: '', campaign: '', content: '', term: '', rotulo: '' };
let filtroStatus = 'todos';

async function telaLinks() {
  const [{ data: links }, { data: respostas }] = await Promise.all([
    db.listarLinks(), db.listarRespostas()
  ]);

  const comStatus = links.map(l => ({ ...l, st: statusDoLink(l, respostas) }));
  const ativos = comStatus.filter(l => !l.arquivado);
  const conta = k => ativos.filter(l => l.st.chave === k).length;
  const visiveis = filtroStatus === 'todos' ? ativos
    : filtroStatus === 'arquivados' ? comStatus.filter(l => l.arquivado)
    : ativos.filter(l => l.st.chave === filtroStatus);

  // leads que chegaram com UTM sem link correspondente cadastrado
  const semLink = respostas.filter(r => r.origem?.utm_source &&
    !links.some(l => slug(l.source) === slug(r.origem.utm_source)));

  palco.innerHTML = `
    <div class="step">
      <span class="eyebrow">Links e UTMs</span>
      <h1 class="q-title">Gerador de links</h1>
      <p class="q-help">Todo link criado aqui sai padronizado: minúsculo, sem acento e sem espaço. É o que impede o mesmo canal virar três linhas diferentes no relatório.</p>

      <div class="presets">
        ${PRESETS.map((p, n) => `<button class="chip" data-preset="${n}">${esc(p.nome)}</button>`).join('')}
      </div>

      <form class="form-link" id="formLink">
        <div class="campos">
          <label>Rótulo <span>opcional</span>
            <input id="fRotulo" placeholder="Bio de agosto" value="${esc(rascunho.rotulo)}"></label>
          <label>utm_source <span>o canal</span>
            <input id="fSource" placeholder="instagram-bio" value="${esc(rascunho.source)}" required></label>
          <label>utm_medium <span>tipo de tráfego</span>
            <input id="fMedium" placeholder="organico" value="${esc(rascunho.medium)}" required></label>
          <label>utm_campaign <span>campanha</span>
            <input id="fCampaign" placeholder="sessao-estrategica" value="${esc(rascunho.campaign)}" required></label>
          <label>utm_content <span>criativo, opcional</span>
            <input id="fContent" placeholder="stories" value="${esc(rascunho.content)}"></label>
          <label>utm_term <span>público, opcional</span>
            <input id="fTerm" placeholder="lookalike-1" value="${esc(rascunho.term)}"></label>
        </div>

        <div class="previa">
          <span class="eyebrow">Link gerado</span>
          <code id="previa">${esc(BASE)}</code>
          <p class="dica" id="dica" hidden></p>
        </div>

        <div class="acoes-link">
          <button class="btn chanfro" type="submit">Salvar link</button>
          <button class="btn btn-ghost chanfro" type="button" id="copiarPrevia">Copiar</button>
          <span class="erro" id="erroLink" hidden></span>
        </div>
      </form>

      <h2 class="sec">Links criados</h2>
      ${links.length ? `
        <div class="filtros">
          <button class="chip${filtroStatus === 'todos' ? ' on' : ''}" data-s="todos">Todos (${ativos.length})</button>
          <button class="chip${filtroStatus === 'ativo' ? ' on' : ''}" data-s="ativo">Ativos (${conta('ativo')})</button>
          <button class="chip${filtroStatus === 'parado' ? ' on' : ''}" data-s="parado">Parados (${conta('parado')})</button>
          <button class="chip${filtroStatus === 'sem-uso' ? ' on' : ''}" data-s="sem-uso">Nunca usados (${conta('sem-uso')})</button>
          ${comStatus.some(l => l.arquivado) ? `<button class="chip${filtroStatus === 'arquivados' ? ' on' : ''}" data-s="arquivados">Arquivados</button>` : ''}
        </div>
        <div class="lista">${visiveis.map(linhaLink).join('')}</div>`
        : '<p class="empty">Nenhum link criado ainda. Use um atalho acima para começar.</p>'}

      ${semLink.length ? `<div class="note">
        <p><strong>${semLink.length} ${semLink.length === 1 ? 'lead chegou' : 'leads chegaram'} por uma origem sem link cadastrado aqui.</strong>
        Fontes: ${[...new Set(semLink.map(r => r.origem.utm_source))].map(s => `<code>${esc(s)}</code>`).join(', ')}.
        Isso acontece quando alguém monta a UTM à mão. Vale cadastrar o link para acompanhar junto com os outros.</p>
      </div>` : ''}
    </div>`;

  const campos = { rotulo: '#fRotulo', source: '#fSource', medium: '#fMedium',
                   campaign: '#fCampaign', content: '#fContent', term: '#fTerm' };

  const lerForm = () => Object.fromEntries(
    Object.entries(campos).map(([k, sel]) => [k, document.querySelector(sel).value]));

  const atualizarPrevia = () => {
    const v = lerForm();
    rascunho = v;
    const limpo = {
      source: slug(v.source), medium: slug(v.medium), campaign: slug(v.campaign),
      content: slug(v.content), term: slug(v.term)
    };
    document.querySelector('#previa').textContent = montarURL(limpo);
    const dica = document.querySelector('#dica');
    if (temMacro(limpo)) {
      dica.hidden = false;
      dica.innerHTML = 'Link com macro: no Meta, cole só a parte depois do <code>?</code> no campo <strong>Parâmetros de URL</strong> do anúncio. A plataforma preenche os valores sozinha.';
    } else dica.hidden = true;
  };

  Object.values(campos).forEach(sel => { document.querySelector(sel).oninput = atualizarPrevia; });
  atualizarPrevia();

  palco.querySelectorAll('[data-preset]').forEach(b => {
    b.onclick = () => {
      const p = PRESETS[b.dataset.preset];
      document.querySelector('#fRotulo').value = p.nome;
      document.querySelector('#fSource').value = p.source || '';
      document.querySelector('#fMedium').value = p.medium || '';
      document.querySelector('#fCampaign').value = p.campaign || '';
      document.querySelector('#fContent').value = p.content || '';
      document.querySelector('#fTerm').value = p.term || '';
      atualizarPrevia();
    };
  });

  document.querySelector('#copiarPrevia').onclick = () =>
    copiar(document.querySelector('#previa').textContent, document.querySelector('#copiarPrevia'));

  palco.querySelectorAll('[data-s]').forEach(b => {
    b.onclick = () => { filtroStatus = b.dataset.s; render(); };
  });
  palco.querySelectorAll('[data-copiar]').forEach(b => {
    b.onclick = () => copiar(b.dataset.copiar, b);
  });
  palco.querySelectorAll('[data-arquivar]').forEach(b => {
    b.onclick = async () => { await db.arquivarLink(b.dataset.arquivar, b.dataset.valor === '1'); render(); };
  });
  palco.querySelectorAll('[data-excluir]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Excluir este link da lista? Os leads que já chegaram por ele continuam registrados.')) return;
      await db.removerLink(b.dataset.excluir); render();
    };
  });

  document.querySelector('#formLink').onsubmit = async e => {
    e.preventDefault();
    const v = lerForm();
    const erro = document.querySelector('#erroLink');
    const dados = {
      rotulo: v.rotulo.trim() || slug(v.source), source: slug(v.source), medium: slug(v.medium),
      campaign: slug(v.campaign), content: slug(v.content), term: slug(v.term)
    };
    if (!dados.source || !dados.medium || !dados.campaign) {
      erro.textContent = 'Preencha source, medium e campaign.'; erro.hidden = false; return;
    }
    dados.url = montarURL(dados);
    const { error } = await db.criarLink(dados);
    if (error) { erro.textContent = error.message; erro.hidden = false; return; }
    erro.hidden = true;
    rascunho = { source: '', medium: '', campaign: '', content: '', term: '', rotulo: '' };
    render();
  };
}

function linhaLink(l) {
  const partes = [l.source, l.medium, l.campaign, l.content, l.term].filter(Boolean).join(' · ');
  return `
    <div class="linha linha-link">
      <div class="linha-lead">
        <strong>${esc(l.rotulo)} <span class="tag-status ${l.st.chave}">${l.st.rotulo}</span></strong>
        <span class="meta">${esc(partes)}</span>
        <code class="url-link">${esc(l.url)}</code>
      </div>
      <div class="linha-score col-uso">
        <strong>${l.st.total}</strong>
        <span class="meta">${l.st.total === 1 ? 'lead' : 'leads'}</span>
      </div>
      <div class="linha-closer nota-uso"><span class="meta">${esc(l.st.nota)}</span></div>
      <div class="acoes-linha">
        <button class="btn-link" data-copiar="${esc(l.url)}">copiar</button>
        <button class="btn-link" data-arquivar="${l.id}" data-valor="${l.arquivado ? '0' : '1'}">${l.arquivado ? 'reativar' : 'arquivar'}</button>
        ${l.st.total === 0 ? `<button class="btn-link perigo" data-excluir="${l.id}">excluir</button>` : ''}
      </div>
    </div>`;
}

async function copiar(texto, botao) {
  const original = botao.textContent;
  try {
    await navigator.clipboard.writeText(texto);
    botao.textContent = 'copiado';
  } catch {
    botao.textContent = 'copie manualmente';
  }
  setTimeout(() => { botao.textContent = original; }, 1600);
}

/* ---------- agenda ---------- */

async function telaAgenda() {
  const [{ data: closers }, { data: ags }, { data: blqs }, { data: hooks }] = await Promise.all([
    db.listarClosers(), db.listarAgendamentos(), db.listarBloqueios(), db.listarWebhooks()
  ]);

  const nomeDe = id => closers.find(c => c.id === id)?.nome || id;
  const ativos = ags.filter(a => a.status !== 'cancelado');
  const futuros = ativos.filter(a => new Date(a.inicio) >= new Date(Date.now() - 36e5))
                        .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));
  const visiveis = filtroCloser === 'todos' ? futuros : futuros.filter(a => a.closer_id === filtroCloser);

  palco.innerHTML = `
    <div class="step">
      <span class="eyebrow">Agenda do time</span>
      <h1 class="q-title">Sessões marcadas</h1>
      <p class="q-help">A atribuição é sorteada entre os closers livres no horário escolhido. O lead não escolhe e não vê quem foi.</p>

      <section class="carga">
        ${closers.map(c => {
          const prox = futuros.filter(a => a.closer_id === c.id).length;
          const tot = ativos.filter(a => a.closer_id === c.id).length;
          return `<div class="carga-item"><strong>${esc(c.nome)}</strong>
            <span class="carga-num">${prox}</span>
            <span class="carga-lbl">${prox === 1 ? 'sessão à frente' : 'sessões à frente'} · ${tot} no total</span></div>`;
        }).join('')}
      </section>

      <div class="filtros">
        <button class="chip${filtroCloser === 'todos' ? ' on' : ''}" data-f="todos">Todos</button>
        ${closers.map(c => `<button class="chip${filtroCloser === c.id ? ' on' : ''}" data-f="${c.id}">${esc(c.nome)}</button>`).join('')}
      </div>

      <h2 class="sec">Próximas sessões</h2>
      ${visiveis.length ? `<div class="lista">${visiveis.map(a => linhaAgendamento(a, nomeDe)).join('')}</div>`
                        : '<p class="empty">Nenhuma sessão agendada.</p>'}

      <h2 class="sec">Bloqueios de agenda</h2>
      <p class="q-help">Férias, folga ou compromisso fixo. Horário bloqueado some da página pública para aquele closer.</p>
      <form class="form-bloqueio" id="formBloqueio">
        <select id="bCloser" aria-label="Closer">${closers.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select>
        <input type="date" id="bData" required aria-label="Data">
        <input type="time" id="bIni" value="09:00" step="1800" required aria-label="Início">
        <input type="time" id="bFim" value="12:00" step="1800" required aria-label="Fim">
        <input type="text" id="bMotivo" placeholder="Motivo (opcional)" aria-label="Motivo">
        <button class="btn chanfro" type="submit">Bloquear</button>
      </form>
      ${blqs.length ? `<div class="lista">${blqs.map(b => `
        <div class="linha">
          <div><strong>${esc(nomeDe(b.closer_id))}</strong>
            <span class="meta">${fmtDataCurta(new Date(b.inicio))} · ${fmtHora(new Date(b.inicio))} às ${fmtHora(new Date(b.fim))}${b.motivo ? ' · ' + esc(b.motivo) : ''}</span></div>
          <button class="btn-link" data-remove="${b.id}">remover</button>
        </div>`).join('')}</div>` : ''}

      <h2 class="sec">Webhooks disparados</h2>
      <p class="q-help">No mockup o payload fica registrado aqui. Em produção este mesmo JSON vai por POST para o endpoint que receber os agendamentos.</p>
      ${hooks.length ? `<div class="lista">${hooks.slice(0, 8).map(h => `
        <details class="hook">
          <summary><code>${esc(h.evento)}</code> <span class="meta">${new Date(h.criado_em).toLocaleString('pt-BR')}</span></summary>
          <pre>${esc(JSON.stringify(h.payload, null, 2))}</pre>
        </details>`).join('')}</div>` : '<p class="empty">Nenhum webhook ainda.</p>'}

      <div class="res-foot">
        <a class="btn btn-ghost chanfro" href="agendar.html">Abrir página de agendamento</a>
      </div>
    </div>`;

  palco.querySelectorAll('.chip').forEach(b => { b.onclick = () => { filtroCloser = b.dataset.f; render(); }; });
  palco.querySelectorAll('[data-cancelar]').forEach(b => {
    b.onclick = async () => {
      if (!confirm('Cancelar esta sessão? O horário volta a ficar livre.')) return;
      await db.cancelarAgendamento(b.dataset.cancelar); render();
    };
  });
  palco.querySelectorAll('[data-remove]').forEach(b => {
    b.onclick = async () => { await db.removerBloqueio(b.dataset.remove); render(); };
  });
  document.querySelector('#formBloqueio').onsubmit = async e => {
    e.preventDefault();
    const dia = document.querySelector('#bData').value;
    if (!dia) return;
    const ini = new Date(`${dia}T${document.querySelector('#bIni').value}`);
    const fim = new Date(`${dia}T${document.querySelector('#bFim').value}`);
    if (fim <= ini) { alert('O fim precisa ser depois do início.'); return; }
    await db.criarBloqueio({
      closer_id: document.querySelector('#bCloser').value,
      inicio: iso(ini), fim: iso(fim),
      motivo: document.querySelector('#bMotivo').value.trim() || null
    });
    render();
  };
}

function linhaAgendamento(a, nomeDe) {
  const d = new Date(a.inicio);
  return `
    <div class="linha">
      <div class="linha-quando"><strong>${fmtDataCurta(d)}</strong><span>${fmtHora(d)}</span></div>
      <div class="linha-lead">
        <strong>${esc(a.lead_nome)}</strong>
        ${a.lead_escritorio ? `<span class="meta">${esc(a.lead_escritorio)}</span>` : ''}
        <span class="meta">${esc(fmtTel(a.lead_whatsapp))} · ${esc(a.lead_email)}</span>
      </div>
      <div class="linha-score">
        ${a.classe ? `<span class="mini-badge" style="background:${CORES[a.classe]}">${esc(a.classe)}</span>
                      <span class="meta">${a.score} pts</span>` : '<span class="meta">sem scoring</span>'}
      </div>
      <div class="linha-closer"><span class="meta">com</span> <strong>${esc(nomeDe(a.closer_id))}</strong></div>
      <button class="btn-link perigo" data-cancelar="${a.id}">cancelar</button>
    </div>`;
}

/* ---------- critérios ---------- */

function tabela(crit) {
  const q = PERGUNTAS.find(p => p.crit === crit);
  const temDegrau = q.opcoes.some(o => o.degrau !== undefined);
  return `<div class="tbl-scroll"><table${temDegrau ? '' : ' class="t2"'}>
    <thead><tr><th>${CRITERIOS[crit].nome}</th><th>Pts</th>${temDegrau ? '<th>Degrau</th>' : ''}</tr></thead>
    <tbody>${q.opcoes.slice().sort((a, b) => b.pts - a.pts).map(o =>
      `<tr><td>${esc(o.txt)}</td><td class="pts">${o.pts}</td>${temDegrau ? `<td>${esc(ESCADA[o.degrau])}</td>` : ''}</tr>`
    ).join('')}</tbody></table></div>`;
}

function telaCriterios() {
  palco.innerHTML = `
    <div class="step">
      <span class="eyebrow">Modelo v3</span>
      <h1 class="q-title">Critérios de pontuação</h1>
      <p class="q-help">Quatro critérios com peso igual, 25 pontos cada. Classe A a partir de 85.</p>

      ${tabela('faturamento')}
      ${tabela('pessoas')}
      <div class="duas-colunas">${tabela('urgencia')}${tabela('mentoria')}</div>

      <h2 class="sec">Ajuste por área</h2>
      <p class="q-help">Não soma nos 100. Aplica um ajuste depois, com a conta aberta no resultado.</p>
      <div class="tbl-scroll"><table>
        <thead><tr><th>Grupo</th><th>Ajuste</th><th>Áreas</th></tr></thead>
        <tbody>
          <tr><td>Massa</td><td class="pts">0</td><td>Previdenciário, bancário, trabalhista, consumidor, digital, marcas</td></tr>
          <tr><td>Híbrido</td><td class="pts">0</td><td>Saúde, tributário</td></tr>
          <tr><td>Artesanal</td><td class="pts">-5</td><td>Família, sucessões, empresarial</td></tr>
          <tr><td>Criminal</td><td class="pts">-15</td><td>Grau artesanal mais intenso, o que o método atende pior</td></tr>
        </tbody>
      </table></div>

      <h2 class="sec">Classes</h2>
      <div class="tbl-scroll"><table>
        <thead><tr><th>Classe</th><th>Faixa</th><th>Prioridade</th></tr></thead>
        <tbody>${['A','B','C','D'].map((c, n) => {
          const faixa = c === 'A' ? '85-100' : c === 'B' ? '65-84' : c === 'C' ? '45-64' : '0-44';
          return `<tr><td><span class="mini-badge" style="background:${CORES[c]}">${c}</span></td>
                      <td class="pts">${faixa}</td><td>${CLASSES[c].sla}</td></tr>`;
        }).join('')}</tbody>
      </table></div>

      <h2 class="sec">Tipo de advogado</h2>
      <div class="tbl-scroll"><table>
        <thead><tr><th>Perfil</th><th>Como conduzir</th></tr></thead>
        <tbody>${Object.values(PERFIS).map(p =>
          `<tr><td>${esc(p.rotulo)}</td><td>${esc(p.abordagem)}</td></tr>`).join('')}</tbody>
      </table></div>

      <div class="note">
        <p><strong>A classe mede porte, não urgência.</strong> Um escritório de R$ 25 mil com 2 pessoas, pressa máxima e histórico de mentoria trava em 70 pontos: é o cliente ideal da GD e nunca chega a classe A. Por isso o resultado mostra também a <strong>linha de qualidade</strong>, que soma urgência e histórico até 50 e diz se vale atacar agora.</p>
        <p><strong>Falta calibrar.</strong> Nenhum peso foi validado contra fechamento real. Isso só acontece registrando <strong>compareceu</strong>, <strong>fechou</strong> e <strong>motivo da perda</strong> em cada lead desta lista.</p>
      </div>
    </div>`;
}

render();
