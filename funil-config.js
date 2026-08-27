/* Credenciais do Supabase de ANALYTICS — o SEGUNDO banco do projeto.
   ------------------------------------------------------------------
   Este repositório fala com dois Supabase diferentes, de propósito:

     supabase.advocaciadeimpacto.adv.br  (self-hosted)
       leads, agendamentos, links, closers. Acesso autenticado, via
       `supabase-client.js` + `db.js`, protegido por RLS.

     vmgyqhfesneannfqrvzg.supabase.co    (gerenciado)  ← este arquivo
       só telemetria de passagem de etapa (`funil_eventos` e as views
       de agregação). Acesso anônimo, leitura das views.

   Manter os dois separados é o que faz a medição continuar de pé se o
   self-hosted cair — foi o alarme que faltou no apagão de 21 a 24/08.
   Por isso NÃO unifique os clientes: a aba de funil fala REST direto
   com o gerenciado (`funil-dados.js`) e nunca passa pelo `db.js`.

   A chave abaixo é a `anon`, pública por natureza, e é a MESMA que já
   está embutida em index.html, obrigado.html e agendar.html — lá o
   `adv-track.js` a lê de `window.ADV_ANALYTICS_*`, porque aquelas
   páginas usam script clássico. O painel é módulo ES, então aqui ela
   vira export. A duplicação é intencional: mexer nas páginas públicas
   para compartilhar este módulo colocaria o funil que está captando
   lead em risco por uma economia de três linhas.

   O que essa chave permite: inserir evento, preencher a resposta
   escolhida e ler as views. A tabela não guarda nome, e-mail nem
   telefone — só `sessao_id` aleatório, etapa, opção, device e UTM.
   ------------------------------------------------------------------ */

export const ANALYTICS_URL = 'https://vmgyqhfesneannfqrvzg.supabase.co';
export const ANALYTICS_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZtZ3lxaGZlc25lYW5uZnFydnpnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNDExNjYsImV4cCI6MjEwMTYxNzE2Nn0.KnVAIL4jN-0LHvPdw2QLqsmm2vl2RuvLihoMzkxp0iY';
