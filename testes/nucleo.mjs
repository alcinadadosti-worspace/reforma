// Carrega o núcleo do app (o trecho entre /*CORE-START*/ e /*CORE-END*/ do template) para testar em Node,
// com as tabelas de dados/tabelas_rtc.json e o DOMParser do @xmldom/xmldom.
import { readFileSync } from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';

export const raiz = new URL('../', import.meta.url);
export const ler = p => readFileSync(new URL(p, raiz), 'utf8');

const tpl = ler('src/auditor-notas.template.html');
const inicio = tpl.indexOf('/*CORE-START*/'), fim = tpl.indexOf('/*CORE-END*/');
if (inicio < 0 || fim < 0) throw new Error('marcadores CORE-START/CORE-END não encontrados no template');
export const tabelas = JSON.parse(ler('dados/tabelas_rtc.json'));
export const core = new Function(tpl.slice(inicio, fim) + '\nreturn criarCore;')()(tabelas, DOMParser);

// Mini executor de testes: imprime uma linha por verificação e devolve o número de falhas.
export function criarVerificador() {
  let falhas = 0, total = 0;
  const ok = (nome, cond, info) => {
    total++;
    if (!cond) falhas++;
    console.log(`${cond ? 'ok   ' : 'FALHA'} ${nome}${info != null && info !== '' ? ': ' + info : ''}`);
  };
  const igual = (nome, obtido, esperado) => {
    const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
    ok(nome, a === b, a === b ? a : `${a} (esperado ${b})`);
  };
  const fim = () => { console.log(`\n${total - falhas}/${total} verificações ok`); return falhas; };
  return { ok, igual, fim };
}
