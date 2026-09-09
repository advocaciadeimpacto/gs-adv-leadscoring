/* Testes do filtro da aba Respostas.
   ==================================================================
       node --test respostas-filtro.test.js

   Não precisa de servidor, de login nem de banco: `respostas-filtro.js`
   é puro de propósito, e o painel exige sessão autenticada (é a única
   forma de testar essa lógica sem credencial de painel na mão).

   A amostra abaixo é SINTÉTICA: o formato de cada campo e os valores
   possíveis de Data/Classe/Degrau/utm_source foram lidos da tabela
   `forms_adv` real, mas nome, e-mail e telefone são inventados. O
   repositório é público — dado de lead não entra aqui.
   ================================================================== */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dataBR, chaveDia, digitos, semAcento, prepararLinhas, ordenar,
  janela, casaBusca, aplicarFiltros, distribuicao, matriz, valoresDe, SEM_QUIZ
} from './respostas-filtro.js';

const ESCADA = ['Trincheira', 'Gestão Descomplicada', 'Gestão de Impacto', 'Implementação ou Impactus'];

/* Cada linha imita uma de forms_adv: Data em texto DD/MM/AAAA, Score em
   texto, e Classe/Degrau nulos em quem não respondeu o quiz. */
const linha = (id, Data, Classe, Degrau, DegrauEstrutura, extra = {}) => ({
  id, Data, Classe, Degrau, 'Degrau Estrutura': DegrauEstrutura,
  Nome: `Lead ${id}`, Email: `lead${id}@exemplo.com.br`, Telefone: `1199${String(id).padStart(7, '0')}`,
  Score: Classe ? '70' : null, utm_source: 'ig', ...extra
});

const AMOSTRA = [
  linha(772, '09/09/2026', 'C', 'Trincheira', 'Trincheira'),
  linha(771, '09/09/2026', 'D', 'Trincheira', 'Trincheira', { utm_source: null }),
  linha(770, '09/09/2026', 'A', 'Implementação ou Impactus', 'Implementação ou Impactus',
        { Nome: 'José Ávila Nogueira', Email: 'jose.avila@escritorio.adv.br', Telefone: '(62) 98544-9364' }),
  linha(763, '09/09/2026', null, null, null),
  linha(760, '09/09/2026', 'B', 'Gestão Descomplicada', 'Gestão de Impacto'),
  linha(746, '08/09/2026', 'B', 'Implementação ou Impactus', 'Implementação ou Impactus'),
  linha(700, '05/09/2026', 'C', 'Gestão de Impacto', 'Gestão de Impacto', { utm_source: 'instagram-bio' }),
  linha(468, '31/08/2026', 'C', 'Trincheira', 'Trincheira', { utm_source: 'instagram-bio' }),
  linha(120, '05/08/2026', 'D', 'Trincheira', 'Trincheira'),
  linha(3,   '01/08/2026', 'A', 'Gestão de Impacto', 'Implementação ou Impactus'),
  linha(2,   '',           'D', 'Trincheira', 'Trincheira'),          // sem data
  linha(1,   null,         null, null, null)                          // sem data e sem quiz
];

const HOJE = new Date('2026-09-09T12:00:00-03:00');
const prontas = prepararLinhas(AMOSTRA);
const ids = ls => ls.map(r => r.id);

/* ---------- conversão de data ---------- */

test('DD/MM/AAAA vira meia-noite de São Paulo', () => {
  const d = dataBR('09/09/2026');
  assert.equal(d.toISOString(), '2026-09-09T03:00:00.000Z');   // 00:00 em -03:00
  assert.equal(chaveDia(d), '2026-09-09');
});

test('data inválida, vazia ou de outro formato vira null', () => {
  for (const v of ['', null, undefined, '2026-09-09', '9/9/2026', '31/02/2026', '00/01/2026', 'ontem']) {
    assert.equal(dataBR(v), null, `deveria recusar ${JSON.stringify(v)}`);
  }
});

test('prepararLinhas anota chave, telefone só com dígitos e busca sem acento', () => {
  const r = prontas.find(x => x.id === 770);
  assert.equal(r._chave, '2026-09-09');
  assert.equal(r._tel, '62985449364');
  assert.equal(r._nome, 'jose avila nogueira');
  assert.equal(r._degrau, 'Implementação ou Impactus');
  assert.equal(prontas.find(x => x.id === 763)._degrau, null);
  assert.equal(prontas.find(x => x.id === 2)._chave, null);
  assert.equal(prontas.find(x => x.id === 771)._origem, 'direto');
});

test('digitos e semAcento', () => {
  assert.equal(digitos('(11) 98444-0000'), '11984440000');
  assert.equal(semAcento('Gestão de Impacto'), 'gestao de impacto');
});

/* ---------- ordenação ---------- */

test('ordena por data desc, id desc, e joga "sem data" pro fim', () => {
  assert.deepEqual(ids(ordenar(prontas)),
    [772, 771, 770, 763, 760, 746, 700, 468, 120, 3, 2, 1]);
});

/* ---------- período ---------- */

test('janela: "Todo o período" não recorta nada', () => {
  assert.deepEqual(janela({ preset: 'tudo', dias: null }, HOJE), { de: null, ate: null });
});

test('janela de N dias conta hoje como o primeiro', () => {
  assert.deepEqual(janela({ dias: 7 }, HOJE), { de: '2026-09-03', ate: '2026-09-09' });
  assert.deepEqual(janela({ dias: 30 }, HOJE), { de: '2026-08-11', ate: '2026-09-09' });
  assert.deepEqual(janela({ dias: 1 }, HOJE), { de: '2026-09-09', ate: '2026-09-09' });
});

test('intervalo livre do calendário passa direto', () => {
  assert.deepEqual(janela({ desde: '2026-08-01', ate: '2026-08-31' }, HOJE),
    { de: '2026-08-01', ate: '2026-08-31' });
  assert.deepEqual(janela({ desde: '2026-08-05' }, HOJE), { de: '2026-08-05', ate: '2026-08-05' });
});

test('período recorta a lista e some com quem não tem data', () => {
  const em7 = aplicarFiltros(prontas, { periodo: { dias: 7 } }, HOJE);
  assert.deepEqual(ids(ordenar(em7)), [772, 771, 770, 763, 760, 746, 700]);

  const agosto = aplicarFiltros(prontas, { periodo: { desde: '2026-08-01', ate: '2026-08-31' } }, HOJE);
  assert.deepEqual(ids(ordenar(agosto)), [468, 120, 3]);
});

test('"sem data" só aparece em Todo o período', () => {
  const tudo = aplicarFiltros(prontas, { periodo: { preset: 'tudo' } }, HOJE);
  assert.equal(tudo.length, 12);
  assert.ok(ids(tudo).includes(2) && ids(tudo).includes(1));
});

/* ---------- classe, produto, origem ---------- */

test('classe aceita várias de uma vez, e "sem" pega quem não fez o quiz', () => {
  assert.deepEqual(ids(ordenar(aplicarFiltros(prontas, { classes: ['A'] }, HOJE))), [770, 3]);
  assert.deepEqual(ids(ordenar(aplicarFiltros(prontas, { classes: ['A', 'B'] }, HOJE))), [770, 760, 746, 3]);
  assert.deepEqual(ids(ordenar(aplicarFiltros(prontas, { classes: [SEM_QUIZ] }, HOJE))), [763, 1]);
  assert.equal(aplicarFiltros(prontas, { classes: [] }, HOJE).length, 12);
});

test('produto filtra pelo Degrau, inclusive o balde sem recomendação', () => {
  assert.deepEqual(ids(ordenar(aplicarFiltros(prontas, { produto: 'Trincheira' }, HOJE))),
    [772, 771, 468, 120, 2]);
  assert.deepEqual(ids(aplicarFiltros(prontas, { produto: SEM_QUIZ }, HOJE)).sort((a, b) => a - b), [1, 763]);
  assert.equal(aplicarFiltros(prontas, { produto: 'todos' }, HOJE).length, 12);
});

test('origem usa "direto" para quem chegou sem utm_source', () => {
  assert.deepEqual(ids(aplicarFiltros(prontas, { origem: 'direto' }, HOJE)), [771]);
  assert.deepEqual(ids(aplicarFiltros(prontas, { origem: 'instagram-bio' }, HOJE)), [700, 468]);
});

/* ---------- busca ---------- */

test('busca por nome ignora acento e caixa', () => {
  assert.deepEqual(ids(aplicarFiltros(prontas, { busca: 'jose avila' }, HOJE)), [770]);
  assert.deepEqual(ids(aplicarFiltros(prontas, { busca: 'ÁVILA' }, HOJE)), [770]);
});

test('busca por telefone casa só os dígitos, parcialmente', () => {
  assert.deepEqual(ids(aplicarFiltros(prontas, { busca: '98544' }, HOJE)), [770]);
  assert.deepEqual(ids(aplicarFiltros(prontas, { busca: '(62) 98544-9364' }, HOJE)), [770]);
  assert.equal(aplicarFiltros(prontas, { busca: '99999999999' }, HOJE).length, 0);
});

test('busca por e-mail casa pedaço do endereço', () => {
  assert.deepEqual(ids(aplicarFiltros(prontas, { busca: 'escritorio.adv.br' }, HOJE)), [770]);
  assert.equal(aplicarFiltros(prontas, { busca: '@exemplo.com.br' }, HOJE).length, 11);
});

test('busca vazia ou só espaço não filtra nada', () => {
  assert.equal(aplicarFiltros(prontas, { busca: '   ' }, HOJE).length, 12);
  assert.ok(casaBusca(prontas[0], ''));
});

/* ---------- combinação ---------- */

test('período + classe + produto + busca se acumulam', () => {
  const r = aplicarFiltros(prontas, {
    periodo: { dias: 7 }, classes: ['A', 'B'], produto: 'Implementação ou Impactus', busca: 'lead'
  }, HOJE);
  assert.deepEqual(ids(ordenar(r)), [746]);           // 770 é classe A mas o nome não tem "lead"
});

test('filtro impossível devolve lista vazia, não erro', () => {
  assert.deepEqual(aplicarFiltros(prontas, { classes: ['A'], produto: 'Trincheira' }, HOJE), []);
  assert.deepEqual(aplicarFiltros([], { busca: 'x' }, HOJE), []);
});

/* ---------- agregações ---------- */

test('distribuição por degrau segue a ordem da escada e fecha 100%', () => {
  const d = distribuicao(prontas, '_degrau', ESCADA);
  assert.deepEqual(d.map(x => [x.valor, x.n]), [
    ['Trincheira', 5],
    ['Gestão Descomplicada', 1],
    ['Gestão de Impacto', 2],
    ['Implementação ou Impactus', 2],
    [SEM_QUIZ, 2]
  ]);
  assert.equal(Math.round(d.reduce((a, x) => a + x.pct, 0)), 100);
  assert.equal(Math.round(d[0].pct * 10) / 10, 41.7);
});

test('distribuição do segundo eixo usa Degrau Estrutura', () => {
  const d = distribuicao(prontas, '_degrauEstrutura', ESCADA);
  assert.deepEqual(d.map(x => [x.valor, x.n]), [
    ['Trincheira', 5],
    ['Gestão de Impacto', 2],
    ['Implementação ou Impactus', 3],
    [SEM_QUIZ, 2]
  ]);
});

test('distribuição de lista vazia não divide por zero', () => {
  assert.deepEqual(distribuicao([], '_degrau', ESCADA), []);
});

test('matriz cruza produto com classe', () => {
  const m = matriz(prontas, ['A', 'B', 'C', 'D'], ESCADA);
  const trincheira = m.find(x => x.produto === 'Trincheira');
  assert.equal(trincheira.total, 5);
  assert.deepEqual(trincheira.porClasse, { A: 0, B: 0, C: 2, D: 3, [SEM_QUIZ]: 0 });
  const sem = m.find(x => x.produto === SEM_QUIZ);
  assert.deepEqual(sem.porClasse, { A: 0, B: 0, C: 0, D: 0, [SEM_QUIZ]: 2 });
  assert.equal(m.reduce((a, x) => a + x.total, 0), prontas.length);
});

test('valoresDe lista os produtos existentes, escada primeiro e "sem" por último', () => {
  assert.deepEqual(valoresDe(prontas, '_degrau', ESCADA),
    ['Trincheira', 'Gestão Descomplicada', 'Gestão de Impacto', 'Implementação ou Impactus', SEM_QUIZ]);
  assert.deepEqual(valoresDe(prontas.filter(r => r._degrau === 'Trincheira'), '_degrau', ESCADA),
    ['Trincheira']);
});
