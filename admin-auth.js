/* Guarda de acesso ao painel interno — Supabase Auth de verdade.
   ------------------------------------------------------------------
   Login validado no servidor (Supabase), sessão controlada pelo
   supabase-js. As tabelas sensíveis (respostas, agendamentos, links,
   webhook_log) só liberam leitura pra quem estiver autenticado — ver
   as políticas de RLS em supabase-schema.sql. Sem sessão válida, a
   chave anon (pública, vive no JS do navegador) não lê nada disso.
   ------------------------------------------------------------------ */

import { supabase } from './supabase-client.js';

export async function autenticado() {
  const { data: { session } } = await supabase.auth.getSession();
  return !!session;
}

export async function autenticar(email, senha) {
  return supabase.auth.signInWithPassword({ email, password: senha });
}

export async function sair() {
  await supabase.auth.signOut();
  location.href = 'admin';
}

/* Chame isso no topo de qualquer página que só o time pode ver, antes
   de montar qualquer coisa na tela — com `await`, no topo do módulo
   (top-level await): enquanto a promise não resolve, nada depois dela
   roda. Se não tiver sessão, o redirecionamento começa e a promise
   nunca resolve de propósito — o resto do módulo (que monta a tela e
   lê dados) não chega a executar enquanto a navegação está em curso. */
export async function exigirAutenticacao() {
  if (!(await autenticado())) {
    location.href = 'admin';
    return new Promise(() => {});
  }
}
