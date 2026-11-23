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

A pasta `public/` é gerada pelo build e não vai para o git.

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

## O site é público

A URL `.onrender.com` abre para qualquer pessoa que a tenha. Nada da empresa fica embutido na página: os exemplos são fictícios, e as notas que cada pessoa solta ficam só no navegador dela. A página pede aos buscadores que não a indexem (`noindex`).

O que fica salvo, só no `localStorage` do navegador de quem usa:
- o CNPJ digitado (`rtc.cnpj`);
- o cenário da CBS (`rtc.cbs27`);
- a última ferramenta aberta (`rtc.modo`);
- a lista da calculadora de crédito (`rtc.creditos`), com descrição, valor e regime de cada compra. O botão **Limpar lista** apaga essa lista.

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
