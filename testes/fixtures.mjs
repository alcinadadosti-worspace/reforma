// Notas fictícias para os testes, SEM VALOR FISCAL. Saem de exemplos/nfe_2027_conforme.xml com outros CNPJs,
// datas, números, regime do emitente e finalidade. A loja fictícia do exemplo tem CNPJ 11111111000111.
// Valores do exemplo: 4 itens, R$ 665,00; IBS/CBS com CBS de 11,2% = CBS R$ 69,10 + IBS R$ 0,64.
import { deflateRawSync } from 'node:zlib';
import { ler } from './nucleo.mjs';

// ZIP com o método 8 (deflate), como os gerados pelo Windows e pelos ERPs. entradas: [{ nome, dados: Uint8Array }]
const crc32 = u8 => { let c = ~0; for (const b of u8) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; } return (~c) >>> 0; };
export function zipComDeflate(entradas) {
  const enc = new TextEncoder(), partes = [], central = []; let off = 0;
  for (const { nome, dados } of entradas) {
    const n = enc.encode(nome), comp = deflateRawSync(dados), crc = crc32(dados);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(8, 8); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(comp.length, 18); h.writeUInt32LE(dados.length, 22); h.writeUInt16LE(n.length, 26);
    partes.push(h, n, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(8, 10); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(n.length, 28); c.writeUInt32LE(off, 42);
    central.push(c, n);
    off += 30 + n.length + comp.length;
  }
  const cd = Buffer.concat(central), e = Buffer.alloc(22);
  e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(entradas.length, 8); e.writeUInt16LE(entradas.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...partes, cd, e]));
}

const base = ler('exemplos/nfe_2027_conforme.xml');
export const EMPRESA = '11111111000111';

export function chaveNFe({ data, emit, mod = '55', numero }) {
  return '27' + data.slice(2, 4) + data.slice(5, 7) + emit.padStart(14, '0') + mod + '001' + String(numero).padStart(9, '0') + '1' + '12345678' + '0';
}

// tpAmb 1 (produção) por padrão: nota de homologação (2) fica fora do fechamento.
export function nfe({ numero = 1, data = '2026-11-10', emit = EMPRESA, crt = '3', dest = { cpf: '11111111111' }, tpNF = '1', finNFe = '1', mod = '55', cStat = null, tpAmb = '1' } = {}) {
  const chave = chaveNFe({ data, emit, mod, numero });
  let x = base
    .replace(/<tpAmb>\d<\/tpAmb>/, `<tpAmb>${tpAmb}</tpAmb>`)
    .replace(/Id="NFe\d{44}"/, `Id="NFe${chave}"`)
    .replace(/<nNF>\d+<\/nNF>/, `<nNF>${numero}</nNF>`)
    .replace(/<mod>\d+<\/mod>/, `<mod>${mod}</mod>`)
    .replace(/<dhEmi>[^<]+<\/dhEmi>/, `<dhEmi>${data}T10:00:00-03:00</dhEmi>`)
    .replace(/<dhSaiEnt>[^<]+<\/dhSaiEnt>/, `<dhSaiEnt>${data}T10:00:00-03:00</dhSaiEnt>`)
    .replace(/<tpNF>\d<\/tpNF>/, `<tpNF>${tpNF}</tpNF>`)
    .replace(/<finNFe>\d<\/finNFe>/, `<finNFe>${finNFe}</finNFe>`)
    .replace(/(<emit>\s*<CNPJ>)\d+(<\/CNPJ>)/, `$1${emit}$2`)
    .replace(/<CRT>\d<\/CRT>/, `<CRT>${crt}</CRT>`)
    .replace(/<dest>\s*<CPF>\d+<\/CPF>/, `<dest>\n      ${dest.cnpj ? `<CNPJ>${dest.cnpj}</CNPJ>` : `<CPF>${dest.cpf}</CPF>`}`);
  if (cStat) {
    x = x.replace(/^<\?xml[^>]*\?>\s*/, '')
      .replace(/^/, `<?xml version="1.0" encoding="UTF-8"?>\n<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">\n`)
      .concat(`\n<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>${chave}</chNFe><dhRecbto>${data}T10:00:05-03:00</dhRecbto><cStat>${cStat}</cStat><xMotivo>FICTICIO</xMotivo></infProt></protNFe>\n</nfeProc>\n`);
  }
  return { nome: `nfe_${mod}_${numero}.xml`, texto: x, chave };
}

export function cancelamento(chave) {
  return {
    nome: `cancelamento_${chave.slice(-12)}.xml`,
    texto: `<?xml version="1.0" encoding="UTF-8"?>
<procEventoNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00"><evento versao="1.00"><infEvento Id="ID110111${chave}01"><cOrgao>27</cOrgao><tpAmb>2</tpAmb><CNPJ>${EMPRESA}</CNPJ><chNFe>${chave}</chNFe><dhEvento>2026-11-15T10:00:00-03:00</dhEvento><tpEvento>110111</tpEvento><nSeqEvento>1</nSeqEvento><verEvento>1.00</verEvento><detEvento versao="1.00"><descEvento>Cancelamento</descEvento><nProt>127260000000001</nProt><xJust>Cancelamento ficticio para teste</xJust></detEvento></infEvento></evento><retEvento versao="1.00"><infEvento><tpAmb>2</tpAmb><cStat>135</cStat><xMotivo>Evento registrado</xMotivo><chNFe>${chave}</chNFe><tpEvento>110111</tpEvento></infEvento></retEvento></procEventoNFe>
`
  };
}

// NFS-e nacional mínima, no leiaute oficial (tiposComplexos_v1.01.xsd e a nota de exemplo da calculadora da RFB):
// tomador em <toma>; CST e cClassTrib no IBSCBS da DPS; valores calculados no IBSCBS da NFS-e; ISSQN em infNFSe/valores.
// opSimpNac: 1 = regime regular, 2 = MEI, 3 = Simples Nacional.
export function nfse({ numero = 28, data = '2026-11-11', prest = '66666666000166', nome = 'PRESTADOR FICTICIO', opSimpNac = '2', tomador = EMPRESA, valor = '670.00',
  iss = null, cClassTrib = null, vCBS = null, vIBS = null, tpAmb = '1' } = {}) {
  const chave = ('2706703' + prest + String(numero).padStart(13, '0')).padEnd(50, '0').slice(0, 50);
  const ibsNFSe = vCBS != null ? `<IBSCBS><cLocalidadeIncid>2706703</cLocalidadeIncid><xLocalidadeIncid>Penedo</xLocalidadeIncid><pRedutor>0.00</pRedutor><totCIBS><vTotNF>${valor}</vTotNF><gIBS><vIBSTot>${vIBS}</vIBSTot></gIBS><gCBS><vCBS>${vCBS}</vCBS></gCBS></totCIBS></IBSCBS>` : '';
  const ibsDPS = cClassTrib ? `<IBSCBS><finNFSe>0</finNFSe><indFinal>0</indFinal><cIndOp>070101</cIndOp><valores><trib><gIBSCBS><CST>${cClassTrib.slice(0, 3)}</CST><cClassTrib>${cClassTrib}</cClassTrib></gIBSCBS></trib></valores></IBSCBS>` : '';
  return {
    nome: `nfse_${numero}.xml`, chave,
    texto: `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infNFSe Id="NFS${chave}"><xLocEmi>Penedo</xLocEmi><nNFSe>${numero}</nNFSe><dhProc>${data}T10:00:00-03:00</dhProc><emit><CNPJ>${prest}</CNPJ><xNome>${nome}</xNome></emit><valores>${iss != null ? `<vBC>${valor}</vBC><pAliqAplic>5.00</pAliqAplic><vISSQN>${iss}</vISSQN>` : ''}<vLiq>${valor}</vLiq></valores>${ibsNFSe}<DPS versao="1.01"><infDPS Id="DPS${chave}"><tpAmb>${tpAmb}</tpAmb><dhEmi>${data}T10:00:00-03:00</dhEmi><dCompet>${data}</dCompet><prest><CNPJ>${prest}</CNPJ><xNome>${nome}</xNome><regTrib><opSimpNac>${opSimpNac}</opSimpNac></regTrib></prest><toma><CNPJ>${tomador}</CNPJ><xNome>LOJA FICTICIA DE COSMETICOS LTDA</xNome></toma><serv><cServ><cTribNac>140201</cTribNac><xDescServ>SERVICO FICTICIO PARA TESTE</xDescServ></cServ></serv><valores><vServPrest><vServ>${valor}</vServ></vServPrest></valores>${ibsDPS}</infDPS></DPS></infNFSe></NFSe>
`
  };
}

// Evento de cancelamento de NFS-e (e101101 cancelamento, e105102 por substituição, e105104 deferido, e305101 por ofício).
export function cancelamentoNFSe(chave, codigo = 'e101101') {
  return {
    nome: `cancelamento_nfse_${chave.slice(-12)}.xml`,
    texto: `<?xml version="1.0" encoding="UTF-8"?>
<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.01"><infEvento Id="EVT${chave}001"><nSeqEvento>1</nSeqEvento><dhProc>2026-11-20T10:00:00-03:00</dhProc><pedRegEvento versao="1.01"><infPedReg Id="PRE${chave}001"><tpAmb>1</tpAmb><dhEvento>2026-11-20T10:00:00-03:00</dhEvento><chNFSe>${chave}</chNFSe><nPedRegEvento>1</nPedRegEvento><${codigo}><xDesc>Cancelamento ficticio para teste</xDesc></${codigo}></infPedReg></pedRegEvento></infEvento></evento>
`
  };
}

// O mês fictício completo usado nos testes do fechamento (empresa 11111111). Totais esperados estão nos testes.
export function mesFicticio() {
  const venda1 = nfe({ numero: 1, data: '2026-11-10' });
  const vendaCancelada = nfe({ numero: 8, data: '2026-11-14' });
  return [
    venda1,
    nfe({ numero: 2, data: '2026-11-11', mod: '65' }),                                                               // NFC-e
    nfe({ numero: 3, data: '2026-11-12', emit: '22222222000122', crt: '3', dest: { cnpj: EMPRESA } }),               // compra, regime regular
    nfe({ numero: 4, data: '2026-11-13', emit: '33333333000133', crt: '1', dest: { cnpj: EMPRESA } }),               // compra, Simples
    nfe({ numero: 5, data: '2026-11-13', emit: '44444444000144', crt: '4', dest: { cnpj: EMPRESA } }),               // compra, MEI
    nfe({ numero: 6, data: '2026-11-20', tpNF: '0', finNFe: '4' }),                                                  // devolução de venda
    nfe({ numero: 7, data: '2026-11-21', dest: { cnpj: '11111111000202' } }),                                        // transferência
    vendaCancelada, cancelamento(vendaCancelada.chave),
    { nome: 'copia_da_venda_1.xml', texto: venda1.texto },                                                           // repetida
    nfe({ numero: 10, data: '2027-01-15', emit: '55555555000155', crt: '1', dest: { cnpj: EMPRESA } }),              // compra 2027: valor destacado
    nfe({ numero: 11, data: '2026-12-05' }),                                                                         // venda de dezembro
    nfse({ numero: 28, prest: '66666666000166', nome: 'PRESTADOR MEI FICTICIO', opSimpNac: '2', valor: '670.00' }),  // serviço de MEI
    nfse({ numero: 29, prest: '77777777000177', nome: 'PRESTADOR REGULAR FICTICIO', opSimpNac: '1', valor: '1000.00' }), // serviço de empresa do regime regular
    { nome: 'nao_e_nota.xml', texto: '<?xml version="1.0"?><qualquer><coisa>1</coisa></qualquer>' }
  ];
}
