/**
 * auth.js
 * ─────────────────────────────────────────────────────────────
 * Login na Smiles via Playwright Stealth.
 * Captura o token JWT do Cognito e salva no Redis com TTL.
 * Reutiliza o token enquanto válido — só reloga se expirar.
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { chromium } = require('playwright');
const redis = require('./redis-client');

const REDIS_KEY_TOKEN    = 'smiles:jwt:access_token';
const REDIS_KEY_ID_TOKEN = 'smiles:jwt:id_token';
const REDIS_KEY_COOKIES  = 'smiles:cookies';
const TOKEN_TTL_SECONDS  = 3000; // ~50 min (tokens Cognito duram ~60min)

// ── Stealth headers para parecer browser humano ──────────────
const BROWSER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-blink-features=AutomationControlled',
  '--disable-features=IsolateOrigins,site-per-process',
  '--window-size=1366,768',
];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

/**
 * Retorna os tokens ativos (do Redis ou fazendo novo login).
 * @returns {{ accessToken, idToken, cookies }}
 */
async function getTokens() {
  // 1. Tenta Redis primeiro
  const cached = await getCachedTokens();
  if (cached) {
    console.log('[auth] ✅ Token válido no Redis, reutilizando.');
    return cached;
  }

  // 2. Faz login completo
  console.log('[auth] 🔐 Token expirado ou ausente. Fazendo login na Smiles...');
  return await doLogin();
}

/**
 * Lê tokens do Redis. Retorna null se não existir ou expirado.
 */
async function getCachedTokens() {
  try {
    const [accessToken, idToken, cookiesRaw] = await Promise.all([
      redis.get(REDIS_KEY_TOKEN),
      redis.get(REDIS_KEY_ID_TOKEN),
      redis.get(REDIS_KEY_COOKIES),
    ]);

    if (!accessToken || !idToken) return null;

    const cookies = cookiesRaw ? JSON.parse(cookiesRaw) : [];
    return { accessToken, idToken, cookies };
  } catch (err) {
    console.error('[auth] Erro ao ler Redis:', err.message);
    return null;
  }
}

/**
 * Faz login completo via Playwright e salva tokens no Redis.
 */
async function doLogin() {
  const browser = await chromium.launch({
    headless: true,
    args: BROWSER_ARGS,
  });

  let accessToken = null;
  let idToken = null;

  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    extraHTTPHeaders: {
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    },
  });

  const page = await context.newPage();

  // Esconde o webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    window.chrome = { runtime: {} };
  });

  // Intercepta respostas do Cognito para capturar tokens
  page.on('response', async (res) => {
    const url = res.url();
    if (url.includes('cognito') || url.includes('amazonaws.com/oauth2/token') || url.includes('/oauth2/token')) {
      try {
        const body = await res.json();
        if (body.access_token) {
          accessToken = body.access_token;
          console.log('[auth] 🎯 access_token capturado via Cognito response');
        }
        if (body.id_token) {
          idToken = body.id_token;
          console.log('[auth] 🎯 id_token capturado via Cognito response');
        }
      } catch (_) {}
    }
  });

  try {
    // Abre página de login
    await page.goto('https://www.smiles.com.br', {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await humanDelay(1500, 2500);

    // Clica no botão de login
    await clickLogin(page);
    await humanDelay(1000, 2000);

    // Preenche credenciais
    await fillEmail(page);
    await humanDelay(500, 1000);
    await fillPassword(page);
    await humanDelay(300, 700);

    // Submete
    await submitLogin(page);
    await page.waitForTimeout(5000);

    // Fallback: busca tokens no localStorage se não capturou via response
    if (!accessToken || !idToken) {
      const lsTokens = await extractTokensFromLocalStorage(page);
      accessToken = lsTokens.accessToken || accessToken;
      idToken = lsTokens.idToken || idToken;
    }

    if (!accessToken) {
      throw new Error('Login falhou: token não encontrado após tentativa de login');
    }

    // Salva cookies
    const cookies = await context.cookies();
    const smilesCookies = cookies.filter(c => c.domain.includes('smiles'));

    // Persiste no Redis
    await Promise.all([
      redis.set(REDIS_KEY_TOKEN, accessToken, { EX: TOKEN_TTL_SECONDS }),
      redis.set(REDIS_KEY_ID_TOKEN, idToken || '', { EX: TOKEN_TTL_SECONDS }),
      redis.set(REDIS_KEY_COOKIES, JSON.stringify(smilesCookies), { EX: TOKEN_TTL_SECONDS }),
    ]);

    console.log('[auth] ✅ Login bem-sucedido. Tokens salvos no Redis.');
    return { accessToken, idToken, cookies: smilesCookies };

  } finally {
    await browser.close();
  }
}

/**
 * Tenta clicar no botão de login da Smiles.
 */
async function clickLogin(page) {
  const selectors = [
    'button[class*="login"]',
    'a[href*="login"]',
    '[data-testid*="login"]',
    'button:has-text("Entrar")',
    'a:has-text("Entrar")',
    '.login-button',
    '#login-button',
  ];

  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        return;
      }
    } catch (_) {}
  }

  // Se não achou botão, tenta navegar direto para a página de login
  await page.goto('https://www.smiles.com.br/login', {
    waitUntil: 'domcontentloaded',
    timeout: 20000,
  });
}

async function fillEmail(page) {
  const selectors = [
    'input[type="email"]',
    'input[name="email"]',
    'input[placeholder*="e-mail" i]',
    'input[id*="email" i]',
    '#username',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.fill(process.env.SMILES_EMAIL);
        return;
      }
    } catch (_) {}
  }
  throw new Error('Campo de email não encontrado');
}

async function fillPassword(page) {
  const el = page.locator('input[type="password"]').first();
  await el.fill(process.env.SMILES_PASSWORD, { timeout: 8000 });
}

async function submitLogin(page) {
  const selectors = [
    'button[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Login")',
    'input[type="submit"]',
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 3000 })) {
        await el.click();
        return;
      }
    } catch (_) {}
  }
}

/**
 * Extrai tokens do localStorage (fallback se Cognito response não capturar).
 */
async function extractTokensFromLocalStorage(page) {
  return await page.evaluate(() => {
    let accessToken = null;
    let idToken = null;

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.includes('CognitoIdentityServiceProvider')) {
        if (key.endsWith('.accessToken')) accessToken = localStorage.getItem(key);
        if (key.endsWith('.idToken')) idToken = localStorage.getItem(key);
      }
    }

    // Fallback: busca qualquer chave com "token"
    if (!accessToken) {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        const val = localStorage.getItem(key);
        if (key && key.toLowerCase().includes('access') && val && val.startsWith('eyJ')) {
          accessToken = val;
        }
      }
    }

    return { accessToken, idToken };
  });
}

/**
 * Delay humano aleatório entre min e max ms.
 */
function humanDelay(min = 500, max = 1500) {
  const ms = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Força um novo login (ignora cache do Redis).
 */
async function forceRelogin() {
  await redis.del(REDIS_KEY_TOKEN);
  await redis.del(REDIS_KEY_ID_TOKEN);
  await redis.del(REDIS_KEY_COOKIES);
  return doLogin();
}

module.exports = { getTokens, forceRelogin };
