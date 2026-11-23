// Testes da lógica do app (o núcleo, sem navegador): calculadora de crédito, auditoria, fechamento do mês,
// leitura de ZIP e geração do Excel. Uso: node testes/teste_nucleo.mjs
import { core, ler, criarVerificador } from './nucleo.mjs';
import { mesFicticio, nfe, zipComDeflate } from './fixtures.mjs';
import { DOMParser } from '@xmldom/xmldom';

const { ok, igual, fim } = criarVerificador();

console.log('--- lerValor');
igual('1.234,56', core.lerValor('1.234,56'), 1234.56);
igual('1234,56', core.lerValor('1234,56'), 1234.56);
igual('1234.56', core.lerValor('1234.56'), 1234.56);
igual('R$ 1.000', core.lerValor('R$ 1.000'), 1000);
igual('1.000.000', core.lerValor('1.000.000'), 1000000);
igual('vazio', core.lerValor(''), null);
igual('texto', core.lerValor('abc'), null);

console.log('--- calculadora de crédito (CBS 11,2%)');
const cc = (e, cbs = 11.2) => core.calcularCredito(e, cbs);
const resumo = r => ({ base: r.credito && r.credito.base, cbs: r.credito && r.credito.cbs, ibs: r.credito && r.credito.ibs, total: r.credito && r.credito.total, pago: r.pago, custo: r.custo, perdido: r.perdido });
igual('regular, total pago 1000', resumo(cc({ valor: 1000, regime: 'REGULAR', incluso: true, red: 0, icms: 0 })), { base: 898.47, cbs: 100.63, ibs: 0.9, total: 101.53, pago: 1000, custo: 898.47, perdido: 0 });
igual('regular, por fora 1000', resumo(cc({ valor: 1000, regime: 'REGULAR', incluso: false, red: 0, icms: 0 })), { base: 1000, cbs: 112, ibs: 1, total: 113, pago: 1113, custo: 1000, perdido: 0 });
igual('regular, por fora 1000, ICMS 120', resumo(cc({ valor: 1000, regime: 'REGULAR', incluso: false, red: 0, icms: 120 })), { base: 880, cbs: 98.56, ibs: 0.88, total: 99.44, pago: 1099.44, custo: 1000, perdido: 0 });
igual('regular, total 1000, redução 30%', resumo(cc({ valor: 1000, regime: 'REGULAR', incluso: true, red: 30, icms: 0 })), { base: 926.7, cbs: 72.65, ibs: 0.64, total: 73.29, pago: 1000, custo: 926.71, perdido: 0 });
igual('MEI 670', resumo(cc({ valor: 670, regime: 'MEI' })), { base: 670, cbs: 0, ibs: 0, total: 0, pago: 670, custo: 670, perdido: 68.02 });
igual('Simples 1000 sem %', resumo(cc({ valor: 1000, regime: 'SIMPLES', pSimples: null })), { base: null, cbs: null, ibs: null, total: null, pago: 1000, custo: null, perdido: null });
igual('Simples 1000 com 2,5%', resumo(cc({ valor: 1000, regime: 'SIMPLES', pSimples: 2.5 })), { base: 1000, cbs: null, ibs: null, total: 25, pago: 1000, custo: 975, perdido: 76.53 });
igual('Pessoa física 500', resumo(cc({ valor: 500, regime: 'PF' })), { base: 500, cbs: 0, ibs: 0, total: 0, pago: 500, custo: 500, perdido: 50.75 });
igual('regular, total 1000, CBS 10,2%', resumo(cc({ valor: 1000, regime: 'REGULAR', incluso: true, red: 0, icms: 0 }, 10.2)), { base: 906.62, cbs: 92.48, ibs: 0.9, total: 93.38, pago: 1000, custo: 906.62, perdido: 0 });

console.log('--- auditoria das notas de exemplo');
const cfg = { cnpj: '', cbs27: 11.2 };
const rErr = core.analisarXML(ler('exemplos/nfe_2027_nao_conforme.xml'), cfg);
igual('exemplo com erros: veredito', rErr.v.palavra, 'Não conforme');
igual('exemplo com erros: 7 erros', rErr.v.e, 7);
const rOk = core.analisarXML(ler('exemplos/nfe_2027_conforme.xml'), cfg);
igual('exemplo conforme: veredito', rOk.v.palavra, 'Conforme');
const sim = core.simularNFe(rOk.doc, 2027, 11.2);
igual('simulação 2027 do exemplo conforme (CBS, IBS)', [sim.cbs, sim.ibs], [69.1, 0.64]);
igual('direção com o CNPJ da loja fictícia', core.analisarXML(ler('exemplos/nfe_2027_conforme.xml'), { cnpj: '11.111.111', cbs27: 11.2 }).direcao, 'venda');

console.log('--- fechamento do mês (empresa fictícia 11111111)');
const cfgF = { cnpj: '11111111', cbs27: 11.2 };
const arquivos = mesFicticio();
const registros = [], cancelados = new Set(), ignorados = [], chaves = new Set();
let repetidas = 0;
for (const a of arquivos) {
  const res = core.lerParaFechamento(a.texto, cfgF);
  if (res.cancelamento) { cancelados.add(res.cancelamento); continue; }
  if (res.ignorado) { ignorados.push(res.ignorado); continue; }
  if (res.registro.chave && chaves.has(res.registro.chave)) { repetidas++; continue; }
  chaves.add(res.registro.chave);
  registros.push(res.registro);
}
registros.forEach(r => { r.cancelada = cancelados.has(r.chave); });
igual('notas lidas, repetidas, cancelamentos e ignorados', [registros.length, repetidas, cancelados.size, ignorados.length], [12, 1, 1, 1]);
igual('motivo do arquivo ignorado', ignorados[0], 'Não é NF-e, NFC-e, NFS-e nem evento de cancelamento');
igual('CNPJ detectado como empresa', core.detectarEmpresa(registros)[0].raiz, '11111111');
const ap = core.apurar(registros, { raiz: '11111111', cbs27: 11.2, mes: '' });
const papeis = Object.fromEntries(Object.entries(ap.cont.papel).sort());
igual('papéis', papeis, { cancelada: 1, compra: 6, devVenda: 1, transferencia: 1, venda: 3 });
igual('débito das vendas (3 × 69,10 + 0,64)', ap.apuracao.debito, { cbs: 207.3, ibs: 1.92, total: 209.22 });
igual('devolução de venda', ap.apuracao.devVenda, { cbs: 69.1, ibs: 0.64, total: 69.74 });
igual('crédito: regular 69,10 + 2027 destacado 69,10 + serviço regular 112,00; MEI zero', ap.apuracao.credito, { cbs: 250.2, ibs: 2.28, total: 252.48 });
igual('resultado (saldo credor)', ap.apuracao.resultado, { cbs: -112, ibs: -1, total: -113 });
igual('compra do Simples de 2026 fica sem estimativa', [ap.naoEstimado.notas, ap.naoEstimado.valor], [1, 665]);
igual('período e meses', [ap.periodo.de, ap.periodo.ate, ap.periodo.meses], ['2026-11-10', '2027-01-15', ['2026-11', '2026-12', '2027-01']]);
const f = Object.fromEntries(ap.fornecedores.map(x => [x.doc, [x.regime, x.notas, x.credito.total, x.naoEstimado]]).sort((a, b) => a[0].localeCompare(b[0])));
igual('fornecedores', f, {
  '22222222000122': ['REGULAR', 1, 69.74, 0], '33333333000133': ['SIMPLES', 1, 0, 1], '44444444000144': ['MEI', 1, 0, 0],
  '55555555000155': ['SIMPLES', 1, 69.74, 0], '66666666000166': ['MEI', 1, 0, 0], '77777777000177': ['REGULAR', 1, 113, 0]
});
const cf = Object.fromEntries(ap.cfops.map(c => [c.cfop, [c.itens, c.valor]]));
igual('CFOP 5405 (9 notas com 4 itens)', cf['5405'], [36, 5985]);
const nov = core.apurar(registros, { raiz: '11111111', cbs27: 11.2, mes: '2026-11' });
igual('só novembro: débito, crédito e resultado', [nov.apuracao.debito.total, nov.apuracao.credito.total, nov.apuracao.resultado.total], [139.48, 182.74, -113]);
const cen = core.apurar(registros, { raiz: '11111111', cbs27: 10.2, mes: '2026-11' });
igual('cenário CBS 10,2% recalcula as notas de 2026', cen.apuracao.debito.cbs, 125.86);
ok('nota com erro traz os problemas', registros[0].problemas.length > 0 && registros[0].veredito.palavra === 'Não conforme', registros[0].problemas[0] && registros[0].problemas[0].titulo);
igual('nota denegada fica fora', core.papelNota(core.lerParaFechamento(nfe({ numero: 90, cStat: '302' }).texto, cfgF).registro, '11111111'), 'denegada');
igual('nota autorizada (protocolo 100) entra', core.papelNota(core.lerParaFechamento(nfe({ numero: 91, cStat: '100' }).texto, cfgF).registro, '11111111'), 'venda');
igual('sem CNPJ da empresa, nada entra na apuração', core.apurar(registros, { raiz: '', cbs27: 11.2, mes: '' }).apuracao.resultado.total, 0);

console.log('--- ZIP');
const enc = new TextEncoder();
const xmls = arquivos.slice(0, 3).map(a => ({ nome: 'notas/' + a.nome, dados: enc.encode(a.texto) }));
const zDef = core.lerZip(zipComDeflate([...xmls, { nome: '__MACOSX/notas/._nfe.xml', dados: enc.encode('lixo') }, { nome: 'notas/', dados: new Uint8Array() }]));
igual('ZIP com deflate: entradas (sem pasta e sem lixo do macOS)', zDef.map(x => x.nome), xmls.map(x => x.nome));
ok('ZIP com deflate: conteúdo descompactado igual', new TextDecoder().decode(await zDef[1].ler()) === arquivos[1].texto);
const zSem = core.lerZip(core.zipSemCompressao(xmls));
ok('ZIP sem compressão (o escritor do app) lido de volta', new TextDecoder().decode(await zSem[2].ler()) === arquivos[2].texto);
let erroZip = '';
try { core.lerZip(enc.encode('não é zip')); } catch (e) { erroZip = e.message; }
igual('arquivo que não é ZIP', erroZip, 'ZIP inválido ou corrompido');
igual('XML em ISO-8859-1 decodificado', core.decodificarXML(Uint8Array.from([...enc.encode('<?xml version="1.0" encoding="ISO-8859-1"?><a>'), 0xc7, 0xc3, ...enc.encode('O</a>')])), '<?xml version="1.0" encoding="ISO-8859-1"?><a>ÇÃO</a>');

console.log('--- Excel (.xlsx)');
const xlsx = core.gerarXlsx([
  { nome: 'Resumo', colunas: [{ titulo: 'Item', largura: 30 }, { titulo: 'Valor', tipo: 'moeda' }], linhas: [['Débito', 209.22], ['Texto com <tags> & "aspas"', 'sem número']], filtro: false },
  { nome: 'Notas/Itens: [teste]', colunas: [{ titulo: 'Data', tipo: 'data' }, { titulo: 'Número' }, { titulo: 'Valor', tipo: 'moeda' }, { titulo: 'Qtd', tipo: 'inteiro' }], linhas: [['2026-11-10', '1', 665, 4], ['2026-11-11', '2', 70.5, 1]], total: ['Total', '', 735.5, 5] }
]);
const partes = Object.fromEntries(await Promise.all(core.lerZip(xlsx).map(async e => [e.nome, new TextDecoder().decode(await e.ler())])));
igual('partes do .xlsx', Object.keys(partes).sort(), ['[Content_Types].xml', '_rels/.rels', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']);
const avisosXml = [];
const parser = new DOMParser({ onError: (nivel, msg) => avisosXml.push(`${nivel}: ${msg}`) });
for (const [nome, xml] of Object.entries(partes)) parser.parseFromString(xml, 'text/xml');
igual('todas as partes são XML bem formado', avisosXml, []);
ok('nome de aba com caracteres proibidos foi limpo', partes['xl/workbook.xml'].includes('name="Notas Itens   teste "') || partes['xl/workbook.xml'].includes('name="Notas Itens'), partes['xl/workbook.xml'].match(/name="[^"]*"/g).join(' '));
ok('data como número de série do Excel (10/11/2026 = 46336)', partes['xl/worksheets/sheet2.xml'].includes('<c r="A2" s="5"><v>46336</v></c>'));
ok('moeda com estilo de R$ e total em negrito', partes['xl/worksheets/sheet2.xml'].includes('<c r="C2" s="2"><v>665</v></c>') && partes['xl/worksheets/sheet2.xml'].includes('<c r="C4" s="6"><v>735.5</v></c>'));
ok('texto escapado', partes['xl/worksheets/sheet1.xml'].includes('Texto com &lt;tags&gt; &amp; &quot;aspas&quot;'));
ok('filtro só na aba que pede', !partes['xl/worksheets/sheet1.xml'].includes('autoFilter') && partes['xl/worksheets/sheet2.xml'].includes('<autoFilter ref="A1:D3"/>'));

process.exitCode = fim() ? 1 : 0;
