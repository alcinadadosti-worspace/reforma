// Ajuda para os testes de navegador: um servidor local que serve uma pasta com os mesmos cabeçalhos de segurança
// do render.yaml (a CSP inclusive) e a localização do Chrome/Edge para o puppeteer-core.
import http from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, resolve, sep } from 'node:path';
import puppeteer from 'puppeteer-core';
import { ler } from './nucleo.mjs';

export const CABECALHOS = (() => {
  const h = {};
  for (const m of ler('render.yaml').matchAll(/name:\s*([\w-]+)\s*\n\s*value:\s*"?([^"\n]+)"?/g)) h[m[1]] = m[2];
  if (!h['Content-Security-Policy']) throw new Error('render.yaml sem Content-Security-Policy');
  return h;
})();
const MIME = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.xml': 'application/xml' };

// Servidor de arquivos estáticos. raiz pode ser trocada (simula um deploy). Guarda os caminhos pedidos em log.
export function servir(pasta) {
  const s = { raiz: resolve(pasta), log: [] };
  const srv = http.createServer((req, res) => {
    let caminho;
    try { caminho = decodeURIComponent(req.url.split('?')[0]); } catch { res.writeHead(400, CABECALHOS); res.end('400'); return; }
    s.log.push(caminho);
    const arq = resolve(join(s.raiz, caminho === '/' ? 'index.html' : caminho));
    if (!(arq + sep).startsWith(s.raiz + sep) || !existsSync(arq) || statSync(arq).isDirectory()) { res.writeHead(404, CABECALHOS); res.end('404'); return; }
    res.writeHead(200, Object.assign({ 'Content-Type': MIME[extname(arq)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=0' }, CABECALHOS));
    res.end(readFileSync(arq));
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => {
    s.url = `http://127.0.0.1:${srv.address().port}/`;
    s.trocarRaiz = p => { s.raiz = resolve(p); };
    s.fechar = () => new Promise(f => srv.close(f));
    ok(s);
  }));
}

export function caminhoNavegador() {
  const candidatos = [
    process.env.NAVEGADOR,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ].filter(Boolean);
  const achado = candidatos.find(p => existsSync(p));
  if (!achado) throw new Error('Chrome ou Edge não encontrado. Informe o caminho na variável NAVEGADOR.');
  return achado;
}

export function abrirNavegador() {
  return puppeteer.launch({
    executablePath: caminhoNavegador(), headless: 'new',
    args: ['--no-first-run', ...(process.env.CI ? ['--no-sandbox'] : [])]
  });
}

// Página com coleta de erros de console e de violações da CSP.
export async function novaPagina(navegador) {
  const page = await navegador.newPage();
  const erros = [];
  page.on('console', m => { if (m.type() === 'error') erros.push(m.text()); });
  page.on('pageerror', e => erros.push(e.message));
  await page.evaluateOnNewDocument(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
  });
  page.erros = erros;
  page.violacoes = () => page.evaluate(() => window.__csp);
  return page;
}

export const espera = ms => new Promise(r => setTimeout(r, ms));
