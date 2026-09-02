/* Atalho para o time comercial no WhatsApp.
   ------------------------------------------------------------------
   Dois momentos, dois textos. O texto que chega já diz de onde a pessoa
   veio, então o time sabe se está falando com quem ainda não marcou ou
   com quem já tem horário na agenda — sem depender de perguntar.
   ------------------------------------------------------------------ */

export const NUMERO = '5511936241840';

/* Cada momento tem rótulo, chamada e a frase que vai pré-preenchida. */
const MOMENTOS = {
  fila: {
    etapa: 'whatsapp_fila',
    titulo: 'Precisa de um horário antes desses?',
    apoio: 'A agenda abre por ordem de chegada. Se nenhum horário servir, ou se o seu caso não puder esperar, chame o time e a gente tenta encaixar você antes.',
    rotulo: 'Falar com o time',
    texto: ({ nome }) =>
      `Olá! ${nome ? `Aqui é ${nome}. ` : ''}Estou na página de agendamento da Sessão Estratégica ` +
      `e queria ver se dá para encaixar um horário antes dos que estão abertos.`
  },
  pos_agenda: {
    etapa: 'whatsapp_pos_agenda',
    titulo: 'Quer adiantar alguma coisa?',
    apoio: 'Se surgir dúvida antes da sessão, ou se você precisar remarcar, é por aqui que o time responde mais rápido.',
    rotulo: 'Chamar o time no WhatsApp',
    texto: ({ nome, quando }) =>
      `Olá! ${nome ? `Aqui é ${nome}. ` : ''}Acabei de agendar minha Sessão Estratégica` +
      `${quando ? ` para ${quando}` : ''} e queria falar com o time antes.`
  }
};

export function linkWhatsApp(momento, dados = {}) {
  const m = MOMENTOS[momento];
  return `https://wa.me/${NUMERO}?text=${encodeURIComponent(m.texto(dados))}`;
}

/* Devolve o HTML do bloco. Quem chama decide onde encaixar. */
export function blocoWhatsApp(momento, dados = {}) {
  const m = MOMENTOS[momento];
  return `
    <aside class="wa-bloco" data-momento="${momento}">
      <p class="wa-titulo">${m.titulo}</p>
      <p class="wa-apoio">${m.apoio}</p>
      <a class="wa-btn" id="wa-${momento}" href="${linkWhatsApp(momento, dados)}"
         target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true">
          <path d="M17.5 14.4c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.1-.2.3-.7 1-.9 1.2-.2.2-.3.2-.6.1-1.6-.8-2.7-1.4-3.8-3.2-.3-.5.3-.5.8-1.5.1-.2 0-.4 0-.5 0-.2-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1.1 2.9 1.2 3.1c.1.2 2.1 3.2 5.1 4.5 1.9.8 2.6.9 3.5.7.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z"/>
          <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2z"/>
        </svg>
        ${m.rotulo}
      </a>
    </aside>`;
}

/* Registra a saída antes de o navegador trocar de aba. */
export function ligarWhatsApp(momento, marcar) {
  const a = document.getElementById(`wa-${momento}`);
  if (!a) return;
  a.addEventListener('click', () => {
    try { marcar(MOMENTOS[momento].etapa); } catch (e) { console.warn('[wa]', e); }
  });
}
