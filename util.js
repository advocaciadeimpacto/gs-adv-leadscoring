/* Utilidades compartilhadas entre público e painel.
   ------------------------------------------------------------------
   Só o que é repetido ao pé da letra em mais de um arquivo. Nada aqui
   é específico de scoring, agenda ou UI de uma tela só — isso continua
   morando no arquivo dono do assunto. */

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Formatação progressiva, para campos que o usuário está digitando
   (aceita string parcial a cada tecla). */
export const formatarTelefone = v => {
  const n = String(v ?? '').replace(/\D/g, '').slice(0, 11);
  return n.length > 10 ? `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
       : n.length > 6  ? `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
       : n.length > 2  ? `(${n.slice(0,2)}) ${n.slice(2)}`
       : n;
};

/* Exibição de um número já completo (gravado no banco). Diferente da
   progressiva: se não bater 10 ou 11 dígitos, devolve o valor original
   em vez de uma formatação parcial — não faz sentido no painel. */
export const fmtTelefone = t => {
  const n = String(t || '').replace(/\D/g, '');
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`;
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`;
  return t || '';
};
