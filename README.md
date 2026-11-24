# Auditor de Notas RTC

Confere o IBS e a CBS de NF-e, NFC-e e NFS-e (XML ou PDF) contra as tabelas oficiais da calculadora da Receita Federal, faz o fechamento do mês com a apuração simulada de 2027 e calcula o crédito das compras.

É um site estático. Tudo roda no navegador, e nenhuma nota é enviada para servidor nenhum. No Render isso é garantido pelo cabeçalho `Content-Security-Policy` com `connect-src 'none'`: mesmo que alguém altere o código, o navegador bloqueia qualquer envio.

## As três ferramentas

- **Auditar notas:** solte o XML ou o PDF e veja o veredito, as conferências item a item e a simulação de 2027.
- **Fechamento do mês:** solte as notas do mês de uma vez, vendas e compras juntas (XML, ZIP, a pasta inteira ou PDF de NFS-e). Aparecem:
  - a **apuração simulada de 2027**: débito das vendas, menos devoluções, menos crédito das compras, por CBS e por IBS, com o valor a pagar ou o saldo credor;
  - as notas com problema, que podem ser abertas no auditor;
  - os fornecedores e o crédito de cada um;
  - o resumo por CFOP e a lista de notas, com filtro por mês.

  **Regras da apuração:**
  - Venda gera débito.
  - Compra gera crédito: integral de fornecedor do regime regular, zero de MEI e "não estimado" de fornecedor do Simples, porque o crédito é só o que ele recolhe no DAS. Importação (nota de entrada com CFOP 3xxx) também gera crédito.
  - Devoluções (`finNFe` 4) abatem o débito ou o crédito.
  - Nota de crédito (`finNFe` 5) emitida pela empresa abate o débito; recebida de fornecedor, abate o crédito. Nota de débito (`finNFe` 6) faz o contrário. Vale também a emitida para a própria empresa (estorno ou apropriação de crédito).
  - Ficam fora:
    - transferências entre filiais;
    - notas canceladas (eventos 110111 e 110112 da NF-e; e101101, e105102, e105104 e e305101 da NFS-e, soltos junto);
    - notas denegadas;
    - notas de homologação (ambiente de teste, sem valor fiscal).
  - Nota repetida (mesma chave) conta uma vez.
  - Não entram e aparecem como ignorados:
    - lote de envio com várias NF-e no mesmo arquivo: solte o XML autorizado de cada uma;
    - DPS solta: o que vale é a NFS-e gerada a partir dela.
  - Notas de 2026 são recalculadas com as alíquotas de 2027. De 2027 em diante, vale o valor destacado na nota. Item sem IBS/CBS destacado é simulado, com tributação integral, e a nota aparece entre as com problema.

  O CNPJ do topo separa vendas de compras. Se estiver em branco, o app sugere a empresa pelos CNPJs que mais aparecem. O CNPJ alfanumérico, emitido desde julho de 2026, também é aceito.

  O veredito de cada nota acompanha o cenário da CBS escolhido: trocar o cenário refaz o alerta "CBS diferente do cenário" sem precisar soltar as notas de novo.
- **Calculadora de crédito:** digite o valor de uma nota de compra e o regime do fornecedor (regular, Simples, MEI ou pessoa física) e veja quanto de CBS e IBS a empresa poderá abater a partir de 2027. Para o regime regular, dá para informar se o imposto está dentro do valor, se há redução (30% ou 60%) e o ICMS da nota. A lista soma várias notas e mostra o crédito que se perde com fornecedores do Simples, MEI e pessoa física.

**Relatórios:** nas três ferramentas, "Exportar Excel" baixa um `.xlsx` compactado com várias abas (valores em R$, datas, cabeçalho fixo, filtro e CPF mascarado). O fechamento de um mês com 12 mil NFC-e sai com cerca de 3 MB. "Salvar PDF" abre a impressão já formatada (uma coluna, sem botões, com data e cenário da CBS no topo); escolha "Salvar como PDF" no destino.

## Estrutura

```
src/auditor-notas.template.html   a página: HTML, CSS e JS (a lógica fica entre /*CORE-START*/ e /*CORE-END*/)
dados/tabelas_rtc.json            CST, cClassTrib, reduções e NCMs da calculadora da RFB (a base está no campo versao)
exemplos/                         as 2 NF-e fictícias dos botões de exemplo
build.mjs                         junta tudo em public/index.html e public/versao.svg (Node 18+, sem dependências)
render.yaml                       configuração do Render para o caminho Blueprint: site estático e cabeçalhos de segurança
ferramentas/atualizar_tabelas.py  gera dados/tabelas_rtc.json a partir das migrations da Receita (só Python padrão)
testes/                           testes automáticos (lógica, navegador e atualização) e as notas fictícias deles
.github/workflows/                testes a cada push e atualização semanal das tabelas
```

A pasta `public/` é gerada pelo build e não vai para o git.

## Rodar local

```
node build.mjs
```

Depois abra `public/index.html` no navegador. A página precisa de internet para as fontes e para o leitor de PDF (pdf.js do cdnjs).

## Testes

```
npm ci
npm test
```

São três suítes, e todas usam notas fictícias:
- `testes/teste_nucleo.mjs`: a lógica (calculadora, auditoria, fechamento de um mês fictício com os valores conferidos à mão, ZIP e Excel).
- `testes/teste_navegador.mjs`: as três ferramentas no Chrome ou Edge sem janela, servidas com os cabeçalhos do `render.yaml`. Confere os Excel baixados, a impressão, a tela de celular e que não há violação da CSP nem erro de console.
- `testes/teste_atualizacao.mjs`: simula deploys com uma aba aberta e leva cerca de 3 minutos. Cobre três casos: trabalho em andamento, fechamento aberto (com o botão "Atualizar agora") e a internet caindo antes da recarga.

O navegador é achado sozinho (Edge ou Chrome). Se precisar, informe o caminho na variável `NAVEGADOR`. Com `CAPTURAS=<pasta>`, o teste de navegador grava capturas de tela e o PDF do fechamento. Com `SITE=<url>`, ele testa o site publicado em vez da pasta `public/`, por exemplo `SITE=https://seu-site.onrender.com/ node testes/teste_navegador.mjs`.

No GitHub, a automação **Testes** roda tudo isso a cada push e manda e-mail se algo falhar.

## Deploy no Render

Primeiro suba este repositório no GitHub. Pode ser privado.

### Como Static Site (pelo painel)

1. No Render, vá em **New → Static Site** e conecte o repositório. Se ele for privado, autorize o Render a acessá-lo no GitHub.
2. Preencha os campos:
   - **Branch:** `main`
   - **Root Directory:** em branco
   - **Build Command:** `node build.mjs`
   - **Publish Directory:** `public`
3. Clique em **Create Static Site**.
4. Em **Settings → Headers**, cadastre os cabeçalhos de segurança, todos com o caminho `/*`. Neste caminho o Render não lê o `render.yaml`.

| Name | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `no-referrer` |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=(), payment=()` |
| `X-Robots-Tag` | `noindex, nofollow` |

5. A partir daí, cada push na branch `main` publica uma versão nova.

Para conferir os cabeçalhos, abra o site, aperte F12 e vá em **Network**. Recarregue a página, clique no documento e veja os **Response Headers**.

### Como Blueprint

Em **New → Blueprint**, escolha o repositório e clique em **Apply**. O `render.yaml` cria o mesmo site, já com os cabeçalhos. Se o Render recusar o bloco `headers`, use o caminho acima.

## Atualização automática

Depois de um deploy, ninguém precisa dar F5. Quem abrir o site recebe a versão nova, e as abas que já estavam abertas se atualizam sozinhas:

1. A cada build, o `build.mjs` calcula uma assinatura do conteúdo da página e a grava em `public/versao.svg`, como largura x altura da imagem. A mesma assinatura vai dentro da página.
2. A página confere o `versao.svg` 10 s depois de abrir, a cada 5 minutos e sempre que a pessoa volta para a aba. Como é uma imagem do próprio site, isso cabe na CSP (`img-src 'self'`): o `connect-src` continua `'none'`, e não é preciso mudar nenhum cabeçalho no Render.
3. Se a assinatura mudou, a página espera a pessoa ficar 30 s sem mexer, ou sair da aba. Arrastar e soltar arquivos conta como uso. A página também espera:
   - o seletor de arquivos do sistema fechar;
   - os arquivos soltos terminarem de ser lidos;
   - a internet voltar. Antes de recarregar, ela confere de novo o `versao.svg`: sem conexão, recarregar trocaria o app pela página de erro do navegador.

   Então guarda as notas abertas e o que foi digitado na `sessionStorage` daquela aba, recarrega e restaura tudo. Aparece o aviso "App atualizado para a versão mais nova".
4. Se não der para guardar, aparece um aviso com os botões "Atualizar agora" e "Depois". Isso acontece com um fechamento do mês aberto (grande demais para a `sessionStorage`) ou com PDFs muito grandes. "Atualizar agora" guarda as notas do auditor e a calculadora antes de recarregar; só o fechamento precisa ser refeito.

Republicar sem mudar nada gera a mesma assinatura, e ninguém recarrega. O mecanismo só funciona no site publicado (http/https). Abrindo o arquivo local ou no Artifact do Claude, ele fica desligado.

## Tabelas da Receita: atualização semanal

Toda segunda-feira às 6h (horário de Brasília), a automação **Atualizar tabelas da Receita** faz assim:
1. Baixa o repositório `ReceitaFederal/calculadora-rtc-regime-regular`.
2. Regera `dados/tabelas_rtc.json`.
3. Se algo mudou, roda os testes e, se passarem, publica o commit na `main`. O commit informa os códigos novos, removidos e alterados.
4. O Render faz o deploy, e as abas abertas se atualizam sozinhas.

Para rodar na hora: no GitHub, **Actions → Atualizar tabelas da Receita → Run workflow**.

Para rodar na sua máquina:

```
git clone --depth 1 https://github.com/ReceitaFederal/calculadora-rtc-regime-regular.git ../receita
python ferramentas/atualizar_tabelas.py ../receita/flyway/sql
node build.mjs
```

O script monta o banco como o Flyway (beforeMigrate, B0001, V0002.. e afterMigrate). Ele extrai o IBS/CBS (o Imposto Seletivo fica de fora) e deixa de fora NCMs, exceções e reduções com vigência já encerrada.

Atenção: em repositório público, o GitHub desliga as automações agendadas depois de 60 dias sem nenhum commit. Se isso acontecer, reative em **Actions**.

## O site é público

A URL `.onrender.com` abre para qualquer pessoa que a tenha. Nada da empresa fica embutido na página: os exemplos são fictícios, e as notas que cada pessoa solta ficam só no navegador dela. A página pede aos buscadores que não a indexem (`noindex`).

O que fica salvo, só no `localStorage` do navegador de quem usa:
- o CNPJ digitado (`rtc.cnpj`);
- o cenário da CBS (`rtc.cbs27`);
- a última ferramenta aberta (`rtc.modo`);
- a lista da calculadora de crédito (`rtc.creditos`), com descrição, valor e regime de cada compra. O botão **Limpar lista** apaga essa lista.

O fechamento do mês fica só na memória da aba: some ao fechar ou recarregar.

Durante uma atualização automática, as notas abertas e o que foi digitado ficam por um instante na `sessionStorage` da aba (`rtc.restaurar`) e são apagados assim que a página volta.

O tema é sempre o claro, em papel de jornal, mesmo com o navegador no modo escuro.

## Limites

- **DANFE em PDF:** a conferência é parcial, só chave e valor total. O DANFE não traz CST nem cClassTrib por item; para auditar item a item, ou para a nota entrar no fechamento, use o XML.
- **Diferimento e monofasia:** não são recalculados.
- **NFS-e:** a base da simulação é o valor do serviço menos o desconto incondicionado e o ISSQN, como na calculadora da Receita. Na NFS-e de locação de imóvel (subitem 99.03), as regras próprias não são aplicadas.
- **Alíquota da CBS de 2027:** ainda não foi fixada pelo Senado. A página permite escolher o cenário: 11,2% pelo cálculo do TCU, ou outro valor no controle deslizante.
- **Calculadora de crédito e fechamento:** são estimativas com as alíquotas de 2027 e 2028. O crédito real é o IBS/CBS destacado na nota do fornecedor. Para o Simples, a calculadora só calcula o crédito se você informar o percentual que vem na nota dele.
- **Natureza da ferramenta:** é uma ferramenta de apoio e não substitui a contabilidade.
