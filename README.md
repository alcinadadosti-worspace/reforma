# Auditor de Notas RTC

Confere o IBS e a CBS de NF-e, NFC-e e NFS-e (XML ou PDF) contra as tabelas oficiais da calculadora da Receita Federal, simula a operação em 2027 e calcula o crédito de IBS/CBS das compras.

É um site estático. Tudo roda no navegador, e nenhuma nota é enviada para servidor nenhum. No Render isso é garantido pelo cabeçalho `Content-Security-Policy` com `connect-src 'none'`: mesmo que alguém altere o código, o navegador bloqueia qualquer envio.

## As duas ferramentas

- **Auditar notas:** solte o XML ou o PDF e veja o veredito, as conferências item a item e a simulação de 2027.
- **Calculadora de crédito:** digite o valor de uma nota de compra e o regime do fornecedor (regular, Simples, MEI ou pessoa física) e veja quanto de CBS e IBS a empresa poderá abater a partir de 2027. Para o regime regular, também dá para informar se o imposto já está dentro do valor, se há redução (30% ou 60%) e o ICMS da nota. Dá para juntar várias notas numa lista e ver o total, e quanto crédito se perde com fornecedores do Simples, MEI e pessoa física.

## Estrutura

```
src/auditor-notas.template.html   a página: HTML, CSS e JS (a lógica fica entre /*CORE-START*/ e /*CORE-END*/)
dados/tabelas_rtc.json            CST, cClassTrib, reduções e NCMs da calculadora da RFB (base V0059)
exemplos/                         as 2 NF-e fictícias dos botões de exemplo
build.mjs                         junta tudo em public/index.html (Node 18+, sem dependências)
render.yaml                       configuração do Render para o caminho Blueprint: site estático e cabeçalhos de segurança
```

A pasta `public/` é gerada pelo build e não vai para o git. Ela tem o `index.html` e o `versao.svg` (veja "Atualização automática").

## Rodar local

```
node build.mjs
```

Depois abra `public/index.html` no navegador. A página precisa de internet para as fontes e para o leitor de PDF (pdf.js do cdnjs).

## Deploy no Render

Primeiro suba este repositório no GitHub. Pode ser privado.

### Como Static Site (pelo painel)

1. No Render, vá em **New → Static Site** e conecte o repositório. Se ele for privado, autorize o Render a acessá-lo no GitHub.
2. Preencha os campos:
   - **Branch:** `main`
   - **Root Directory:** em branco
   - **Build Command:** `node build.mjs`
   - **Publish Directory:** `public`
3. Clique em **Create Static Site**. Em um ou dois minutos o site fica no ar em `https://<nome>.onrender.com`.
4. Em **Settings → Headers**, cadastre os cabeçalhos de segurança. Neste caminho o Render não lê o `render.yaml`. Use o caminho `/*` em todos:

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

1. A cada build, o `build.mjs` calcula uma assinatura do conteúdo da página e grava em `public/versao.svg` (como largura x altura da imagem). A mesma assinatura vai dentro da página.
2. A página confere o `versao.svg` 10 s depois de abrir, a cada 5 minutos e sempre que a pessoa volta para a aba. Como é uma imagem do próprio site, isso cabe na CSP (`img-src 'self'`): o `connect-src` continua `'none'`, e não é preciso mudar nenhum cabeçalho no Render.
3. Se a assinatura mudou, a página espera a pessoa ficar 30 s sem mexer, ou sair da aba. Então guarda as notas abertas e o que foi digitado na `sessionStorage` daquela aba, recarrega e restaura tudo. Aparece o aviso "App atualizado para a versão mais nova".
4. Se não der para guardar (por exemplo, PDFs grandes demais para a `sessionStorage`), aparece um aviso com o botão "Atualizar agora".

Republicar sem mudar nada gera a mesma assinatura, e ninguém recarrega. O mecanismo só funciona no site publicado (http/https). Abrindo o arquivo local ou no Artifact do Claude, ele fica desligado.

## O site é público

A URL `.onrender.com` abre para qualquer pessoa que a tenha. Nada da empresa fica embutido na página: os exemplos são fictícios, e as notas que cada pessoa solta ficam só no navegador dela. A página pede aos buscadores que não a indexem (`noindex`).

O que fica salvo, só no `localStorage` do navegador de quem usa:
- o CNPJ digitado (`rtc.cnpj`);
- o cenário da CBS (`rtc.cbs27`);
- a última ferramenta aberta (`rtc.modo`);
- a lista da calculadora de crédito (`rtc.creditos`), com descrição, valor e regime de cada compra. O botão **Limpar lista** apaga essa lista.

Durante uma atualização automática, as notas abertas e o que foi digitado ficam por um instante na `sessionStorage` da aba (`rtc.restaurar`) e são apagados assim que a página volta.

O tema é sempre o claro, em papel de jornal, mesmo com o navegador no modo escuro.

## Atualizar as tabelas da Receita

Quando a RFB publicar uma versão nova das migrations do banco (repositório `calculadora-rtc-regime-regular`), siga estes passos:

1. Monte o SQLite com `ferramentas/montar_banco.py`, na pasta do projeto.
2. Regere `dados/tabelas_rtc.json`. A extração do banco para o JSON ainda é manual: não virou script.
3. Rode `node build.mjs`, faça commit e push.

## Limites

- **DANFE em PDF:** a conferência é parcial, só chave e valor total. O DANFE não traz CST nem cClassTrib por item; para auditar item a item, use o XML.
- **Diferimento e monofasia:** não são recalculados.
- **Alíquota da CBS de 2027:** ainda não foi fixada pelo Senado. A página permite escolher o cenário: 11,2% pelo cálculo do TCU, ou outro valor no controle deslizante.
- **Calculadora de crédito:** é uma estimativa com as alíquotas de 2027 e 2028. O crédito real é o IBS/CBS destacado na nota do fornecedor. Para o Simples, o crédito só é calculado se você informar o percentual que vem na nota dele.
- **Natureza da ferramenta:** é uma ferramenta de apoio e não substitui a contabilidade.
