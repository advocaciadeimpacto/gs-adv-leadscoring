# Lead Scoring e Sessão Estratégica — Advocacia de Impacto

Funil de qualificação de leads para escritórios de advocacia, com agendamento
automático das Sessões Estratégicas entre os closers do time.

**Produção:** https://lead-scoring-adv-impacto.vercel.app

> **Leia a seção [O que é simulação](#o-que-é-simulação-e-precisa-virar-real) antes de
> mexer em qualquer coisa.** Parte do sistema é um mockup funcional, desenhado
> para ser substituído por infraestrutura real sem reescrever o resto.

---

## O que o sistema faz

1. O advogado responde **6 perguntas** sobre o escritório (`index.html`).
2. O modelo calcula uma nota de 0 a 100 e uma **classe A, B, C ou D**.
3. Ele vai para a conclusão (`obrigado.html`) e agenda uma **Sessão Estratégica**
   de 30 minutos (`agendar.html`).
4. Um dos 3 closers é **sorteado automaticamente** entre os que estão livres
   naquele horário. O lead não escolhe e não vê quem foi.
5. O time acompanha tudo pelo painel interno (`painel.html`).

### Regra que não pode ser quebrada

**O lead nunca pode ver a leitura comercial.** O resultado do scoring contém
frases como "não force fechamento" e "oferecer high ticket aqui gera objeção de
preço quase certa". Isso vive apenas no painel interno. O circuito público
termina em conclusão e agendamento, sem nota, sem critérios, sem diagnóstico.

---

## Como rodar

Não há build nem dependências. É HTML, CSS e JavaScript com módulos ES.

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

Precisa de um servidor HTTP: os módulos ES não carregam via `file://`.

**Deploy:** push na branch `main` publica na Vercel automaticamente.

---

## Mapa dos arquivos

### Público (o advogado vê)

| Arquivo | Função |
|---|---|
| `index.html` + `quiz.js` | Abertura e as 6 perguntas |
| `obrigado.html` | Conclusão, oferta da Sessão Estratégica e materiais |
| `agendar.html` + `agendar.js` | Calendário, escolha de horário, dados e confirmação |

### Interno (só o time)

| Arquivo | Função |
|---|---|
| `painel.html` + `painel.js` | Três abas: Respostas, Agenda do time, Critérios |

### Compartilhado

| Arquivo | Função |
|---|---|
| `scoring.js` | **O modelo inteiro.** Perguntas, pesos, classes, escada, cálculo e render do resultado |
| `db.js` | Camada de dados. Hoje `localStorage`, desenhada para virar Supabase |
| `agenda-core.js` | Geração de horários, disponibilidade e sorteio de closer |
| `supabase-schema.sql` | DDL pronto das tabelas |
| `style.css` | Estilos de tudo |
| `og.png` | Imagem de preview de link (1200×630) |

---

## O modelo de scoring

Definido pelo time de marketing com o Guilherme. **Não altere pesos sem
combinar antes:** eles saem de uma decisão de negócio, não de otimização técnica.

Tudo mora no topo de `scoring.js`.

- **4 critérios com peso igual, 25 pontos cada**, somando 100
- **Classe A** a partir de 85, **B** 65, **C** 45, **D** abaixo
- **Faturamento e pessoas** definem o degrau da escada de produtos
- **Urgência e histórico de mentoria** formam a linha de qualidade (0 a 50)
- **Área de atuação** não soma: aplica um ajuste depois (`-5` artesanal, `-15` criminal)

### Por que existe a "linha de qualidade"

Com peso igual, o cliente ideal da Gestão Descomplicada (R$ 25 mil, 2 pessoas,
pressa máxima, já fez mentoria) trava em **70 pontos** e nunca alcança a classe A,
porque os dois critérios de porte limitam o teto. Ele não é um lead pior: é um
lead de outro degrau. A linha de qualidade existe para o comercial enxergar isso
e não rebaixar quem deveria ser atacado hoje.

**A aba Critérios é gerada a partir de `scoring.js`**, não é digitada à mão. Mudou
o peso, a documentação muda junto. Mantenha assim.

---

## O que é simulação e precisa virar real

Esta é a lista de trabalho.

### 1. Banco de dados (prioridade)

`db.js` grava em `localStorage`. Cada navegador tem a própria cópia, então o que
o closer vê não é o que o gestor vê.

A interface já é **idêntica à do `supabase-js`**: tudo `async`, retornando
`{ data, error }`. Trocar é substituir o corpo de cada função, sem tocar em mais nada.

```js
// hoje
async listarAgendamentos() { return { data: ler(CHAVES.agendamentos), error: null }; }

// depois
async listarAgendamentos() { return await supabase.from('agendamentos').select('*'); }
```

O `supabase-schema.sql` tem o DDL completo. **Note a constraint `sem_sobreposicao`**:
é ela que impede de verdade dois leads reservarem o mesmo closer no mesmo segundo.
Validação no front nunca resolve isso. Não remova.

### 2. Fuso horário (bug latente)

Os horários são gerados no fuso **do navegador do lead**. Um advogado em outro
fuso veria horários deslocados. Em produção, fixe `America/Sao_Paulo` na geração
dos slots em `agenda-core.js` e grave sempre em UTC.

### 3. Integrações que não existem

- **Google Calendar:** o agendamento não cria evento na agenda de ninguém. Precisa
  de OAuth por closer e criação do evento com link de videochamada.
- **E-mail e WhatsApp:** a confirmação é prometida ao lead na tela, mas nada é
  enviado. Precisa de confirmação imediata e lembrete antes da call.
- **Webhook:** `dispararWebhook()` em `db.js` só registra o payload localmente. O
  formato final já está definido; falta o `fetch` para o endpoint real (n8n, Make
  ou Edge Function).

### 4. Autenticação

`painel.html` está aberto. Qualquer um com o link vê os dados dos leads. Precisa
de login antes de qualquer uso real.

### 5. Placeholders

- **Nomes dos closers:** `CLOSERS` em `db.js` tem "Closer 1, 2, 3".
- **Materiais gratuitos:** os três links em `obrigado.html` estão como `href="#"`.
  A página de abertura promete acesso na hora, então isso não pode ir ao ar vazio.

### 6. Colunas de desfecho (o que dá valor ao modelo)

Faltam três campos por lead: **compareceu**, **fechou** e **motivo da perda**.

Sem eles, os pesos continuam sendo hipótese para sempre. Com cerca de 100 leads
pontuados e com desfecho registrado, dá para inverter a lógica: em vez de supor
que faturamento vale 25, o dado mostra quanto vale.

---

## Decisões tomadas (não desfaça sem saber o motivo)

- **Sorteio aleatório entre os closers livres.** Foi pedido assim. Para trocar por
  distribuição equilibrada, existe uma função isolada (`sortearCloser` em
  `agenda-core.js`) com a instrução no comentário.
- **O lead não vê o nome do closer**, só "um especialista do nosso time". Permite
  remanejar antes da call sem quebrar promessa.
- **WhatsApp é gravado só com dígitos.** É a chave única do lead: nome tem acento,
  abreviação e erro de digitação; telefone não. A formatação é só exibição.
- **Toda resposta é gravada, mesmo sem contato.** Como a captura acontece só no
  agendamento, quem responde e não agenda aparece no painel como "sem contato".
  Isso é intencional: é a medida de abandono do funil.
- **`robots.txt` não bloqueia nada de propósito.** As páginas internas saem de
  busca pela meta `noindex` de cada uma. Se você adicionar `Disallow`, o robô não
  abre a página e nunca lê o `noindex`, e o efeito vira o oposto do pretendido.
- **Antecedência mínima de 24h e janela de 21 dias**, expediente 9h às 12h e 14h
  às 18h, de segunda a sexta. Tudo em `EXPEDIENTE`, no topo de `db.js`.

---

## Sugestão de ordem

1. Supabase + autenticação do painel (destrava o uso real por mais de uma pessoa)
2. Fuso horário fixo
3. Google Calendar + confirmação por e-mail e WhatsApp
4. Colunas de desfecho
5. Substituir os placeholders

Os itens 1 a 3 são o que separa o mockup de uma ferramenta que o comercial pode
usar de verdade. O item 4 é o que faz o scoring deixar de ser chute.
