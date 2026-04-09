require('dotenv').config();
const { chromium } = require('playwright');
const fs = require('fs');

const TARGET_ORIGIN = 'GRU';
const TARGET_DEST   = 'MIA';
const TARGET_DATE   = (() => {
  const d = new Date();
  d.setDate(d.getDate() + 45);
  return d.toISOString().split('T')[0];
})();

const capturedRequests  = [];
const capturedResponses = [];

async function intercept() {
  console.log('Iniciando interceptacao...');
  console.log('Destino: ' + TARGET_ORIGIN + ' > ' + TARGET_DEST + ' em ' + TARGET_DATE);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });

  const page = await context.newPage();

  // Captura requests relevantes
  page.on('request', (req) => {
    const url = req.url();
    if (
      url.includes('api.smiles') ||
      url.includes('/v1/airlines') ||
      url.includes('/v2/airlines') ||
      url.includes('cognito') ||
      url.includes('amazonaws.com/oauth2') ||
      url.includes('smiles.com.br/api')
    ) {
      capturedRequests.push({
        url,
        method: req.method(),
        headers: req.headers(),
        postData: req.postData() || null
      });
      console.log('>> ' + req.method() + ' ' + url);
    }
  });

  // Captura respostas relevantes
  page.on('response', async (res) => {
    const url = res.url();
    if (
      url.includes('api.smiles') ||
      url.includes('/v1/airlines') ||
      url.includes('/v2/airlines') ||
      url.includes('cognito') ||
      url.includes('amazonaws.com/oauth2')
    ) {
      try {
        const body = await res.text();
        capturedResponses.push({ url, status: res.status(), body: body.substring(0, 3000) });
        console.log('<< ' + res.status() + ' ' + url);
      } catch (_) {}
    }
  });

  // Abre o site
  console.log('\nAbrindo smiles.com.br...');
  try {
    await page.goto('https://www.smiles.com.br', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
  } catch (e) {
    console.log('Site demorou mas continuando...');
  }

  await page.waitForTimeout(3000);

  // Tenta clicar em login
  console.log('Tentando clicar em Acessar conta...');
  try {
    const btn = page.locator('text=Acessar conta').first();
    if (await btn.isVisible({ timeout: 5000 })) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  } catch (_) {
    // tenta navegar direto para login
    try {
      await page.goto('https://login.smiles.com.br', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
    } catch (_) {}
  }

  await page.waitForTimeout(2000);

  // Tenta preencher login automaticamente
  console.log('Preenchendo login...');
  try {
    const cpfInput = page.locator('input').first();
    await cpfInput.fill(process.env.SMILES_EMAIL, { timeout: 5000 });
    await page.waitForTimeout(800);

    const continueBtn = page.locator('button:has-text("Continuar")').first();
    if (await continueBtn.isVisible({ timeout: 3000 })) {
      await continueBtn.click();
      await page.waitForTimeout(2000);
    }

    const passInput = page.locator('input[type="password"]').first();
    await passInput.fill(process.env.SMILES_PASSWORD, { timeout: 5000 });
    await page.waitForTimeout(500);

    const submitBtn = page.locator('button:has-text("Continuar")').first();
    await submitBtn.click();
    console.log('Login submetido!');
  } catch (e) {
    console.log('Login auto falhou: ' + e.message);
  }

  // Aguarda MFA (codigo SMS) - voce tem 90 segundos para digitar
  console.log('\n========================================');
  console.log('SE PEDIU CODIGO SMS: digite na janela!');
  console.log('Aguardando 90 segundos...');
  console.log('========================================\n');
  await page.waitForTimeout(90000);

  // Navega para busca de voos
  const searchUrl = 'https://www.smiles.com.br/emission?originAirportCode=' + TARGET_ORIGIN +
    '&destinationAirportCode=' + TARGET_DEST +
    '&departureDate=' + TARGET_DATE.replace(/-/g, '') +
    '&adults=1&children=0&infants=0&tripType=1&cabinType=all&currencyCode=BRL';

  console.log('Navegando para busca de voos...');
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    console.log('Timeout na busca, continuando...');
  }

  await page.waitForTimeout(12000);
  await page.evaluate(() => window.scrollBy(0, 600));
  await page.waitForTimeout(5000);

  // Captura tokens do localStorage
  const tokens = await page.evaluate(() => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const val = localStorage.getItem(key);
      if (key && (key.includes('Cognito') || key.includes('token') || key.includes('Token'))) {
        data[key] = val;
      }
    }
    return data;
  });

  const cookies = await context.cookies();

  const report = {
    capturedAt: new Date().toISOString(),
    tokens,
    relevantCookies: cookies.filter(c => c.domain.includes('smiles')),
    requests: capturedRequests,
    responses: capturedResponses,
  };

  fs.writeFileSync('intercept-report.json', JSON.stringify(report, null, 2));

  console.log('\n=== RESULTADO ===');
  console.log('Requests capturados: ' + capturedRequests.length);
  console.log('Tokens encontrados: ' + Object.keys(tokens).length);

  const flightReqs = capturedRequests.filter(r =>
    r.url.includes('airline') || r.url.includes('flight') || r.url.includes('miles') || r.url.includes('search')
  );

  if (flightReqs.length > 0) {
    console.log('\nENDPOINTS DE VOO ENCONTRADOS:');
    flightReqs.forEach(r => console.log('  ' + r.method + ' ' + r.url));
  } else {
    console.log('\nNenhum endpoint de voo capturado ainda.');
  }

  console.log('\nRelatorio salvo: intercept-report.json');
  await browser.close();
}

intercept().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
