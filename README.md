# Lead Scoring e Sessão Estratégica — Advocacia de Impacto

Funil de qualificação de leads para escritórios de advocacia, com agendamento
automático das Sessões Estratégicas entre os closers do time.

**Produção:** https://forms.advocaciadeimpacto.adv.br

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

Não há build. É HTML, CSS e JavaScript com módulos ES — a única dependência
(`@supabase/supabase-js`) vem de CDN via `supabase-client.js`, sem `npm install`.

Em produção as URLs não têm `.html` (`/agendar`, `/painel`, `/admin`...), via
`cleanUrls` no `vercel.json`. Os links internos do site já apontam pra essas
URLs limpas — o que significa que **`python3 -m http.server` sozinho não
serve mais pra testar a navegação local**, porque ele não sabe resolver
`/agendar` para `agendar.html`. Use o CLI da Vercel, que reproduz o mesmo
roteamento de produção:

```bash
npx vercel dev
```

Se preferir só abrir uma página isolada sem instalar nada, `python3 -m
http.server` ainda funciona — só entre com o nome do arquivo (`.html`) direto
na barra de endereço, sabendo que os links que saem dela vão dar 404 nesse modo.

Precisa de um servidor HTTP: os módulos ES não carregam via `file://`.

**Deploy:** push na branch `main` publica na Vercel automaticamente.

---

## Configuração do Supabase

O banco é self-hosted. Pra rodar isso do zero (ou revisar o que já está no ar):

1. **Rode `supabase-schema.sql` inteiro** no SQL Editor do Supabase (Studio,
   self-hosted). Ele cria as tabelas e já vem com as políticas de RLS certas —
   público só insere resposta/agendamento e lê closers ativos e horários
   ocupados (sem nome/telefone/e-mail de ninguém); ler dados de lead exige
   estar autenticado.
2. **Crie pelo menos um usuário admin** em Studio → Authentication → Users →
   Add user (e-mail + senha). É esse login que abre em `admin.html` — não tem
   painel de convite nem cadastro público de propósito.
3. **Troque o `JWT_SECRET` da instância antes de ir ao ar de verdade.**
   `supabase-client.js` está com a chave `anon` de **demonstração** do
   Supabase self-hosted (é pública, documentada no repositório oficial —
   `"iss": "supabase-demo"` no payload do JWT). Se o `JWT_SECRET` do servidor
   ainda for o padrão de exemplo, qualquer pessoa consegue forjar um token
   `service_role` válido e ignorar todo o RLS. Trocar o `JWT_SECRET`, reiniciar
   a stack, gerar chaves novas a partir dele, e atualizar essas chaves em todo
   lugar que já usa as antigas (`supabase-client.js`, a credencial no n8n).

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
| `painel.html` + `painel.js` | Cinco abas: Respostas, Funil, Links e UTMs, Agenda do time, Critérios |
| `funil-painel.js` | A aba **Funil**: passagem de etapa, respostas, tempo por etapa, funil por criativo e eventos ao vivo. Monta e desmonta como componente (`montarFunil`/`desmontar`) |
| `funil-dados.js` | Leitura do Supabase de **analytics** por REST direto. Não passa pelo `db.js` — é outro banco, ver `funil-config.js` |
| `funil-controles.js` | Dropdown e seletor de período da aba Funil, com calendário próprio |
| `funil-config.js` | URL + chave `anon` do Supabase de analytics (o segundo banco) |
| `funil.css` | Estilos da aba Funil, todos escopados em `.aba-funil`. Separado do `style.css` de propósito — leia o cabeçalho do arquivo |
| `admin.html` + `admin.js` | Tela de senha para entrar no painel. Não é linkada em nenhuma página pública |
| `admin-auth.js` | Guarda de acesso do painel — leia o comentário no topo antes de confiar nisso |

### Compartilhado

| Arquivo | Função |
|---|---|
| `scoring.js` | **O modelo inteiro.** Perguntas, pesos, classes, escada, cálculo e render do resultado |
| `db.js` | Camada de dados. Supabase de verdade, por trás da mesma interface `async { data, error }` de sempre |
| `supabase-client.js` | Cria o client do Supabase **self-hosted** (URL + chave `anon`) usado por `db.js` e `admin-auth.js` |
| `adv-track.js` | Telemetria de passagem de etapa. Escreve em `funil_eventos`, no Supabase de **analytics** — o mesmo que a aba Funil lê |
| `agenda-core.js` | Geração de horários, disponibilidade e sorteio de closer |
| `util.js` | `esc()` e formatação de telefone, usados em mais de uma tela |
| `supabase-schema.sql` | DDL das tabelas + políticas de RLS. Rode no SQL Editor do Supabase |
| `style.css` | Estilos de tudo, menos a aba Funil (essa mora em `funil.css`) |
| `og.png` | Imagem de preview de link (1200×630) |

### Sobre a tabela `forms_adv`

A aba **Respostas** do painel lê de `public.forms_adv`, não da tabela `respostas`
do `supabase-schema.sql`. `forms_adv` não é criada por este repositório: é
alimentada pelo workflow do n8n que recebe o webhook (`resposta.criada`), numa
tabela mais simples — uma coluna de texto por pergunta do quiz, mais
`Score`/`Classe`/`Degrau`/`Qualidade`/`Area`/`Perfil` já calculados. O painel
reconstrói os pontos por critério (pra desenhar as barras da nota) casando cada
coluna com as opções de `PERGUNTAS` em `scoring.js` — mesma técnica de sempre,
sem duplicar as regras do modelo.

O site continua gravando em `respostas` normalmente (é o que `db.criarResposta`
em `db.js` faz), e a aba **Links e UTMs** ainda lê dessa tabela pra casar leads
com os links de campanha — só a aba Respostas migrou pra `forms_adv`. Se
`forms_adv` virar a fonte de verdade em definitivo, os dois pontos citados
acima (o insert em `respostas` e a leitura em Links) precisam ser revisitados
também, senão as duas tabelas seguem divergindo.

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

### 1. Banco de dados — feito

`db.js` usa Supabase de verdade (self-hosted). O que falta não é código, é
operação: ver [Configuração do Supabase](#configuração-do-supabase) acima —
principalmente **trocar o `JWT_SECRET`**, que hoje ainda é o de demonstração.

### 2. Fuso horário — feito

Fixo em `America/Sao_Paulo` (via `Intl` com `timeZone` explícito), independente
do fuso do navegador de quem agenda ou bloqueia horário no painel.

### 3. Integrações

- **Webhook — feito.** `dispararWebhook()` em `db.js` dispara para o n8n (evento
  `resposta.criada` ao fim do quiz, `agendamento.criado` ao confirmar
  agendamento) e grava o log em `webhook_log` no Supabase.
- **Google Calendar:** o agendamento não cria evento na agenda de ninguém. Precisa
  de OAuth por closer e criação do evento com link de videochamada.
- **E-mail e WhatsApp:** a confirmação é prometida ao lead na tela, mas nada é
  enviado. Precisa de confirmação imediata e lembrete antes da call — dá pra
  plugar isso no workflow do n8n que já recebe o webhook.

### 4. Autenticação — feito, com uma pendência séria

`painel.html` exige login de verdade via Supabase Auth (`admin.html`) e não é
mais linkado em nenhuma página pública. As tabelas com dado de lead
(`respostas`, `agendamentos`, `links`, `webhook_log`) só liberam leitura para
quem está autenticado — ver as políticas em `supabase-schema.sql`.

**Mas:** a chave `anon` em `supabase-client.js` é a de demonstração pública do
Supabase self-hosted. Enquanto o `JWT_SECRET` do servidor não for trocado do
padrão, esse login é decorativo — dá pra forjar um token `service_role` e ler
tudo direto pela API, ignorando o RLS inteiro. Isso é o item mais urgente da
lista, na prática, mesmo estando na seção de "autenticação".

### 5. Placeholders

- **Nomes dos closers:** a tabela `closers` no Supabase tem "Closer 1, 2, 3"
  (era `CLOSERS` em `db.js`; agora é uma linha em cada tabela, edite lá).
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

1. **Trocar o `JWT_SECRET` do Supabase** (ver Configuração do Supabase) — sem
   isso, o login do painel e o RLS são decorativos
2. Google Calendar + confirmação por e-mail e WhatsApp
3. Colunas de desfecho
4. Substituir os placeholders

Supabase, fuso horário e autenticação já saíram da lista de simulação. O
item 1 aqui é o que falta pra essa autenticação valer alguma coisa de verdade.
O item 3 é o que faz o scoring deixar de ser chute.
