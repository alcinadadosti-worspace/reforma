// Monta o Auditor de Notas a partir do template. Sem dependências (Node 18+).
//
//   public/index.html   -> o site (publicado pelo Render; também abre com duplo clique)
//   public/versao.svg   -> assinatura desta versão (largura x altura); as abas abertas a conferem para se atualizar sozinhas
//   auditor-notas.html  -> mesma página sem <!doctype>, usada no Artifact do Claude (fora do git; sem atualização automática)
//
// Uso: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = dirname(fileURLToPath(import.meta.url));
const ler = p => readFileSync(join(raiz, p), 'utf8');

// Tabelas oficiais (CST, cClassTrib, reduções, NCMs) extraídas do banco da calculadora da RFB.
const tabelas = JSON.stringify(JSON.parse(ler('dados/tabelas_rtc.json'))).replaceAll('</', '<\\/');

function exemplo(nome) {
  const xml = ler(`exemplos/${nome}`).replace(/<!--[\s\S]*?-->/g, '').trim();
  if (xml.toLowerCase().includes('</script')) throw new Error(`${nome} contém "</script"`);
  return xml;
}

// Funções como substituto evitam que "$" nos dados seja lido como padrão de replace.
const html = ler('src/auditor-notas.template.html')
  .replace('__TABELAS__', () => tabelas)
  .replace('__EX_ERROS__', () => exemplo('nfe_2027_nao_conforme.xml'))
  .replace('__EX_OK__', () => exemplo('nfe_2027_conforme.xml'));
if (/__TABELAS__|__EX_/.test(html)) throw new Error('placeholder não substituído no template');

const corte = html.indexOf('</style>') + '</style>'.length;
const pagina = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Confere IBS e CBS de NF-e, NFC-e e NFS-e (XML ou PDF), simula a operação em 2027 e calcula o crédito das compras. Tudo roda no navegador.">
<meta name="robots" content="noindex, nofollow">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect x='3' y='3' width='26' height='26' fill='%23fff' stroke='%23000' stroke-width='4'/%3E%3Cpath d='M9 16.5l5 5 9-11' fill='none' stroke='%23000' stroke-width='4'/%3E%3C/svg%3E">
${html.slice(0, corte)}
</head>
<body>
${html.slice(corte)}
</body>
</html>
`;

// Assinatura da versão, derivada do conteúdo da página: muda a cada alteração publicada e se repete se o
// conteúdo for o mesmo (republicar sem mudança não faz ninguém recarregar). Vira a largura x altura de versao.svg.
const n = parseInt(createHash('sha256').update(pagina).digest('hex').slice(0, 8), 16);
const [w, h] = [n % 997 + 1, Math.floor(n / 997) % 991 + 1];
const versao = `${w}x${h}`;
const site = pagina.replaceAll('__VERSAO__', versao);
const artifact = html.replaceAll('__VERSAO__', '');
if ([site, artifact].some(s => s.includes('__VERSAO__')) || !site.includes(`'${versao}'`)) throw new Error('placeholder __VERSAO__ ausente ou não substituído no template');

mkdirSync(join(raiz, 'public'), { recursive: true });
writeFileSync(join(raiz, 'public/index.html'), site);
writeFileSync(join(raiz, 'public/versao.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"/>\n`);
writeFileSync(join(raiz, 'auditor-notas.html'), artifact);
console.log(`ok: public/index.html (${Math.round(Buffer.byteLength(site) / 1024)} KB) · versão ${versao}`);
