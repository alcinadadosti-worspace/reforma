# Auditor de Notas RTC

Confere o IBS e a CBS de NF-e, NFC-e e NFS-e (XML ou PDF) contra as tabelas oficiais da calculadora da Receita Federal e simula a operação em 2027.

É um site estático. A análise roda inteira no navegador e nenhuma nota é enviada para servidor nenhum. No Render isso é garantido pelo cabeçalho `Content-Security-Policy` com `connect-src 'none'`: mesmo que alguém altere o código, o navegador bloqueia qualquer envio.

## Estrutura

```
src/auditor-notas.template.html   a página: HTML, CSS e JS (a lógica fica entre /*CORE-START*/ e /*CORE-END*/)
dados/tabelas_rtc.json            CST, cClassTrib, reduções e NCMs da calculadora da RFB (base V0059)
exemplos/                         as 2 NF-e fictícias dos botões de exemplo
build.mjs                         junta tudo em public/index.html (Node 18+, sem dependências)
render.yaml                       configuração do Render: site estático e cabeçalhos de segurança
```

A pasta `public/` é gerada pelo build e não vai para o git.

## Rodar local

```
node build.mjs
```

Depois abra `public/index.html` no navegador. A página precisa de internet para as fontes e para o leitor de PDF (pdf.js do cdnjs).

## Deploy no Render

1. Suba este repositório no GitHub. Pode ser privado.
2. No Render, vá em **New → Blueprint**, escolha o repositório e clique em **Apply**. O `render.yaml` cria o site estático `auditor-notas-rtc`, roda `node build.mjs` e publica a pasta `public/`.
3. A partir daí, cada push na branch principal publica uma versão nova.

Também dá para criar pelo painel, em **New → Static Site**, com Build Command `node build.mjs` e Publish Directory `public`. Nesse caso o Render não lê o `render.yaml`, então os cabeçalhos de segurança precisam ser cadastrados à mão em **Settings → Headers**.

## O site é público

A URL `.onrender.com` abre para qualquer pessoa que a tenha. Nada da empresa fica embutido na página: os exemplos são fictícios, e as notas que cada pessoa solta ficam só no navegador dela. O CNPJ digitado é salvo apenas no `localStorage` daquele navegador. A página pede aos buscadores que não a indexem (`noindex`).

## Atualizar as tabelas da Receita

Quando a RFB publicar uma versão nova das migrations do banco (repositório `calculadora-rtc-regime-regular`), siga estes passos:

1. Monte o SQLite com `ferramentas/montar_banco.py`, na pasta do projeto.
2. Regere `dados/tabelas_rtc.json`. A extração do banco para o JSON ainda é manual: não virou script.
3. Rode `node build.mjs`, faça commit e push.

## Limites

- **DANFE em PDF:** a conferência é parcial, só chave e valor total. O DANFE não traz CST nem cClassTrib por item; para auditar item a item, use o XML.
- **Diferimento e monofasia:** não são recalculados.
- **Alíquota da CBS de 2027:** ainda não foi fixada pelo Senado. A página permite escolher o cenário: 11,2% pelo cálculo do TCU, ou outro valor no controle deslizante.
- **Natureza da ferramenta:** é uma ferramenta de apoio e não substitui a contabilidade.
