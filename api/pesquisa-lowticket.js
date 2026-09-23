/* Recebe a pesquisa de quem comprou os produtos low ticket
   (pesquisa-lowticket.html, Pós-Venda e ImpactMind RH).
   ------------------------------------------------------------------
   Faz duas coisas, nesta ordem:
     1. POST no webhook do n8n, com a mensagem do WhatsApp já montada
        aqui — o n8n só entrega;
     2. INSERT em public.pesquisa_lowticket, no Supabase GERENCIADO
        (vmgyqhfesneannfqrvzg), que é onde moram as tabelas de pesquisa.
        A chave é a publicável: a tabela só aceita INSERT (RLS + grant),
        então a chave não lê nem altera nada.

   Se o insert falhar, o webhook sai mesmo assim e vice-versa; quem
   respondeu só recebe erro se os dois falharem.

   `produto` é o que separa os dois produtos no mesmo formulário. É
   validado aqui contra a lista fechada porque a coluna tem CHECK: um
   link com o parâmetro errado vira 400 em vez de virar linha órfã.

   A nota e a leitura vêm calculadas do navegador (scoring-lowticket.js).
   Recalcular aqui exigiria duplicar o modelo em CommonJS; para uma
   pesquisa interna, o risco de alguém forjar a própria nota não
   compensa manter duas cópias das regras.

   Variável opcional: PESQUISA_LOWTICKET_WEBHOOK_URL troca o destino.
   CommonJS de propósito: o projeto não tem package.json.
   ------------------------------------------------------------------ */

const SUPABASE_URL = 'https://vmgyqhfesneannfqrvzg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i3Uz9zvdLeXddbw-HOBP9w_mBTsi32k';
const WEBHOOK = process.env.PESQUISA_LOWTICKET_WEBHOOK_URL
  || 'https://n8n.advocaciadeimpacto.adv.br/webhook/lowticket-pesquisa';

/* Mesma lista do scoring-lowticket.js e do CHECK da tabela. Os três
   precisam concordar; qualquer produto novo entra nos três. */
const PRODUTOS = {
  posvenda: 'Pós-Venda no Piloto Automático',
  impactrh: 'ImpactMind RH'
};

const txt = (v, max) => (v == null ? null : String(v).trim().slice(0, max) || null);
const inteiro = v => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null);

function corpoDaRequisicao(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return {}; } }
  return b;
}

function mensagem(r, lead, sla, leitura) {
  const lista = (itens) => (itens || []).map(t => `• ${t}`).join('\n');
  return [
    `*🎟️ Pesquisa ${PRODUTOS[r.produto]} · Classe ${r.classe || '—'} (${r.score ?? '—'})*`,
    '',
    `*Nome:* ${lead.nome}`,
    `*WhatsApp:* ${lead.whatsapp}`,
    `*E-mail:* ${lead.email}`,
    '',
    `*Prioridade:* ${sla || '—'}`,
    `*Degrau:* ${r.degrau || '—'} · *Qualidade:* ${r.qualidade || '—'}`,
    `*Como está hoje:* ${r.situacao || '—'}`,
    `*O que mais dói:* ${r.desafio || '—'}`,
    `*Quando vai aplicar:* ${r.plano || '—'}`,
    r.texto_livre ? `*Escreveu:* ${r.texto_livre}` : null,
    leitura?.pos?.length ? `\n*A favor*\n${lista(leitura.pos)}` : null,
    leitura?.neg?.length ? `\n*Atenção na conversa*\n${lista(leitura.neg)}` : null
  ].filter(l => l !== null).join('\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, erro: 'método não permitido' });
  }

  const d = corpoDaRequisicao(req);

  const produto = txt(d.produto, 20);
  if (!produto || !PRODUTOS[produto]) {
    return res.status(400).json({ ok: false, erro: 'Produto não identificado. Abra o link de novo pelo e-mail da compra.' });
  }

  const lead = {
    nome: txt(d.lead?.nome, 120),
    email: (txt(d.lead?.email, 160) || '').toLowerCase(),
    whatsapp: String(d.lead?.whatsapp ?? '').replace(/\D/g, '').slice(0, 15)
  };
  if (!lead.nome || !/^\S+@\S+\.\S+$/.test(lead.email) || lead.whatsapp.length < 10) {
    return res.status(400).json({ ok: false, erro: 'Confira nome, e-mail e WhatsApp.' });
  }

  const linha = {
    produto,
    nome: lead.nome, email: lead.email, whatsapp: lead.whatsapp,
    score: inteiro(d.score), score_base: inteiro(d.score_base), ajuste: inteiro(d.ajuste),
    classe: txt(d.classe, 2), degrau: txt(d.degrau, 60), degrau_estrutura: txt(d.degrau_estrutura, 60),
    qualidade: txt(d.qualidade, 10), area: txt(d.area, 20), perfil: txt(d.perfil, 20),
    situacao: txt(d.situacao, 200), desafio: txt(d.desafio, 200), plano: txt(d.plano, 120),
    texto_livre: txt(d.texto_livre, 600),
    pontos: d.pontos && typeof d.pontos === 'object' ? d.pontos : null,
    respostas: Array.isArray(d.respostas) ? d.respostas.slice(0, 20) : null,
    leitura: d.leitura && typeof d.leitura === 'object' ? d.leitura : null,
    origem: d.origem && typeof d.origem === 'object' ? d.origem : null,
    pagina: txt(d.pagina, 500),
    user_agent: txt(req.headers['user-agent'], 400)
  };

  // 1) webhook (a mensagem já sai pronta)
  let webhookStatus = null;
  try {
    const r = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        origem: 'pesquisa-lowticket', ...linha,
        produto_nome: PRODUTOS[produto], sla: txt(d.sla, 80),
        mensagem: mensagem(linha, lead, txt(d.sla, 80), linha.leitura)
      }),
      signal: AbortSignal.timeout(5000)
    });
    webhookStatus = r.status;
  } catch (e) {
    console.error('[pesquisa-lowticket] webhook falhou:', e?.message || e);
    webhookStatus = 0;
  }

  // 2) tabela
  let gravou = false;
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/pesquisa_lowticket`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json', Prefer: 'return=minimal'
      },
      body: JSON.stringify({ ...linha, webhook_status: webhookStatus }),
      signal: AbortSignal.timeout(5000)
    });
    gravou = r.ok;
    if (!r.ok) console.error('[pesquisa-lowticket] supabase recusou:', r.status, await r.text().catch(() => ''));
  } catch (e) {
    console.error('[pesquisa-lowticket] supabase falhou:', e?.message || e);
  }

  const webhookOk = webhookStatus >= 200 && webhookStatus < 300;
  if (!gravou && !webhookOk) {
    return res.status(502).json({ ok: false, erro: 'Não conseguimos registrar agora. Tente de novo em instantes.' });
  }
  return res.status(200).json({ ok: true });
};
