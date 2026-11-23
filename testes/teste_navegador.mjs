// Testes no navegador (Chrome ou Edge, sem janela), com o site servido com os cabeçalhos do render.yaml.
// Cobre as três ferramentas, os relatórios em Excel, a impressão (Salvar PDF) e a tela de celular.
// Uso: node build.mjs && node testes/teste_navegador.mjs
// Com CAPTURAS=<pasta>, grava capturas de tela e o PDF impresso do fechamento para conferência visual.
import { mkdtempSync, writeFileSync, readdirSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { core, raiz, criarVerificador } from './nucleo.mjs';
import { mesFicticio, zipComDeflate } from './fixtures.mjs';
import { servir, abrirNavegador, novaPagina, espera } from './servidor.mjs';

const { ok, igual, fim } = criarVerificador();
const pub = fileURLToPath(new URL('public/', raiz));
if (!existsSync(join(pub, 'index.html'))) throw new Error('public/index.html não existe: rode node build.mjs antes');
const tmp = mkdtempSync(join(tmpdir(), 'auditor-rtc-'));
const downloads = join(tmp, 'downloads');
mkdirSync(downloads);
const capturas = process.env.CAPTURAS;
if (capturas) mkdirSync(capturas, { recursive: true });
const limpa = s => (s || '').replace(/\s+/g, ' ').trim();
const texto = (page, sel) => page.$eval(sel, e => e.textContent).then(limpa);

// o mês fictício em disco: as duas NFS-e e o XML que não é nota vão dentro de um ZIP, o resto solto
const arquivos = mesFicticio();
const enc = new TextEncoder();
const caminhos = arquivos.slice(0, -3).map(a => { const p = join(tmp, a.nome); writeFileSync(p, a.texto); return p; });
const zip = join(tmp, 'servicos.zip');
writeFileSync(zip, zipComDeflate(arquivos.slice(-3).map(a => ({ nome: 'servicos/' + a.nome, dados: enc.encode(a.texto) }))));
caminhos.push(zip);

async function baixado(acao, padrao) {
  const antes = new Set(readdirSync(downloads));
  await acao();
  for (let i = 0; i < 100; i++) {
    const novo = readdirSync(downloads).find(f => !antes.has(f) && padrao.test(f) && !f.endsWith('.crdownload'));
    if (novo) return join(downloads, novo);
    await espera(100);
  }
  return null;
}
async function lerXlsx(caminho) {
  const partes = {};
  for (const e of core.lerZip(new Uint8Array(readFileSync(caminho)))) partes[e.nome] = new TextDecoder().decode(await e.ler());
  return { abas: [...partes['xl/workbook.xml'].matchAll(/<sheet name="([^"]+)"/g)].map(m => m[1]), partes };
}
async function arrastar(page, sel) {
  await page.$eval(sel, e => e.scrollIntoView({ block: 'center' }));
  const bx = await (await page.$(sel)).boundingBox();
  const y = bx.y + bx.height / 2;
  await page.mouse.move(bx.x + 2, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(bx.x + 2 + (bx.width - 4) * i / 20, y);
  await page.mouse.up();
  return page.evaluate(() => localStorage.getItem('rtc.cbs27'));
}

const srv = await servir(pub);
const navegador = await abrirNavegador();
try {
  const page = await novaPagina(navegador);
  const cdp = await navegador.target().createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(srv.url, { waitUntil: 'networkidle0' });

  console.log('--- auditoria');
  igual('abre com o exemplo com erros', await texto(page, '#out .verdict .word'), 'Não conforme');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  igual('tema de jornal mesmo com o navegador no modo escuro', await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(239, 231, 212)');
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  igual('controle da CBS arrastado de 8% a 12%', await arrastar(page, '#cbs-range'), '12');
  await page.click('#cbs-a');
  const xAud = await baixado(() => page.click('#a-xlsx'), /^auditoria-.*\.xlsx$/);
  igual('Excel da auditoria', xAud && (await lerXlsx(xAud)).abas, ['Resumo', 'Conferências', 'Itens']);

  console.log('--- calculadora de crédito');
  await page.click('#m-credito');
  await page.type('#c-valor', '1000');
  igual('regime regular, total pago 1000', await texto(page, '#c-res .big'), 'R$ 101,53');
  await page.click('[data-reg="MEI"]');
  igual('MEI', await texto(page, '#c-res .big'), 'R$ 0,00');
  await page.type('#c-desc', 'Serviço de MEI');
  await page.keyboard.press('Enter');
  await page.click('[data-reg="REGULAR"]');
  await page.type('#c-valor', '1.000,00');
  await page.click('#c-add');
  igual('lista com 2 compras e crédito total', [(await page.$$('#c-lista tbody tr')).length, await texto(page, '#c-lista .big')], [2, 'R$ 101,53']);
  const xCred = await baixado(() => page.click('#c-xlsx'), /^credito-compras-.*\.xlsx$/);
  igual('Excel da calculadora', xCred && (await lerXlsx(xCred)).abas, ['Compras', 'Premissas']);
  await page.reload({ waitUntil: 'networkidle0' });
  igual('após recarregar: continua na calculadora, com a lista', [await page.$eval('#modo-credito', e => !e.hidden), (await page.$$('#c-lista tbody tr')).length], [true, 2]);

  console.log('--- fechamento do mês');
  await page.click('#m-fechamento');
  await (await page.$('#f-file')).uploadFile(...caminhos);
  await page.waitForSelector('[data-empresa]', { timeout: 60000 });
  igual('sem CNPJ no topo, sugere o da empresa primeiro', await page.$$eval('[data-empresa]', bs => bs[0].dataset.empresa), '11111111');
  await page.click('[data-empresa="11111111"]');
  await page.waitForSelector('#h-ap');
  igual('CNPJ preenchido no topo', await page.$eval('#cnpj', e => e.value), '11.111.111');
  igual('saldo credor de R$ 113,00', await texto(page, '#f-out .big'), 'R$ 113,00');
  const corpo = await texto(page, '#f-out');
  ok('rótulo de saldo credor', /Saldo credor/.test(corpo));
  igual('notas lidas', await texto(page, '#h-cont .lbl'), '12 notas');
  igual('fornecedores', (await texto(page, '#h-forn .lbl')).split(' ·')[0], '6');
  ok('avisa a compra do Simples sem estimativa', /1 compra de fornecedor do Simples/.test(corpo));
  ok('informa o arquivo repetido e o ignorado', /1 arquivo repetido/.test(corpo) && /1 arquivo ignorado/.test(corpo));
  await page.click('#cbs-b');
  igual('cenário de 10,2% recalcula (saldo credor de R$ 109,17)', await texto(page, '#f-out .big'), 'R$ 109,17');
  await page.click('#cbs-a');
  await page.select('#f-mes', '2026-11');
  igual('filtro de novembro', await texto(page, '#h-cont .lbl'), '10 notas no mês');
  await page.select('#f-mes', '');
  const xF = await baixado(() => page.click('#f-xlsx'), /^fechamento-.*\.xlsx$/);
  const planilha = xF && await lerXlsx(xF);
  igual('Excel do fechamento', planilha && planilha.abas, ['Resumo', 'Notas', 'Fornecedores', 'CFOP', 'Problemas', 'Ignorados']);
  igual('aba Notas com as 12 notas', planilha && (planilha.partes['xl/worksheets/sheet2.xml'].match(/<row /g) || []).length - 1, 12);
  ok('CPF mascarado no Excel', planilha && !planilha.partes['xl/worksheets/sheet2.xml'].includes('11111111111') && planilha.partes['xl/worksheets/sheet2.xml'].includes('***.111.111-**'));

  await page.emulateMediaType('print');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  ok('na impressão, somem os controles e entra o cabeçalho do relatório', await page.evaluate(() =>
    getComputedStyle(document.querySelector('.modos')).display === 'none' && getComputedStyle(document.querySelector('#f-drop')).display === 'none' &&
    getComputedStyle(document.querySelector('#impressao-topo')).display === 'block' && /Fechamento do mês/.test(document.querySelector('#impressao-topo').textContent)));
  if (capturas) await page.pdf({ path: join(capturas, 'fechamento.pdf'), format: 'A4', printBackground: true });
  await page.emulateMediaType(null);
  if (capturas) await page.screenshot({ path: join(capturas, 'fechamento.png'), fullPage: true });

  await page.setViewport({ width: 375, height: 800 });
  await espera(300);
  const largura = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('celular (375px) sem rolagem lateral', largura <= 375, largura);
  if (capturas) await page.screenshot({ path: join(capturas, 'fechamento-celular.png'), fullPage: true });
  await page.setViewport({ width: 1280, height: 900 });

  await page.click('[data-abrir]');
  ok('"Abrir no auditor" leva a nota com problema para a auditoria', await page.$eval('#modo-auditar', e => !e.hidden) && (await page.$$('#tabs .tab')).length === 2);

  console.log('--- segurança');
  igual('sem violação da CSP', await page.violacoes(), []);
  igual('sem erro de console', page.erros, []);
} catch (e) {
  ok('execução', false, e.stack || e.message);
} finally {
  await navegador.close();
  await srv.fechar();
  rmSync(tmp, { recursive: true, force: true });
}
process.exitCode = fim() ? 1 : 0;
