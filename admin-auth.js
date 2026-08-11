/* Guarda de acesso ao painel interno.
   ------------------------------------------------------------------
   MOCKUP: isto não é autenticação de verdade. O site é HTML/JS estático,
   sem servidor — não existe onde esconder uma senha ou validar um login
   com segurança real no lado do cliente. Qualquer um que abra o código-
   fonte deste arquivo vê a senha abaixo.

   O que isto resolve: tirar o painel do alcance de quem só encontra o
   link por acaso (não fica mais linkado nas páginas públicas, e exige
   digitar a senha em /admin antes de qualquer dado aparecer).

   O que isto NÃO resolve: alguém decidido a entrar, entra. Para
   segurança real, trocar por login via Supabase Auth (e-mail/senha ou
   magic link), validado no servidor — é o mesmo passo que troca
   localStorage por Supabase em db.js.

   Troque a senha abaixo antes de divulgar o link do /admin. */

export const SENHA = 'troque-esta-senha';

const CHAVE = 'adv_admin_sessao';

export const autenticado = () => sessionStorage.getItem(CHAVE) === 'ok';
export const autenticar = () => sessionStorage.setItem(CHAVE, 'ok');
export const sair = () => { sessionStorage.removeItem(CHAVE); location.href = 'admin'; };

/* Chame isso no topo de qualquer página que só o time pode ver, antes
   de montar qualquer coisa na tela. O throw depois do redirecionamento
   é de propósito: interrompe o resto do módulo na hora, para o código
   que vem depois (que monta a tela e lê dados) nunca chegar a rodar
   enquanto a navegação para /admin ainda está em andamento. */
export function exigirAutenticacao() {
  if (!autenticado()) {
    location.href = 'admin';
    throw new Error('Painel sem autenticação — redirecionando.');
  }
}
