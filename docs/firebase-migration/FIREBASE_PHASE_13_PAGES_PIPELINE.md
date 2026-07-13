# Fase 13: Pipeline do Dicionario no GitHub Pages

> Status: concluida
>
> Atualizado em: 2026-07-13

## 1. Objetivo

Publicar o Mathicx-File e a distribuicao versionada do dicionario pelo mesmo
workflow controlado, impedindo que dependencias, fontes editoriais, testes ou
configuracoes locais entrem no artefato do GitHub Pages.

## 2. Decisoes

- O pacote editorial aprovado permanece como fonte canonica no repositorio.
- O diretorio `_site/` e descartavel e sempre reconstruido pelo CI.
- A publicacao usa uma lista positiva de arquivos de runtime.
- Pacotes, licencas, rotas, indices, shards e manifesto recebem caminhos com a
  versao do dicionario.
- `releases/current.json` e o unico ponteiro estavel; cada release tambem possui
  `releases/{versao}.json`.
- Hash SHA-256 e tamanho de cada artefato sao verificados antes do upload.
- O GitHub Pages controla os headers HTTP. A imutabilidade dos dados e obtida
  por URLs versionadas; uma versao nova nunca sobrescreve os chunks anteriores.

## 3. Estrutura Publicada

```text
_site/
  index.html
  .nojekyll
  src/
  styles/
  Applications/
    japanese-study/data/dictionary/
      releases/current.json
      releases/{versao}.json
      manifests/{versao}.json
      packs/{versao}/bootstrap-n5.json
      licenses/{versao}.json
      routes/{versao}/...
      shards/entries/{versao}/...
      indexes/{versao}/...
```

Nao sao publicados `node_modules`, `.git`, `.github`, `docs`, `scripts`, testes,
arquivos `.env`, configuracoes `*.local.js`, manifests npm ou relatorios de
trabalho.

## 4. Subfases

### 13.1 - Geracao e validacao

Status: **Concluida localmente**.

O job instala dependencias com Node.js 22 e executa os testes do pipeline, do
Japanese Study, da equivalencia, do launcher e do proprio artefato do Pages.

### 13.2 - Firebase de producao

Status: **Concluida localmente**.

O validador exige `apiKey`, `authDomain`, `projectId` e `appId` preenchidos em
`src/firebase/firebase-config.prod.js`. A configuracao local e explicitamente
excluida do pacote.

### 13.3 - Artefato estatico versionado

Status: **Concluida localmente**.

Comandos:

```bash
npm run pages:build
npm run pages:validate
npm run test:pages-artifact
```

O upload do Pages aponta somente para `_site`, e nao mais para a raiz do
repositorio.

### 13.4 - Smoke test publico

Status: **Concluida em 2026-07-13**.

Depois do push para `main`:

1. Confirmar que os jobs `build` e `deploy` terminaram com sucesso.
2. Abrir `https://mathicx-file.github.io/mathicx-desktop/` sem cache forçado.
3. Fazer login e abrir o Japanese Study.
4. Pesquisar uma palavra e confirmar que nao ha respostas 404 ou erros de hash.
5. Abrir `Applications/japanese-study/data/dictionary/releases/current.json`
   sob a URL publica e confirmar a versao esperada.

Evidencias da primeira publicacao:

- commit publicado: `ef6fce1`;
- workflow `Deploy GitHub Pages #16`: jobs `build` e `deploy` aprovados;
- raiz, `src/main.js` e Japanese Study responderam HTTP 200;
- release publica `2026.07.13-2`, com 137 artefatos;
- manifesto, routes, shard de entradas e indice de romaji responderam HTTP 200;
- descritores versionados conferidos por tamanho e SHA-256.

### 13.5 - Rollback

Status: **Concluida e documentada**.

Em `Actions > Deploy GitHub Pages > Run workflow`, preencher `ref` com o commit
ou tag anteriormente validado. O workflow faz checkout dessa referencia,
reconstroi e valida seu `_site` antes de republicar. Deixar `ref` vazio publica
o commit atual da branch selecionada.

Esse procedimento restaura conjuntamente o aplicativo e o ponteiro
`releases/current.json` correspondentes ao commit escolhido. Nenhum arquivo do
Firestore e alterado pelo rollback do Pages.

## 5. Criterio de Conclusao

**Atendido.** O primeiro deploy pelo novo workflow passou e o smoke test da
subfase 13.4 confirmou a distribuicao versionada na URL publica.
