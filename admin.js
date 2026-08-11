/* Tela de acesso do painel. Ver admin-auth.js para como a sessão funciona. */

import { autenticado, autenticar } from './admin-auth.js';

if (await autenticado()) location.href = 'painel';

const form = document.querySelector('#form');
const campoEmail = document.querySelector('#email');
const campoSenha = document.querySelector('#senha');
const erro = document.querySelector('#erro');
const btn = document.querySelector('#entrar');

form.onsubmit = async e => {
  e.preventDefault();
  erro.hidden = true;
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  const { error } = await autenticar(campoEmail.value.trim(), campoSenha.value);

  if (error) {
    erro.hidden = false;
    campoSenha.value = '';
    campoSenha.focus();
    btn.disabled = false;
    btn.textContent = 'Entrar';
    return;
  }

  location.href = 'painel';
};
