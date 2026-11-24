// Testes da lógica do app (o núcleo, sem navegador): calculadora de crédito, auditoria, fechamento do mês,
// leitura de ZIP e geração do Excel. Uso: node testes/teste_nucleo.mjs
import { core, ler, criarVerificador } from './nucleo.mjs';
import { mesFicticio, nfe, nfse, cancelamentoNFSe, zipComDeflate, EMPRESA } from './fixtures.mjs';
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
igual('1,234.56 (formato americano)', core.lerValor('1,234.56'), 1234.56);
igual('1,234,567', core.lerValor('1,234,567'), 1234567);
igual('0.500 é decimal', core.lerValor('0.500'), 0.5);
igual('3.950 é milhar; como percentual, 3,95%', [core.lerValor('3.950'), core.lerValor('3.950', true), core.lerValor('4,5%', true)], [3950, 3.95, 4.5]);
igual('1e3 não é valor', core.lerValor('1e3'), null);
igual('R$ -10,00', core.lerValor('R$ -10,00'), -10);
ok('arredondamento sem "−0"', Object.is(core.r2(-0.004), 0) && Object.is(core.r2(100.30 - 50.10 - 50.20), 0));

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

console.log('--- NFS-e no leaiute oficial (tomador em <toma>, CST/cClassTrib na DPS, ISS fora da base)');
const servico = nfse({ numero: 40, prest: '77777777000177', opSimpNac: '1', valor: '1000.00', iss: '50.00', cClassTrib: '000001', vCBS: '8.55', vIBS: '0.95' });
const rNs = core.analisarXML(servico.texto, cfgF);
igual('tomador lido de <toma> e nota de compra', [rNs.doc.tom && rNs.doc.tom.doc, rNs.direcao], [EMPRESA, 'compra']);
igual('CST e cClassTrib do IBSCBS da DPS; valores do IBSCBS da NFS-e', [rNs.doc.ibs.cst, rNs.doc.ibs.cc, rNs.doc.ibs.vCBS, rNs.doc.ibs.vIBS, rNs.v.palavra], ['000', '000001', 8.55, 0.95, 'Conforme']);
const simNs = core.simularNFSe(rNs.doc, 11.2);
igual('base de 2027 sem o ISS (1000 − 50) e crédito do regime regular', [simNs.base, simNs.credito], [950, 107.36]);
const regNs = core.lerParaFechamento(servico.texto, cfgF).registro;
igual('no fechamento: compra com o crédito simulado', [core.papelNota(regNs, '11111111'), core.apurar([regNs], { raiz: '11111111', cbs27: 11.2, mes: '' }).apuracao.credito.total], ['compra', 107.36]);
const servico27 = nfse({ numero: 41, data: '2027-01-20', prest: '77777777000177', opSimpNac: '1', valor: '1000.00', iss: '50.00', cClassTrib: '000001', vCBS: '106.40', vIBS: '0.96' });
const reg27 = core.lerParaFechamento(servico27.texto, cfgF).registro;
igual('NFS-e de 2027: crédito destacado', [reg27.origem, core.apurar([reg27], { raiz: '11111111', cbs27: 11.2, mes: '' }).apuracao.credito.total], ['destacado', 107.36]);
igual('cancelamento de NFS-e deferido (e105104) e por ofício (e305101)', [core.lerParaFechamento(cancelamentoNFSe(servico.chave, 'e105104').texto, cfgF).cancelamento, core.lerParaFechamento(cancelamentoNFSe(servico.chave, 'e305101').texto, cfgF).cancelamento], [servico.chave, servico.chave]);
ok('cancelamento indeferido (e105105) não cancela', !!core.lerParaFechamento(cancelamentoNFSe(servico.chave, 'e105105').texto, cfgF).ignorado);
ok('DPS solta fica fora (a nota é a NFS-e)', /^DPS/.test(core.lerParaFechamento(servico.texto.match(/<DPS[\s\S]*<\/DPS>/)[0], cfgF).ignorado || ''));

console.log('--- NF-e: base, prazos, situações e notas de crédito e débito');
const semGrupo = x => x.replace(/<IBSCBS>[\s\S]*?<\/IBSCBS>/g, '').replace(/<IBSCBSTot>[\s\S]*?<\/IBSCBSTot>/, '');
const comDifal = nfe({ numero: 60 }).texto.replace('<IBSCBS>', '<ICMSUFDest><vBCUFDest>100.00</vBCUFDest><pFCPUFDest>2.00</pFCPUFDest><pICMSUFDest>11.00</pICMSUFDest><pICMSInter>7.00</pICMSInter><vFCPUFDest>2.00</vFCPUFDest><vICMSUFDest>11.00</vICMSUFDest><vICMSUFRemet>0.00</vICMSUFRemet></ICMSUFDest><IBSCBS>');
igual('DIFAL (vICMSUFDest + vFCPUFDest) sai da base', core.analisarXML(comDifal, cfgF).doc.itens[0].baseEsp, core.r2(core.analisarXML(nfe({ numero: 60 }).texto, cfgF).doc.itens[0].baseEsp - 13));
const simples = d => nfe({ numero: 61, data: d, emit: '33333333000133', crt: '1', dest: { cnpj: EMPRESA } }).texto;
igual('Simples: NF-e sem IBS/CBS exigida só a partir de 01/03/2027', [core.analisarXML(semGrupo(simples('2027-02-10')), cfgF).ex.exige, core.analisarXML(semGrupo(simples('2027-03-10')), cfgF).ex.exige], [false, true]);
const xmlVenda27 = semGrupo(nfe({ numero: 62, data: '2027-03-10' }).texto);
const venda27 = core.lerParaFechamento(xmlVenda27, cfgF).registro;
// sem o grupo não há cClassTrib: o item é simulado com tributação integral (000001), como na simulação do auditor
igual('venda de 2027 sem IBS/CBS destacado: débito simulado, não zero', [venda27.origem, core.apurar([venda27], { raiz: '11111111', cbs27: 11.2, mes: '' }).apuracao.debito.total], ['simulado', core.simularNFe(core.analisarXML(xmlVenda27, cfgF).doc, 2027, 11.2).total]);
ok('…e maior que zero', core.apurar([venda27], { raiz: '11111111', cbs27: 11.2, mes: '' }).apuracao.debito.total > 0);
const compraSimples27 = core.lerParaFechamento(semGrupo(simples('2027-02-10')), cfgF).registro;
igual('compra do Simples de 2027 sem valores: crédito não estimado', core.apurar([compraSimples27], { raiz: '11111111', cbs27: 11.2, mes: '' }).naoEstimado.notas, 1);
ok('cStat 150 (autorizada fora do prazo) não é alerta', !core.analisarXML(nfe({ numero: 63, cStat: '150' }).texto, cfgF).checks.some(c => /Situação na Sefaz/.test(c.titulo)));
const papel = (opcoes, xml = x => x) => core.papelNota(core.lerParaFechamento(xml(nfe(opcoes).texto), cfgF).registro, '11111111');
igual('homologação fica fora', papel({ numero: 64, tpAmb: '2' }), 'homologacao');
igual('notas de crédito e de débito', [papel({ numero: 65, finNFe: '5' }), papel({ numero: 66, finNFe: '5', emit: '22222222000122', dest: { cnpj: EMPRESA } }), papel({ numero: 67, finNFe: '6', dest: { cnpj: '11111111000202' } }), papel({ numero: 68, finNFe: '6', emit: '22222222000122', dest: { cnpj: EMPRESA } })], ['notaCredito', 'notaCreditoRec', 'notaDebito', 'notaDebitoRec']);
const vendaENotaCredito = ['1', '5'].map((fin, i) => core.lerParaFechamento(nfe({ numero: 70 + i, finNFe: fin }).texto, cfgF).registro);
const apNC = core.apurar(vendaENotaCredito, { raiz: '11111111', cbs27: 11.2, mes: '' }).apuracao;
ok('nota de crédito emitida anula o débito da venda (e sem "−0")', apNC.devVenda.total === 69.74 && Object.is(apNC.resultado.total, 0), JSON.stringify(apNC.resultado));
igual('importação (CFOP 3102) gera crédito', papel({ numero: 72, tpNF: '0' }, x => x.replace(/<CFOP>\d{4}<\/CFOP>/g, '<CFOP>3102</CFOP>')), 'importacao');
const lote = `<?xml version="1.0" encoding="UTF-8"?><enviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><idLote>1</idLote><indSinc>0</indSinc>${[73, 74].map(k => nfe({ numero: k }).texto.replace(/^<\?xml[^>]*\?>\s*/, '')).join('')}</enviNFe>`;
ok('lote com 2 NF-e: o fechamento avisa em vez de contar só a primeira', /2 notas/.test(core.lerParaFechamento(lote, cfgF).ignorado || ''));
ok('lote com 2 NF-e: o auditor avisa que conferiu só a primeira', core.analisarXML(lote, cfgF).checks.some(c => c.titulo === 'Arquivo com 2 notas'));
igual('espaço antes de <?xml', core.analisarXML('\r\n  ' + ler('exemplos/nfe_2027_conforme.xml'), cfg).v.palavra, 'Conforme');

console.log('--- fechamento: veredito no cenário da hora, CNPJ alfanumérico e datas');
// compra de 2027 com CBS de 11,2% destacada, lida com o cenário em 10,2%: o alerta do cenário é refeito em apurar()
const compra27 = core.lerParaFechamento(nfe({ numero: 80, data: '2027-01-15', emit: '55555555000155', crt: '1', dest: { cnpj: EMPRESA } }).texto, { cnpj: '', cbs27: 10.2 }).registro;
const notaNo = cbs => core.apurar([compra27], { raiz: '11111111', cbs27: cbs, mes: '' }).notas[0];
igual('lida em 10,2% e vista em 11,2%: conforme', [notaNo(11.2).v.palavra, notaNo(11.2).problemas.length], ['Conforme', 0]);
igual('vista em 10,2%: alerta por item, como no auditor', [notaNo(10.2).v.palavra, notaNo(10.2).v.w, notaNo(10.2).problemas[0].titulo], ['Com alertas', 4, 'CBS de 11,20%, diferente do cenário de 10,20%']);
const servicoOutro = nfse({ numero: 42, tomador: '22222222000122' }).texto;
ok('o auditor confere o tomador com o CNPJ digitado', core.analisarXML(servicoOutro, cfgF).checks.some(c => c.titulo === 'Tomador não é a sua empresa'));
igual('o fechamento não guarda essa conferência (o papel da nota já diz)', core.lerParaFechamento(servicoOutro, cfgF).registro.veredito.palavra, 'Conforme');
igual('CNPJ alfanumérico', [core.fmtDoc('12ABC345000135'), core.raizDe('12.abc.345/0001-35'), core.fmtDoc('11111111111')], ['12.ABC.345/0001-35', '12ABC345', '***.111.111-**']);
const vendaAlfa = nfe({ numero: 81 }).texto.replace(/(<emit>\s*<CNPJ>)\d+(<\/CNPJ>)/, '$112ABC345000135$2');
igual('nota de empresa com CNPJ alfanumérico', core.papelNota(core.lerParaFechamento(vendaAlfa, cfgF).registro, '12ABC345'), 'venda');
const dataBR = core.analisarXML(nfe({ numero: 82 }).texto.replace(/<dhEmi>[^<]+<\/dhEmi>/, '<dhEmi>10/11/2026 10:00:00</dhEmi>'), cfgF);
igual('data fora do padrão: lida, com alerta, e a simulação funciona', [dataBR.doc.ano, dataBR.checks.some(c => c.titulo === 'Data de emissão fora do padrão'), core.simularNFe(dataBR.doc, 2027, 11.2).total > 0], [2026, true, true]);
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
const zipRuim = zipComDeflate([{ nome: 'nota.xml', dados: enc.encode(arquivos[0].texto) }]);
zipRuim.fill(0xff, 40, 120); // estraga os dados compactados
let erroEntrada = '';
try { await core.lerZip(zipRuim)[0].ler(); } catch (e) { erroEntrada = e.message; }
igual('entrada corrompida dentro do ZIP: mensagem clara', erroEntrada, 'arquivo corrompido dentro do ZIP');
igual('XML em ISO-8859-1 decodificado', core.decodificarXML(Uint8Array.from([...enc.encode('<?xml version="1.0" encoding="ISO-8859-1"?><a>'), 0xc7, 0xc3, ...enc.encode('O</a>')])), '<?xml version="1.0" encoding="ISO-8859-1"?><a>ÇÃO</a>');

console.log('--- Excel (.xlsx)');
const xlsx = await core.gerarXlsx([
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
const grande = await core.gerarXlsx([{ nome: 'Notas', colunas: [{ titulo: 'Número' }, { titulo: 'Valor', tipo: 'moeda' }], linhas: Array.from({ length: 5000 }, (_, i) => [`NFC-e ${i}`, 69.74]) }]);
const tamBruto = core.lerZip(grande).reduce((s, e) => s + e.tamanho, 0);
ok('Excel compactado (deflate)', grande.length < tamBruto / 5, `${grande.length} bytes no arquivo, ${tamBruto} sem compressão`);
ok('Excel compactado lido de volta', (new TextDecoder().decode(await core.lerZip(grande).find(e => e.nome === 'xl/worksheets/sheet1.xml').ler()).match(/<row /g) || []).length === 5001);

process.exitCode = fim() ? 1 : 0;
