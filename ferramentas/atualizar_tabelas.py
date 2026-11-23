"""Gera dados/tabelas_rtc.json a partir das migrations do banco da calculadora da Receita Federal.

Uso:
  python ferramentas/atualizar_tabelas.py <pasta flyway/sql> [saida.json] [--data AAAA-MM-DD]

  <pasta flyway/sql>  pasta flyway/sql do repositório ReceitaFederal/calculadora-rtc-regime-regular
  saida.json          padrão: dados/tabelas_rtc.json
  --data              data de referência para a vigência (padrão: hoje)

O que faz:
  1. Monta o banco SQLite em memória como o Flyway: beforeMigrate, B0001, V0002.. em ordem e afterMigrate.
     As linhas "PRAGMA foreign_keys" saem porque a V0011 quebra com chave estrangeira ligada.
  2. Extrai as situações tributárias (CST) e as classificações (cClassTrib) do IBS e da CBS (tributos 2, 3 e 4),
     com percentuais de redução, NCMs vinculados, exceções e o artigo da LC 214/2025. As classificações do
     Imposto Seletivo (tributo 1) ficam de fora: os códigos delas colidem com os do IBS/CBS.
  3. NCMs, exceções e reduções com fim de vigência anterior à data de referência ficam de fora.
     As classificações entram todas, com início (i) e fim (f) de vigência.
  4. Grava o JSON com chaves ordenadas, para o diff ser estável, e mostra o que mudou em relação ao arquivo anterior.

Só usa a biblioteca padrão do Python (sqlite3).
"""
import datetime
import json
import re
import sqlite3
import sys
from pathlib import Path

TRIBUTOS = {2: 'cbs', 3: 'uf', 4: 'mun'}


def montar(pasta):
    arquivos = list(Path(pasta).rglob('*.sql'))

    def versao(p):
        m = re.match(r'[BV](\d+)__', p.name)
        return int(m.group(1)) if m else None

    antes = [p for p in arquivos if p.name.lower().startswith('beforemigrate')]
    depois = [p for p in arquivos if p.name.lower().startswith('aftermigrate')]
    migracoes = sorted([p for p in arquivos if versao(p) is not None], key=versao)
    if not migracoes:
        raise SystemExit(f'nenhuma migration encontrada em {pasta}')
    con = sqlite3.connect(':memory:')
    con.execute('PRAGMA foreign_keys=OFF')
    for p in antes + migracoes + depois:
        sql = re.sub(r'(?im)^\s*PRAGMA\s+foreign_keys\s*=\s*\w+\s*;', '', p.read_text(encoding='utf-8-sig'))
        try:
            con.executescript(sql)
        except sqlite3.Error as e:
            raise SystemExit(f'erro ao aplicar {p.name}: {e}')
    return con, len(migracoes)


def extrair(con, ref):
    def q(sql, *args):
        return con.execute(sql, args).fetchall()

    def vigente(fim):
        return fim is None or str(fim)[:10] >= ref

    situacoes = {sid: (cd, desc) for sid, cd, desc in q(
        'select distinct s.SITR_ID, s.SITR_CD, s.SITR_DESCRICAO from SITUACAO_TRIBUTARIA s '
        'join TRIBUTO_SITUACAO_TRIBUTARIA t on t.TRST_SITR_ID = s.SITR_ID where t.TRST_TBTO_ID in (2, 3, 4)')}
    cst = {cd: desc for cd, desc in situacoes.values()}

    cc = {}
    for cid, cd, desc, sid, tipo, nomenclatura, inicio, fim in q(
            'select CLTR_ID, CLTR_CD, CLTR_DESCRICAO, CLTR_SITR_ID, CLTR_TIPO_ALIQUOTA, CLTR_NOMENCLATURA, '
            'CLTR_INICIO_VIGENCIA, CLTR_FIM_VIGENCIA from CLASSIFICACAO_TRIBUTARIA order by CLTR_CD, CLTR_ID'):
        if sid not in situacoes:
            continue  # Imposto Seletivo
        if cd in cc:
            raise SystemExit(f'cClassTrib {cd} aparece duas vezes entre as classificações do IBS/CBS')
        reducao = {'cbs': 0.0, 'uf': 0.0, 'mun': 0.0}
        for tributo, valor, fim_red in q(
                'select PERE_TBTO_ID, PERE_VALOR, PERE_FIM_VIGENCIA from PERCENTUAL_REDUCAO '
                'where PERE_CLTR_ID = ? order by PERE_INICIO_VIGENCIA, PERE_ID', cid):
            if tributo in TRIBUTOS and vigente(fim_red):
                reducao[TRIBUTOS[tributo]] = float(valor)
        ncms, excecoes = set(), set()
        for nid, ncm, fim_ncm in q('select NCMA_ID, NCMA_NCM_CD, NCMA_FIM_VIGENCIA from NCM_APLICAVEL where NCMA_CLTR_ID = ?', cid):
            if not vigente(fim_ncm):
                continue
            ncms.add(ncm)
            for exc, fim_exc in q('select ENCM_NCM_CD, ENCM_FIM_VIGENCIA from EXCECAO_NCM_APLICAVEL where ENCM_NCMA_ID = ?', nid):
                if vigente(fim_exc):
                    excecoes.add(exc)
        artigo = q('select l.FDLG_TEXTO_CURTO from FUNDAMENTACAO_CLASSIFICACAO f join FUNDAMENTACAO_LEGAL l on l.FDLG_ID = f.FDCL_FDLG_ID '
                   'where f.FDCL_CLTR_ID = ? order by f.FDCL_INICIO_VIGENCIA desc, f.FDCL_ID desc', cid)
        cc[cd] = {
            'cst': situacoes[sid][0], 'd': desc, 't': tipo, 'n': nomenclatura,
            'i': str(inicio)[:10] if inicio else None, 'f': str(fim)[:10] if fim else None,
            'r': reducao, 'ncm': sorted(ncms), 'x': sorted(excecoes), 'a': artigo[0][0] if artigo else ''
        }
    # versão mais alta pelo número (uma migration antiga gravou "v0012" em minúsculas)
    versao = q('select upper(VRBD_VERSAO_BASE_DADO) from VERSAO_BASE_DADO '
               'order by cast(substr(VRBD_VERSAO_BASE_DADO, 2) as integer) desc, VRBD_ID desc limit 1')[0][0]
    return {'versao': versao, 'cst': cst, 'cc': cc}


def resumo_mudancas(antigo, novo):
    if not antigo:
        return ['arquivo novo']
    linhas = []
    if antigo.get('versao') != novo['versao']:
        linhas.append(f"base: {antigo.get('versao')} -> {novo['versao']}")
    a, n = antigo.get('cc', {}), novo['cc']
    novos = sorted(set(n) - set(a))
    removidos = sorted(set(a) - set(n))
    alterados = sorted(k for k in set(a) & set(n) if a[k] != n[k])
    if novos:
        linhas.append(f'cClassTrib novos ({len(novos)}): ' + ', '.join(novos))
    if removidos:
        linhas.append(f'cClassTrib removidos ({len(removidos)}): ' + ', '.join(removidos))
    if alterados:
        linhas.append(f'cClassTrib alterados ({len(alterados)}): ' + ', '.join(alterados))
    if antigo.get('cst') != novo['cst']:
        linhas.append('tabela de CST alterada')
    return linhas or ['sem mudanças']


def main(argv):
    args = [a for a in argv if not a.startswith('--')]
    ref = datetime.date.today().isoformat()
    if '--data' in argv:
        ref = argv[argv.index('--data') + 1]
        args.remove(ref)
    if not args:
        raise SystemExit(__doc__)
    pasta = Path(args[0])
    saida = Path(args[1]) if len(args) > 1 else Path(__file__).resolve().parent.parent / 'dados' / 'tabelas_rtc.json'
    con, n_migracoes = montar(pasta)
    dados = extrair(con, ref)
    antigo = json.loads(saida.read_text(encoding='utf-8')) if saida.exists() else None
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(dados, ensure_ascii=False, indent=1, sort_keys=True) + '\n', encoding='utf-8', newline='\n')
    print(f"tabelas {dados['versao']}: {len(dados['cst'])} CST e {len(dados['cc'])} cClassTrib "
          f"({n_migracoes} migrations; vigência de referência {ref}) -> {saida}")
    for linha in resumo_mudancas(antigo, dados):
        print(' - ' + linha)


if __name__ == '__main__':
    main(sys.argv[1:])
