/* Tela de acesso do painel. Ver admin-auth.js para o que isto é (e não é). */

import { SENHA, autenticado, autenticar } from './admin-auth.js';

if (autenticado()) location.href = 'painel.html';

const form = document.querySelector('#form');
const campo = document.querySelector('#senha');
const erro = document.querySelector('#erro');

form.onsubmit = e => {
  e.preventDefault();
  if (campo.value === SENHA) {
    autenticar();
    location.href = 'painel.html';
    return;
  }
  erro.hidden = false;
  campo.value = '';
  campo.focus();
};
