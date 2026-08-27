/* Conversions API da Meta — Advocacia de Impacto
   ------------------------------------------------------------------
   Espelho no servidor do que o meta-pixel.js dispara no navegador.
   Existe por dois motivos concretos:

   1. Adblock e ITP derrubam o fbq. O que sai daqui não depende de o
      navegador cooperar, então a conversão chega mesmo assim — e é a
      conversão `EndForm` que as campanhas desta conta otimizam.
   2. Só o servidor enxerga IP, user agent e a geolocalização. A borda
      da Vercel carimba país, região, cidade e CEP em TODO request, sem
      geoip contratado e sem pedir permissão de localização ao lead.

   O event_id vem do navegador e é reenviado igual. É isso, e só isso,
   que faz a Meta entender que o evento do pixel e o daqui são o mesmo.
   Sem ele, cada conversão contaria dobrado e o CPA da conta mentiria
   pela metade.

   Formato CommonJS de propósito: o projeto é estático e não tem
   package.json. Sem `"type": "module"` declarado, a Vercel trata .js
   como CommonJS — usar import/export aqui quebraria em runtime.
   ------------------------------------------------------------------ */

const { createHash } = require('node:crypto');

const PIXEL_ID = process.env.META_PIXEL_ID || '258198390510374';
const VERSAO_API = 'v21.0';
const ENDPOINT = `https://graph.facebook.com/${VERSAO_API}/${PIXEL_ID}/events`;

const TOKEN = process.env.META_CAPI_TOKEN || '';

/* O código de teste sai SÓ da variável de ambiente, nunca do corpo da
   requisição. Evento marcado como teste é desviado para a aba Test
   Events e não conta para a otimização — se o navegador pudesse pedir
   isso, bastava alguém abrir o site com o parâmetro certo para apagar
   conversões reais da conta. */
const CODIGO_TESTE = process.env.META_TEST_EVENT_CODE || '';

/* ---------- normalização e hash ---------- */

const sha256 = v => createHash('sha256').update(v, 'utf8').digest('hex');

/* A Meta exige o PII normalizado ANTES do hash: " Ana@X.com " e
   "ana@x.com" geram hashes completamente diferentes e o match falha
   em silêncio, sem erro nenhum na resposta. Cada campo tem sua regra. */
const texto = v => String(v ?? '').trim().toLowerCase();

/* Cidade, estado, CEP e país caem para a-z0-9 sem acento — é o que o
   SDK oficial da Meta faz com esses campos ("São Paulo" -> "sopaulo").
   Parece perda de informação, mas é justamente o contrário: a Meta
   normaliza a cidade do perfil do usuário do mesmo jeito antes de
   comparar. Manter o acento aqui geraria um hash que nunca casa. */
const alfanum = v => texto(v).replace(/[^a-z0-9]/g, '');

const digitos = v => String(v ?? '').replace(/\D/g, '');

// nome mantém letra acentuada (é dado válido em UTF-8 para a Meta) e
// perde só espaço e pontuação
const nome = v => texto(v).replace(/[^\p{L}\p{N}]/gu, '');

/* Mesmo E.164 que o meta-pixel.js aplica antes de mandar. Repetido aqui
   de propósito: a Meta descarta o match de telefone sem código de país,
   e o servidor não pode depender de o navegador ter normalizado direito
   — basta um cliente antigo em cache para o `ph` virar lixo silencioso.
   O teste de tamanho evita quebrar o DDD 55 (Santa Maria), que já
   começa com 55 e viraria 5555... se prefixássemos no escuro. */
function telefone(v) {
  const n = digitos(v);
  if (n.length === 10 || n.length === 11) return '55' + n;
  return n;
}

const comHash = (valor, preparar) => {
  const limpo = preparar(valor);
  return limpo ? sha256(limpo) : null;
};

/* ---------- dados que só o servidor tem ---------- */

function cabecalho(req, nome) {
  const v = req.headers?.[nome];
  return Array.isArray(v) ? v[0] : v || '';
}

/* Geolocalização carimbada pela borda da Vercel. A cidade vem
   percent-encoded ("S%C3%A3o%20Paulo"), então decodifica antes de
   normalizar, senão o hash sai do texto errado.
   Latitude e longitude também chegam nos cabeçalhos, mas o user_data
   da Meta não tem campo para coordenada — o alcance geográfico que ela
   usa vem de ct/st/zp/country. Por isso as duas ficam de fora. */
function geoDaBorda(req) {
  let cidade = cabecalho(req, 'x-vercel-ip-city');
  try { cidade = decodeURIComponent(cidade); } catch { /* já veio decodificada */ }

  const geo = {
    ct: alfanum(cidade) || null,
    st: alfanum(cabecalho(req, 'x-vercel-ip-country-region')) || null,
    zp: alfanum(cabecalho(req, 'x-vercel-ip-postal-code')) || null,
    country: alfanum(cabecalho(req, 'x-vercel-ip-country')) || null
  };
  Object.keys(geo).forEach(k => { if (!geo[k]) delete geo[k]; });
  return geo;
}

/* x-forwarded-for chega como "cliente, proxy1, proxy2": o primeiro é o
   IP real de quem navegou, os demais são saltos da própria borda.
   IP e user agent vão em claro de propósito — são os dois únicos campos
   de user_data que a Meta NÃO aceita hasheados. */
function ipDoCliente(req) {
  const cadeia = cabecalho(req, 'x-forwarded-for').split(',')[0].trim();
  return cadeia || cabecalho(req, 'x-real-ip') || null;
}

function corpoDaRequisicao(req) {
  const b = req.body;
  if (!b) return {};
  if (typeof b === 'string') { try { return JSON.parse(b); } catch { return {}; } }
  if (Buffer.isBuffer(b)) { try { return JSON.parse(b.toString('utf8')); } catch { return {}; } }
  return b;
}

/* ---------- handler ---------- */

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, erro: 'método não permitido' });
  }

  // A geo é devolvida mesmo quando o envio falha: o navegador usa ela
  // para enriquecer o Advanced Matching do próprio pixel.
  const geo = geoDaBorda(req);

  try {
    const corpo = corpoDaRequisicao(req);
    const evento = String(corpo.event_name || '').trim();
    const eventId = String(corpo.event_id || '').trim();

    if (!evento || !eventId) {
      return res.status(200).json({ ok: false, geo, erro: 'evento sem nome ou sem event_id' });
    }

    /* Relógio de celular desregulado existe, e a Meta rejeita evento
       com data no futuro ou muito velho. Se o horário do navegador
       estiver longe do nosso, o do servidor manda. */
    const agora = Math.floor(Date.now() / 1000);
    const doCliente = Number(corpo.event_time);
    const quando = Number.isFinite(doCliente) && Math.abs(agora - doCliente) < 300 ? doCliente : agora;

    const u = corpo.user || {};
    const user_data = {
      em: comHash(u.em, texto),
      ph: comHash(u.ph, telefone),
      fn: comHash(u.fn, nome),
      ln: comHash(u.ln, nome),
      ct: comHash(geo.ct, alfanum),
      st: comHash(geo.st, alfanum),
      zp: comHash(geo.zp, digitos),
      country: comHash(geo.country, alfanum),
      external_id: comHash(corpo.external_id, texto),
      fbp: corpo.fbp || null,
      fbc: corpo.fbc || null,
      client_ip_address: ipDoCliente(req),
      client_user_agent: cabecalho(req, 'user-agent') || null
    };
    Object.keys(user_data).forEach(k => { if (!user_data[k]) delete user_data[k]; });

    const payload = {
      data: [{
        event_name: evento,
        event_time: quando,
        event_id: eventId,
        event_source_url: corpo.event_source_url || null,
        action_source: corpo.action_source || 'website',
        user_data,
        ...(corpo.custom_data ? { custom_data: corpo.custom_data } : {})
      }],
      access_token: TOKEN
    };
    if (CODIGO_TESTE) payload.test_event_code = CODIGO_TESTE;

    if (!TOKEN) {
      // Sem token não há o que enviar, mas o lead não pode nem perceber.
      console.error('[meta-capi] META_CAPI_TOKEN ausente — evento descartado:', evento);
      return res.status(200).json({ ok: false, geo, erro: 'sem token' });
    }

    /* AbortSignal.timeout para a função não ficar pendurada esperando a
       Meta. Rastreamento atrasado não vale segurar recurso de servidor. */
    const resposta = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000)
    });
    const json = await resposta.json().catch(() => null);

    if (!resposta.ok) {
      console.error('[meta-capi] Meta recusou', evento, resposta.status, JSON.stringify(json));
      return res.status(200).json({ ok: false, geo, erro: json?.error?.message || 'recusado' });
    }

    return res.status(200).json({
      ok: true,
      geo,
      events_received: json?.events_received ?? null,
      fbtrace_id: json?.fbtrace_id ?? null
    });
  } catch (e) {
    /* Nada aqui pode virar exceção visível: o cadastro do lead já foi
       gravado antes desta chamada e não pode ser afetado por um erro de
       rastreamento. Erro vira log, e a resposta continua 200. */
    console.error('[meta-capi] falhou, seguindo assim mesmo:', e);
    return res.status(200).json({ ok: false, geo, erro: 'excecao' });
  }
};
