/* Webhook da Hubla: todas as vendas, de todos os produtos.
   ------------------------------------------------------------------
   A Hubla faz POST aqui a cada evento de fatura. A rota não interpreta
   nada: repassa o corpo e o `?k=` para `public.hubla_webhook(p, k)` no
   Supabase GERENCIADO (vmgyqhfesneannfqrvzg). Lá dentro:
     1. o segredo é conferido contra `hubla_config` (sem acesso para a
        chave publicável — por isso a conferência fica no banco);
     2. o evento cru vai para `hubla_eventos`;
     3. a fatura vai para `hubla_faturas`, sempre com o último estado;
     4. um gatilho recalcula o dia no funil do painel do grupo
        (`dash_funil_comercial`, fonte 'hubla').

   Eventos que importam, com o nome exato da Hubla:
     invoice.payment_succeeded   pagamento aprovado (a venda)
     invoice.status_updated      toda troca de status (paid, refunded…)
     invoice.refunded            reembolso

   Regra na Hubla: modo "Integração recomendada" (um aviso por venda).
   O modo de compatibilidade manda 2 x N avisos numa venda com order
   bump; o banco ignora os avisos de fatura fabricada (`parentInvoiceId`)
   e junta os itens, então os dois modos funcionam sem contar em dobro.

   Mora aqui, e não no painel do grupo, porque o painel já usa as 12
   funções que o plano da Vercel permite.
   ------------------------------------------------------------------ */

const SUPABASE_URL = 'https://vmgyqhfesneannfqrvzg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_i3Uz9zvdLeXddbw-HOBP9w_mBTsi32k';

function corpoDaRequisicao(req) {
  const b = req.body;
  if (!b) return null;
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return null; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return null; } }
  return b;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const k = String((req.query && req.query.k) || '');
  if (!k) return res.status(404).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, erro: 'use POST' });
  }
  const p = corpoDaRequisicao(req);
  if (!p || typeof p !== 'object') return res.status(400).json({ ok: false, erro: 'corpo não é JSON' });

  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hubla_webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
      body: JSON.stringify({ p, k })
    });
    const txt = await r.text();
    if (r.status === 401 || r.status === 403 || /nao autorizado/.test(txt)) return res.status(404).end();
    /* 5xx faz a Hubla reenviar — é o que queremos se o banco caiu. */
    if (!r.ok) return res.status(502).json({ ok: false, erro: txt.slice(0, 300) });
    return res.status(200).send(txt || '{"ok":true}');
  } catch (e) {
    return res.status(502).json({ ok: false, erro: e.message });
  }
};
