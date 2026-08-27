/* Acesso ao painel por link, sem tela de login.
   ------------------------------------------------------------------
   O time precisa abrir o painel a partir de um link colado no chat
   interno. Pedir e-mail e senha a cada vez não cabe nesse uso, mas
   deixar a página aberta também não: o painel CANCELA agendamento,
   apaga link e cria bloqueio na agenda. URL pública é varrida por
   robô, e um GET distraído bastaria para derrubar a agenda.

   A saída é o segredo viver na própria URL. Quem tem o link entra;
   quem não tem não descobre por tentativa, porque são 40 caracteres
   aleatórios. E, diferente de abrir o RLS para o anônimo, isto não
   expõe o banco: a chave `anon` que vive no JS continua sem poder ler
   `respostas`, `agendamentos`, `links` nem `webhook_log`. O que o
   navegador recebe aqui é uma SESSÃO do Supabase — exatamente o que
   ele receberia depois de um login normal, e com a mesma validade.

   Vazou o link? Troca-se PAINEL_TOKEN na Vercel e o antigo morre.
   Isso é o que a página aberta não permitiria desfazer.
   ------------------------------------------------------------------ */

const crypto = require('crypto');

const SUPABASE_URL = 'https://supabase.advocaciadeimpacto.adv.br';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyAgCiAgICAicm9sZSI6ICJhbm9uIiwKICAgICJpc3MiOiAic3VwYWJhc2UtZGVtbyIsCiAgICAiaWF0IjogMTY0MTc2OTIwMCwKICAgICJleHAiOiAxNzk5NTM1NjAwCn0.dc_X5iR_VP_qT0zsiyj_I_OZ2T9FtRU2BBNWN8Bu4GE';

/* Comparação em tempo constante. Comparar com === vazaria o tamanho do
   prefixo correto pelo tempo de resposta, e com isso o token pode ser
   descoberto caractere a caractere. */
function iguais(a, b) {
  const ba = Buffer.from(String(a || ''));
  const bb = Buffer.from(String(b || ''));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = async (req, res) => {
  const esperado = process.env.PAINEL_TOKEN;
  const email    = process.env.PAINEL_EMAIL;
  const senha    = process.env.PAINEL_SENHA;

  /* 404 e não 401 de propósito: quem chega sem o segredo não deve nem
     saber que existe um endpoint aqui para atacar. */
  if (!esperado || !email || !senha) {
    return res.status(404).json({ erro: 'nao encontrado' });
  }

  const k = (req.query && req.query.k) || '';
  if (!iguais(k, esperado)) {
    return res.status(404).json({ erro: 'nao encontrado' });
  }

  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: ANON },
      body: JSON.stringify({ email, password: senha })
    });
    const s = await r.json();

    if (!r.ok || !s.access_token) {
      return res.status(502).json({ erro: 'credencial do painel recusada pelo Supabase' });
    }

    /* Não cachear em lugar nenhum: é credencial de sessão. */
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    return res.status(200).json({
      access_token: s.access_token,
      refresh_token: s.refresh_token,
      expires_in: s.expires_in
    });
  } catch (e) {
    return res.status(502).json({ erro: 'falha ao abrir sessao' });
  }
};
