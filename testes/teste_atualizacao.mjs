// Simula deploys com uma aba aberta, para conferir a atualização automática:
//  1. versão 1 -> 2 com uma nota solta e valores digitados: a aba se atualiza sozinha depois de ~30 s sem uso e
//     restaura tudo, sem entrar em laço;
//  2. versão 2 -> 3 com um fechamento do mês aberto: a aba não recarrega (o fechamento se perderia) e avisa.
// Uso: node build.mjs && node testes/teste_atualizacao.mjs   (leva cerca de 2 minutos)
import { cpSync, mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { raiz, criarVerificador } from './nucleo.mjs';
import { nfe, mesFicticio } from './fixtures.mjs';
import { servir, abrirNavegador, novaPagina, espera } from './servidor.mjs';

const { ok, igual, fim } = criarVerificador();
const app = fileURLToPath(raiz);
if (!existsSync(join(app, 'public/index.html'))) throw new Error('public/index.html não existe: rode node build.mjs antes');
const tmp = mkdtempSync(join(tmpdir(), 'auditor-rtc-versoes-'));

// versões 2 e 3: cópias do app com uma marca no título, montadas pelo próprio build.mjs
function versao(marca) {
  const dir = join(tmp, marca);
  for (const p of ['src', 'dados', 'exemplos', 'build.mjs', 'render.yaml']) cpSync(join(app, p), join(dir, p), { recursive: true });
  const tpl = join(dir, 'src/auditor-notas.template.html');
  const original = readFileSync(tpl, 'utf8');
  const alterado = original.replace('<h1>Auditor de Notas</h1>', `<h1>Auditor de Notas [${marca}]</h1>`);
  if (alterado === original) throw new Error('marca de versão não aplicada');
  writeFileSync(tpl, alterado);
  execFileSync(process.execPath, ['build.mjs'], { cwd: dir, stdio: 'ignore' });
  return join(dir, 'public');
}
const v2 = versao('v2'), v3 = versao('v3');
const notaSolta = join(tmp, 'nota_solta.xml');
writeFileSync(notaSolta, nfe({ numero: 50, data: '2026-11-10' }).texto);
const doMes = mesFicticio().slice(0, 6).map((a, i) => { const p = join(tmp, `mes_${i}_${a.nome}`); writeFileSync(p, a.texto); return p; });

const srv = await servir(join(app, 'public'));
const navegador = await abrirNavegador();
try {
  const page = await novaPagina(navegador);
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(srv.url, { waitUntil: 'networkidle0' });
  const t0 = Date.now();
  await page.evaluate(() => { window.__marca = 1; });

  console.log('--- 1. deploy com trabalho em andamento (sem fechamento)');
  await (await page.$('#file')).uploadFile(notaSolta);
  await page.waitForFunction(() => document.querySelectorAll('#tabs .tab').length === 2);
  await page.click('#m-credito');
  await page.type('#c-valor', '1000');
  await page.type('#c-desc', 'Teste de atualização');
  const tAcao = Date.now();
  srv.trocarRaiz(v2);
  await espera(Math.max(0, t0 + 14000 - Date.now()));
  ok('conferiu o versao.svg', srv.log.includes('/versao.svg'));
  ok('com a pessoa mexendo há pouco, ainda não recarregou', await page.evaluate(() => window.__marca === 1));
  await page.waitForNavigation({ timeout: 70000 });
  const s = Math.round((Date.now() - tAcao) / 1000);
  ok('recarregou sozinha depois de ~30 s sem uso', s >= 30 && s <= 60, `${s} s após a última ação`);
  await page.waitForSelector('#c-valor');
  igual('agora é a versão 2', await page.$eval('h1', e => e.textContent), 'Auditor de Notas [v2]');
  igual('endereço limpo, sem ?v=', new URL(page.url()).search, '');
  igual('continua na calculadora, com o que foi digitado', [await page.$eval('#modo-credito', e => !e.hidden), await page.$eval('#c-valor', e => e.value), await page.$eval('#c-desc', e => e.value)], [true, '1000', 'Teste de atualização']);
  ok('aviso de app atualizado', /App atualizado para a versão mais nova/.test(await page.$eval('#aviso-versao', e => (e.hidden ? '' : e.textContent))));
  await page.click('#m-auditar');
  const abas = await page.$$eval('#tabs .tab', ts => ts.map(t => t.getAttribute('aria-selected')));
  igual('notas restauradas, com a solta selecionada', abas, ['false', 'true']);

  console.log('--- 2. deploy com um fechamento do mês aberto');
  // aba recém-aberta na versão 2. A marca de "acabou de atualizar" sai antes: ela segura novas recargas por 2 min
  // (proteção contra laço) e aqui a situação é outra.
  await page.evaluate(() => sessionStorage.clear());
  await page.goto(srv.url, { waitUntil: 'networkidle0' });
  const t1 = Date.now();
  await page.evaluate(() => { window.__marca = 2; });
  await page.click('#m-fechamento');
  await (await page.$('#f-file')).uploadFile(...doMes);
  await page.waitForSelector('[data-empresa], #h-ap', { timeout: 30000 });
  srv.trocarRaiz(v3);
  await page.waitForFunction(() => /fechamento do mês precisará ser refeito/.test(document.querySelector('#aviso-versao').textContent), { timeout: 70000, polling: 500 });
  ok('avisou em vez de recarregar', await page.evaluate(() => window.__marca === 2), `${Math.round((Date.now() - t1) / 1000)} s`);
  ok('o fechamento continua na tela', await page.evaluate(() => !!document.querySelector('#f-out [data-empresa], #f-out #h-ap')));
  await espera(12000);
  ok('e não recarrega sozinha depois do aviso', await page.evaluate(() => window.__marca === 2));

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
