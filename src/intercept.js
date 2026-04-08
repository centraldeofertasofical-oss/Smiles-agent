/**
 * intercept.js
 * ─────────────────────────────────────────────────────────────
 * Roda UMA VEZ localmente para mapear os endpoints reais da API
 * interna da Smiles. Salva tudo em intercept-report.json.
 *
 * Como usar:
 *   node src/intercept.js
 *
 * Precisa ter SMILES_EMAIL e SMILES_PASSWORD no .env
 * ─────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

const TARGET_ORIGIN = 'GRU';
const TARGET_DEST   = 'MIA';
const TARGET_DATE   = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 45); // busca 45 dias à frente
  return d.toISOString().split('T')[0];
})();

const capturedRequests = [];
const capturedResponses = [];

async function intercept() {
  console.log('🔍 Iniciando interceptação da API Smiles...');
  console.log(`   Destino de teste: ${TARGET_ORIGIN} → ${TARGET_DEST} em ${TARGET_DATE}\n`);

  const browser = await chromium.launch({
    headless: false, // deixa visível para você acompanhar e fazer login manual se precisar
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = await context.newPage();

  // ── Intercepta TODOS os requests XHR/fetch ──────────────────
  page.on('request', (req) => {
    const url = req.url();
    const method = req.method();
    const headers = req.headers();
    const postData = req.postData();

    // Filtra só APIs relevantes (ignora CDN, analytics, etc.)
    if (
      url.includes('api.smiles') ||
      url.includes('smiles.com.br/api') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/flights') ||
      url.includes('/miles') ||
      url.includes('/search') ||
      url.includes('cognito') ||
      url.includes('amazonaws.com')
    ) {
      const entry = { url, method, headers, postData: postData || null };
      capturedRequests.push(entry);
      console.log(`📤 ${method} ${url}`);
    }
  });

  // ── Intercepta as respostas ──────────────────────────────────
  page.on('response', async (res) => {
    const url = res.url();
    if (
      url.includes('api.smiles') ||
      url.includes('smiles.com.br/api') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/flights') ||
      url.includes('/miles') ||
      url.includes('/search')
    ) {
      try {
        const body = await res.text();
        const status = res.status();
        capturedResponses.push({ url, status, body: body.substring(0, 2000) }); // primeiros 2000 chars
        console.log(`📥 ${status} ${url}`);
      } catch (_) {}
    }
  });

  // ── Abre a Smiles ────────────────────────────────────────────
  await page.goto('https://www.smiles.com.br', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(2000);

  // ── Tenta login automático ───────────────────────────────────
  console.log('\n🔐 Tentando login automático...');
  try {
    // Clica no botão de login
    const loginBtn = page.locator('button[class*="login"], a[href*="login"], [data-testid*="login"]').first();
    if (await loginBtn.isVisible({ timeout: 5000 })) {
      await loginBtn.click();
      await page.waitForTimeout(1500);
    }

    // Preenche email
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="e-mail" i], input[placeholder*="email" i]').first();
    await emailInput.fill(process.env.SMILES_EMAIL, { timeout: 8000 });
    await page.waitForTimeout(800);

    // Preenche senha
    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(process.env.SMILES_PASSWORD);
    await page.waitForTimeout(800);

    // Submete
    const submitBtn = page.locator('button[type="submit"]').first();
    await submitBtn.click();
    await page.waitForTimeout(3000);

    console.log('✅ Login submetido. Aguardando redirecionamento...');
  } catch (e) {
    console.log('⚠️  Login automático falhou. Faça o login manualmente na janela aberta.');
    console.log('   Após logar, a busca será feita automaticamente.\n');
  }

  // ── Aguarda estar logado (até 60s para login manual se necessário) ──
  await page.waitForTimeout(5000);

  // ── Navega para busca de voos por milhas ────────────────────
  console.log(`\n✈️  Buscando voos: ${TARGET_ORIGIN} → ${TARGET_DEST} em ${TARGET_DATE}...`);
  const searchUrl = `https://www.smiles.com.br/emission?originAirportCode=${TARGET_ORIGIN}&destinationAirportCode=${TARGET_DEST}&departureDate=${TARGET_DATE}&adults=${1}&children=0&infants=0&isFlexibleDateChecked=false&tripType=1&cabinType=all&currencyCode=BRL`;

  await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 45000 });
  await page.waitForTimeout(8000); // aguarda lazy loading dos resultados

  // Scroll para garantir carregamento
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(3000);

  // ── Captura cookies e localStorage (tokens) ─────────────────
  const cookies = await context.cookies();
  const localStorage = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      data[key] = window.localStorage.getItem(key);
    }
    return data;
  });

  // Filtra tokens JWT do localStorage
  const tokens = {};
  for (const [key, value] of Object.entries(localStorage)) {
    if (key.includes('CognitoIdentityServiceProvider') || key.includes('token') || key.includes('Token')) {
      tokens[key] = value;
    }
  }

  // ── Salva relatório completo ─────────────────────────────────
  const report = {
    capturedAt: new Date().toISOString(),
    searchTested: { origin: TARGET_ORIGIN, destination: TARGET_DEST, date: TARGET_DATE },
    tokens,
    relevantCookies: cookies.filter(c => c.domain.includes('smiles')),
    requests: capturedRequests,
    responses: capturedResponses,
  };

  fs.writeFileSync('intercept-report.json', JSON.stringify(report, null, 2));
  console.log('\n✅ Relatório salvo em: intercept-report.json');
  console.log(`   ${capturedRequests.length} requests capturados`);
  console.log(`   ${capturedResponses.length} responses capturadas`);
  console.log(`   ${Object.keys(tokens).length} tokens encontrados no localStorage\n`);

  // Identifica o endpoint de busca de voos
  const flightEndpoints = capturedRequests.filter(r =>
    r.url.includes('flight') || r.url.includes('miles') || r.url.includes('search') || r.url.includes('emission')
  );

  if (flightEndpoints.length > 0) {
    console.log('🎯 ENDPOINTS DE VOO IDENTIFICADOS:');
    flightEndpoints.forEach(r => {
      console.log(`   ${r.method} ${r.url}`);
    });
  }

  await browser.close();
  console.log('\n📋 Próximo passo: revise o intercept-report.json e me envie os endpoints encontrados.');
}

intercept().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
