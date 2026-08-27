/* Abre a sessão do painel a partir do segredo que veio na URL.
   ------------------------------------------------------------------
   Substitui a tela de login. O fluxo é:

     1. lê o `k` da URL (ou o que já ficou guardado nesta aba)
     2. troca por uma sessão do Supabase, no servidor
     3. entrega a sessão ao supabase-js

   Depois do passo 3 nada mais muda: o `db.js` segue idêntico e o RLS
   enxerga um usuário `authenticated`, igual a um login normal. Por
   isso o painel inteiro continua funcionando sem uma linha alterada
   nas 13 operações que ele faz.

   O `k` sai da barra de endereço assim que é usado. Não é segurança —
   quem tem o link tem o acesso — mas evita o vazamento bobo de alguém
   printar a tela ou compartilhar a URL da aba já aberta.
   ------------------------------------------------------------------ */

import { supabase } from './supabase-client.js';

const GUARDA = 'adv_painel_k';

function segredo() {
  const p = new URLSearchParams(location.search);
  const daUrl = p.get('k');
  if (daUrl) {
    try { sessionStorage.setItem(GUARDA, daUrl); } catch { /* sem storage */ }
    /* Limpa a barra de endereço sem recarregar nem criar entrada no
       histórico — o replaceState mantém o botão Voltar previsível. */
    p.delete('k');
    const limpa = location.pathname + (p.toString() ? '?' + p : '') + location.hash;
    history.replaceState(null, '', limpa);
    return daUrl;
  }
  try { return sessionStorage.getItem(GUARDA); } catch { return null; }
}

function recusar(motivo) {
  document.body.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;
                font-family:system-ui,-apple-system,sans-serif;background:#0d0b09;color:#e8e2d9">
      <div style="max-width:420px;text-align:center">
        <div style="font-size:34px;margin-bottom:14px">🔒</div>
        <h1 style="font-size:20px;margin:0 0 10px">Link sem acesso</h1>
        <p style="margin:0;color:#9a8f82;font-size:14.5px;line-height:1.55">${motivo}</p>
        <p style="margin:18px 0 0;color:#6b6259;font-size:12.5px">
          Peça o link atualizado a quem administra o painel.</p>
      </div>
    </div>`;
  document.title = 'Sem acesso';
  /* Promise que nunca resolve: segura o top-level await de quem chamou,
     então o resto do módulo (que monta a tela e lê dados) não executa. */
  return new Promise(() => {});
}

export async function acessoPorLink() {
  /* Já há sessão viva nesta aba? Então não precisa trocar nada. */
  const { data: { session } } = await supabase.auth.getSession();
  if (session) return;

  const k = segredo();
  if (!k) return recusar('Este painel abre por um link com código de acesso, e ele não veio na URL.');

  let dados;
  try {
    const r = await fetch(`/api/sessao?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
    if (!r.ok) {
      try { sessionStorage.removeItem(GUARDA); } catch { /* segue */ }
      return recusar('O código deste link não é mais válido. Ele pode ter sido trocado.');
    }
    dados = await r.json();
  } catch {
    return recusar('Não foi possível falar com o servidor agora. Tente recarregar em instantes.');
  }

  const { error } = await supabase.auth.setSession({
    access_token: dados.access_token,
    refresh_token: dados.refresh_token
  });
  if (error) return recusar('A sessão não pôde ser aberta. Avise quem administra o painel.');
}

export async function sair() {
  await supabase.auth.signOut();
  try { sessionStorage.removeItem(GUARDA); } catch { /* segue */ }
  location.reload();
}
