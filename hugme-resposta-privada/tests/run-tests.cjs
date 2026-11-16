// Testes sem envio real: o HugMe é a página simulada tests/mock-hugme.html servida no endereço https://app.hugme.com.br/app.html
// (interceptado pelo Playwright; nada sai para a internet). O bookmarklet é executado pelo link do instalador gerado (dist/).
// Uso: node build.cjs && node tests/run-tests.cjs [planilha-real.xlsx opcional, só leitura]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const MOCK = fs.readFileSync(path.join(__dirname, 'mock-hugme.html'), 'utf8');
const INSTALLER = path.join(ROOT, 'dist/instalar-hugme-resposta-privada.html');
const TEMPLATE_FILE = fs.readFileSync(path.join(ROOT, 'docs/mensagem-modelo.txt'), 'utf8');
const MAPA = fs.readFileSync(path.join(ROOT, 'docs/MAPA-JS.txt'), 'utf8');
const REAL = process.argv[2];
const results = [];
let failures = 0;
async function test(name, fn) {
  try { await fn(); results.push(['OK', name]); console.log('OK   ' + name); }
  catch (e) { failures++; results.push(['FALHOU', name, e.message]); console.log('FALHOU ' + name + '\n     ' + e.message); }
}
function assert(c, msg) { if (!c) throw Error(msg); }
function eq(a, b, msg) { if (a !== b) throw Error((msg || 'diferente') + '\n     esperado: ' + JSON.stringify(b) + '\n     obtido:   ' + JSON.stringify(a)); }

// Mensagem esperada, montada aqui de forma independente a partir do arquivo literal.
const expected = v => TEMPLATE_FILE.split('[Nome do Cliente]').join('\u0000N').split('{Especialista}').join('\u0000E').split('{xx xxxx-xxxx}').join('\u0000P')
  .split('\u0000N').join(v.name).split('\u0000E').join(v.specialist).split('\u0000P').join(v.phone);
// Confere contra o modelo: tudo fora dos placeholders igual, e cada placeholder com o valor esperado.
function matchesTemplate(text, v) {
  const parts = TEMPLATE_FILE.split(/(\[Nome do Cliente\]|\{Especialista\}|\{xx xxxx-xxxx\})/);
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^' + parts.map((p, i) => i % 2 ? '([\\s\\S]*?)' : esc(p)).join('') + '$');
  const m = re.exec(text); if (!m) return 'texto fixo difere do modelo';
  const want = { '[Nome do Cliente]': v.name, '{Especialista}': v.specialist, '{xx xxxx-xxxx}': v.phone };
  const ph = parts.filter((_, i) => i % 2);
  for (let i = 0; i < ph.length; i++) if (m[i + 1] !== want[ph[i]]) return ph[i] + ' = ' + JSON.stringify(m[i + 1]);
  return null;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 1 });
  await ctx.route('https://app.hugme.com.br/**', r => r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: MOCK }));

  // Link do favorito como o navegador o vê no instalador (atributo HTML decodificado).
  const inst = await ctx.newPage();
  await inst.goto('file://' + INSTALLER);
  const href = await inst.locator('a.bm').getAttribute('href');
  const manual = await inst.locator('textarea').inputValue();
  await inst.close();

  async function openHugMe(mock = {}) {
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    page.on('pageerror', e => console.log('     [erro na página] ' + e.message));
    await page.addInitScript(m => { window.__mock = m; }, { map: {}, scenario: 'ok', ...mock });
    await page.goto('https://app.hugme.com.br/app.html#/tickets/minha-lista/p1/');
    await page.evaluate(() => localStorage.clear());
    await page.evaluate(h => { location.href = h; }, href); // executa o favorito: decodificação real do javascript:
    await page.waitForFunction(() => window.__hugmePrivada && window.__hugmePrivada.core);
    return page;
  }
  const panel = page => page.locator('#hugme-privada-host');
  async function load(page, file) {
    await panel(page).locator('#file').setInputFiles(path.join(__dirname, 'fixtures', file));
    await panel(page).locator('#tbody tr').first().waitFor();
  }
  const rowsText = page => panel(page).locator('#tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
  async function runAndWait(page, modeValue, until) {
    await panel(page).locator('input[value=' + modeValue + ']').check();
    await panel(page).locator('#start').click();
    await page.waitForFunction(until || (() => { const r = document.querySelector('#hugme-privada-host').shadowRoot; return r.getElementById('start').textContent !== 'Em execução…' && !r.getElementById('stop').disabled === false; }), null, { timeout: 120000 });
  }
  const idle = () => { const r = document.querySelector('#hugme-privada-host').shadowRoot; return r.getElementById('stop').disabled; };

  await test('Instalador: link javascript: e instalação manual decodificam para o mesmo código', async () => {
    assert(href.startsWith('javascript:'), 'href não começa com javascript:');
    eq(manual, href, 'textarea manual difere do link');
    const src = fs.readFileSync(path.join(ROOT, 'src/bookmarklet.js'), 'utf8');
    eq(decodeURIComponent(href.slice(11)), src, 'decodificação do link difere do código-fonte');
  });

  const page = await openHugMe();
  await test('Os quatro JS Paths são idênticos aos do mapa (após desfazer só o escape da camada JS)', async () => {
    const fromMap = [...MAPA.matchAll(/JS Path: document\.querySelector\("(.*)"\)$/gm)].map(m => m[1].replace(/\\+"/g, '"'));
    eq(fromMap.length, 4, 'mapa deveria ter 4 JS Paths');
    const P = await page.evaluate(() => window.__hugmePrivada.core.PATHS);
    eq(P.p1, fromMap[0], 'Passo #1'); eq(P.p2, fromMap[1], 'Passo #2'); eq(P.p3, fromMap[2], 'Passo #3'); eq(P.p4, fromMap[3], 'Passo #4');
    eq(P.p3, `ticket-view-response[type="'ra-private-reply'"] > div.response-container > div.response-btn-reply > button.btn-model:nth-child(3)`, 'Passo #3 literal');
    eq(P.p4, `ticket-view-response[type="'ra-private-reply'"] > div.response-container > div.buttons-response > button.btn-undo`, 'Passo #4 literal');
  });
  await test('Modelo da mensagem no código = docs/mensagem-modelo.txt (literal)', async () => {
    eq(await page.evaluate(() => window.__hugmePrivada.core.TEMPLATE), TEMPLATE_FILE);
  });
  await test('Mensagem: um telefone; especialista igual na saudação e na assinatura', async () => {
    const v = { name: 'Maria Teste Ficticia', specialist: 'Joana Exemplo', phone: '11900000001' };
    const msg = await page.evaluate(v => window.__hugmePrivada.core.renderMessage(v), v);
    eq(msg, expected(v)); eq(matchesTemplate(msg, v), null);
    eq(msg.split('Joana Exemplo').length - 1, 2, 'especialista deveria aparecer 2 vezes');
    assert(msg.startsWith('Olá, Maria Teste Ficticia! Aqui é a Joana Exemplo, do Reclame Aqui.') && msg.endsWith('\nFico no aguardo!\nJoana Exemplo'), 'abertura/assinatura');
    assert(msg.includes('agora pouco'), '“agora pouco” preservado');
  });
  await test('Mensagem: dois telefones com ";" na mesma frase, ordem e separador preservados', async () => {
    const v = { name: 'Carlos Ficticio', specialist: 'Joana Exemplo', phone: '11900000002;21900000003' };
    const msg = await page.evaluate(v => window.__hugmePrivada.core.renderMessage(v), v);
    assert(msg.includes('no número 11900000002;21900000003, sem sucesso.'), 'frase com os dois números');
    eq(matchesTemplate(msg, v), null);
  });
  await test('Mensagem: valores com "$" não alteram o texto (sem padrões de substituição)', async () => {
    const v = { name: 'Dolar $1 $& Ficticio', specialist: 'Joana $$ Exemplo', phone: '1' };
    eq(await page.evaluate(v => window.__hugmePrivada.core.renderMessage(v), v), expected(v));
  });
  await test('checkMessage aponta divergência fora dos placeholders', async () => {
    const r = await page.evaluate(() => { const c = window.__hugmePrivada.core, v = { name: 'A', specialist: 'B', phone: '1' }; return [c.checkMessage(c.renderMessage(v), v), c.checkMessage(c.renderMessage(v).replace('agora pouco', 'agora há pouco'), v)]; });
    eq(r[0], null); assert(/linha 3/.test(r[1]), 'deveria apontar a linha 3: ' + r[1]);
  });
  await test('Planilha de casos: cabeçalho na linha 4, grafias encontradas e vínculo pela letra', async () => {
    await load(page, 'casos.xlsx');
    eq(await panel(page).locator('#headerRow').inputValue(), '4');
    const cols = await panel(page).locator('#cols tbody tr').evaluateAll(trs => trs.map(tr => [...tr.cells].map(td => td.textContent)));
    const byLetter = Object.fromEntries(cols.map(c => [c[1], c]));
    assert(byLetter.C[2].startsWith('Id Origem') && byLetter.C[2].includes('grafia diferente'), 'C deveria mostrar "Id Origem" com aviso: ' + byLetter.C[2]);
    assert(byLetter.W[2].startsWith('Telefones') && byLetter.W[2].includes('grafia diferente'), 'W deveria mostrar "Telefones": ' + byLetter.W[2]);
    eq(byLetter.Q[2], 'Nome'); eq(byLetter.AA[2], 'Tags');
  });
  await test('Planilha de casos: colunas intermediárias vazias, telefone numérico com zero à esquerda, linhas incompletas/duplicadas', async () => {
    const r = await rowsText(page);
    const at = n => r.find(x => x[0] === String(n));
    eq(at(7).slice(1, 5).join('|'), '100000003|Lia Sem Colunas|Paula Modelo|31900000004', 'linha 7 (sem colunas intermediárias)');
    eq(at(7)[5], 'Pendente');
    eq(at(6)[4], '11900000002;21900000003', 'linha 6 dois telefones numa linha só');
    eq(r.filter(x => x[1] === '100000002').length, 1, 'dois telefones não viram dois envios');
    eq(at(11)[4], '01190000008', 'telefone numérico com formato 00000000000');
    eq(at(9)[5], 'Incompleta'); eq(at(10)[5], 'Duplicada');
    eq(at(8)[5], 'Revisar especialista'); assert(at(8)[3].includes('escolher'), 'Tags ambígua sem escolha automática');
  });
  await test('Tags ambígua: não escolhe a primeira; operador escolhe e a mensagem usa o nome nas duas posições', async () => {
    await panel(page).locator('#tbody tr', { hasText: '100000004' }).click();
    const pre = await panel(page).locator('#detail pre').count();
    eq(pre, 0, 'sem mensagem antes da escolha');
    await panel(page).locator('#detail select').selectOption('Paula Modelo');
    await panel(page).locator('#detail button', { hasText: 'Aplicar' }).click();
    await panel(page).locator('#tbody tr', { hasText: '100000004' }).click();
    const msg = await panel(page).locator('#detail pre').textContent();
    eq(matchesTemplate(msg, { name: 'Rui Tags Ambiguas', specialist: 'Paula Modelo', phone: '41900000005' }), null);
    const r = await rowsText(page); eq(r.find(x => x[0] === '8')[5], 'Pendente');
  });
  await page.close();

  const MAP = { '200000001': '900000101', '200000002': '900000102', '200000003': '900000103' };
  const ROW = { '900000101': { name: 'Ana Fluxo', specialist: 'Joana Exemplo', phone: '11911110001' }, '900000102': { name: 'Beto Fluxo', specialist: 'Paula Modelo', phone: '11911110002;11911110003' }, '900000103': { name: 'Caio Fluxo', specialist: 'Joana Exemplo', phone: '11911110004' } };

  await test('Simulação: percorre a fila até o passo #4 sem clicar em "Responder privado"', async () => {
    const p = await openHugMe({ map: MAP });
    await load(p, 'fluxo.xlsx'); await runAndWait(p, 'simular', idle);
    const sent = await p.evaluate(() => window.__sent); eq(sent.length, 0, 'nenhum clique de envio');
    const ev = await p.evaluate(() => window.__events.map(e => e.type));
    eq(ev.filter(t => t === 'modelClick').length, 3, 'modelo clicado em cada ticket');
    const r = await rowsText(p); assert(r.every(x => x[5] === 'Simulado'), 'todas simuladas: ' + JSON.stringify(r.map(x => x[5])));
    const ta = await p.evaluate(() => document.querySelector('textarea').value); eq(matchesTemplate(ta, ROW['900000103']), null, 'editor do último ticket');
    eq(await p.evaluate(() => JSON.stringify((JSON.parse(localStorage.getItem('hugme-resposta-privada:v1') || '{}').history) || {})), '{}', 'simulação não grava histórico');
    await p.close();
  });
  await test('Envio (simulado no mock): um clique por ticket, texto do ng-model = modelo literal, dois telefones numa mensagem', async () => {
    const p = await openHugMe({ map: MAP });
    await load(p, 'fluxo.xlsx'); await runAndWait(p, 'enviar', idle);
    const sent = await p.evaluate(() => window.__sent);
    eq(sent.length, 3, 'um envio por linha');
    for (const s of sent) { eq(s.ticket, s.url, 'ticket da tela = URL'); eq(matchesTemplate(s.message, ROW[s.ticket]), null, 'mensagem do ticket ' + s.ticket); }
    eq(sent.filter(s => s.message.includes('11911110002;11911110003')).length, 1, 'dois telefones em uma única mensagem');
    const r = await rowsText(p); assert(r.every(x => x[5] === 'Enviado (confirmado)'), JSON.stringify(r.map(x => x[5])));
    // Retomar depois: tudo confirmado, nada pendente.
    await p.evaluate(() => { document.querySelector('#hugme-privada-host').shadowRoot.getElementById('headerRow').dispatchEvent(new Event('change')); });
    await panel(p).locator('#start').click();
    assert((await panel(p).locator('#status').textContent()).includes('Nenhuma linha pendente'), 'reexecução não deve reenviar');
    eq((await p.evaluate(() => window.__sent)).length, 3, 'continua com 3 envios');
    await p.close();
  });
  await test('Troca de ticket em andamento: espera o conteúdo novo, nunca age no ticket anterior', async () => {
    const p = await openHugMe({ map: MAP, scenario: 'slowswitch' });
    await load(p, 'fluxo.xlsx'); await runAndWait(p, 'enviar', idle);
    eq((await p.evaluate(() => window.__errors)).join(' | '), '', 'nenhum clique com ticket desatualizado');
    const sent = await p.evaluate(() => window.__sent); eq(sent.length, 3);
    for (const s of sent) eq(matchesTemplate(s.message, ROW[s.ticket]), null);
    await p.close();
  });
  await test('Ticket divergente: diagnóstico com linha, id e passo; nada é clicado; pular segue a fila', async () => {
    const p = await openHugMe({ map: MAP, scenario: 'wrongticket', wrong: { '200000002': '900000999' } });
    await load(p, 'fluxo.xlsx');
    await panel(p).locator('details summary').click(); await panel(p).locator('#timeout').fill('5'); await panel(p).locator('#saveCfg').click();
    await panel(p).locator('input[value=enviar]').check(); await panel(p).locator('#start').click();
    await panel(p).locator('.diag').waitFor({ timeout: 60000 });
    const d = await panel(p).locator('.diag').textContent();
    assert(d.includes('Linha 6') && d.includes('200000002') && d.includes('Passo #1') && d.includes('900000999') && d.includes('900000102'), d);
    eq((await p.evaluate(() => window.__sent)).length, 1, 'só a linha 5 foi enviada');
    eq((await p.evaluate(() => window.__events.filter(e => e.type === 'privateClick' && e.rendered === '900000999').length)), 0, 'nada clicado no ticket errado');
    await panel(p).locator('.diag button', { hasText: 'Pular' }).click();
    await p.waitForFunction(idle, null, { timeout: 60000 });
    const r = await rowsText(p); eq(r.map(x => x[5]).join('|'), 'Enviado (confirmado)|Pulada|Enviado (confirmado)');
    await p.close();
  });
  await test('Sem confirmação após o clique final: "Verificar envio", fila pausada e sem reenvio automático', async () => {
    const p = await openHugMe({ map: MAP, scenario: 'noconfirm' });
    await load(p, 'fluxo.xlsx');
    await panel(p).locator('details summary').click(); await panel(p).locator('#confirmTimeout').fill('5'); await panel(p).locator('#saveCfg').click();
    await runAndWait(p, 'enviar', idle);
    eq((await p.evaluate(() => window.__sent)).length, 1, 'exatamente um clique');
    const r = await rowsText(p); eq(r.map(x => x[5]).join('|'), 'Verificar envio|Pendente|Pendente');
    const hist = await p.evaluate(() => JSON.parse(localStorage.getItem('hugme-resposta-privada:v1')).history);
    eq(hist['200000001'].status, 'incerto');
    assert((await panel(p).locator('#diag').textContent()).includes('Verificar envio'), 'aviso visível');
    // Retomar: segue as pendentes, não reenvia a incerta.
    await p.evaluate(() => { window.__mock.scenario = 'ok'; });
    await runAndWait(p, 'enviar', idle);
    const sent = await p.evaluate(() => window.__sent.map(s => s.ticket));
    eq(sent.join(','), '900000101,900000102,900000103', 'linha incerta não reenviada');
    const r2 = await rowsText(p); eq(r2.map(x => x[5]).join('|'), 'Verificar envio|Enviado (confirmado)|Enviado (confirmado)');
    await p.close();
  });

  if (REAL && fs.existsSync(REAL)) await test('Planilha real anexada (só leitura, sem exibir dados): contrato C/Q/W/AA', async () => {
    const p = await openHugMe();
    await panel(p).locator('#file').setInputFiles(REAL); await panel(p).locator('#tbody tr').first().waitFor();
    eq(await panel(p).locator('#headerRow').inputValue(), '4');
    const cols = await panel(p).locator('#cols tbody tr').evaluateAll(trs => trs.map(tr => tr.cells[1].textContent + '=' + tr.cells[2].textContent.split(' · ')[0]));
    console.log('     grafias: ' + cols.join(' | '));
    const r = await rowsText(p); console.log('     linhas: ' + r.length + ' · situações: ' + [...new Set(r.map(x => x[5]))].join(', ') + ' · especialistas distintos: ' + new Set(r.map(x => x[3])).size);
    assert(r.length === 5 && r.every(x => x[5] === 'Pendente' && /^\d+$/.test(x[1]) && /^\d+$/.test(x[4])), 'esperava 5 linhas pendentes com id e telefone em texto');
    await p.close();
  });

  await browser.close();
  const md = ['# Resultado dos testes automatizados', '', 'Gerado por `node tests/run-tests.cjs` em ' + new Date().toISOString() + '. Nenhuma mensagem real foi enviada: o HugMe é a página simulada `tests/mock-hugme.html`.', '',
    '| Resultado | Teste |', '|---|---|', ...results.map(r => '| ' + r[0] + ' | ' + r[1].replace(/\|/g, '\\|') + (r[2] ? ' — ' + r[2].split('\n')[0].replace(/\|/g, '\\|') : '') + ' |'), ''];
  fs.writeFileSync(path.join(__dirname, 'RESULTADOS.md'), md.join('\n'));
  console.log('\n' + (results.length - failures) + '/' + results.length + ' testes OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
