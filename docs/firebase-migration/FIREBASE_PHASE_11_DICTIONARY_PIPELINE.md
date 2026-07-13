# Fase 11: Pipeline e Pacote Essencial

> Iniciada em: 2026-07-13
>
> Status: concluida
>
> Recorte concluido: Fases 11.1 a 11.5
>
> Proxima fase: Fase 12 - indices, shards e cache

## Objetivo

Gerar um pacote inicial pequeno e reproduzivel de vocabulario e kanji sem
alterar o dicionario legado antes da comparacao final. Fontes, versoes,
licencas, traducoes e revisoes devem permanecer rastreaveis.

## Fase 11.1: Fontes e Licencas

Decisao aprovada pelo proprietario em 2026-07-13:

| Fonte | Uso | Licenca | Politica inicial |
| --- | --- | --- | --- |
| JMdict_e | vocabulario, leituras, classes e glosses em ingles | CC BY-SA 4.0 | snapshot com data e SHA-256 |
| KANJIDIC2 | metadados dos kanji | CC BY-SA 4.0 | somente campos necessarios ao app |
| KanjiVG | SVG e ordem de tracos | CC BY-SA 3.0 | somente kanji do bootstrap |
| Mathicx pt-BR | camada editorial em portugues | CC BY-SA 4.0 | revisao humana obrigatoria |

Decisoes de escopo:

- usar `JMdict_e`, sem importar glosses de terceiros em outros idiomas;
- manter glosses EDRDG em ingles separados das traducoes pt-BR;
- nao aceitar traducao automatica sem revisao humana;
- iniciar com as 42 palavras, 10 kanji e conteudo exigido pelos quizzes atuais;
- excluir o catalogo completo ate que selecao, tamanho e revisao sejam medidos;
- exigir atualizacao das fontes em no maximo 31 dias para uma nova publicacao;
- preservar atribuicoes no pacote e, posteriormente, na interface do app.

Fontes oficiais:

- EDRDG: `https://www.edrdg.org/edrdg/licence.html`;
- JMdict: `https://www.edrdg.org/jmdict/j_jmdict.html`;
- KANJIDIC2: `https://www.edrdg.org/kanjidic/kanjd2index_legacy.html`;
- KanjiVG: `https://kanjivg.tagaini.net/`.

Arquivos entregues:

- `scripts/dictionary/config/sources.json`;
- `Applications/japanese-study/data/dictionary/licenses.json`;
- `Applications/japanese-study/data/dictionary/LICENSE.md`.

## Fase 11.2: Schema Normalizado

O schema do pipeline e separado do schema de runtime criado na Fase 10. O
provider atual continua usando o JSON legado enquanto o novo pacote e gerado e
comparado.

Contratos implementados em
`scripts/dictionary/lib/pipeline-schema.mjs`:

```js
createJmdictEntryId(sequence)
createKanjiEntryId(character)
normalizeLexicalEntry(entry)
normalizeKanjiEntry(entry)
normalizeTranslation(translation)
normalizeStrokeAsset(asset)
normalizeBootstrapPackage(payload, options)
```

IDs estaveis:

```text
jmdict-1358280
kanjidic2-U+98DF
kanjivg-U+98DF
mathicx-ptbr:jmdict-1358280:jmdict-1358280:sense:1
```

Separacao de dados:

- entradas lexicais preservam o `ent_seq` do JMdict;
- kanji usam o code point Unicode, sem depender da ordem do arquivo;
- sentidos de origem guardam somente glosses ingleses importados;
- traducoes pt-BR ficam em registros editoriais separados;
- SVGs referenciam um kanji existente e preservam a fonte KanjiVG;
- cada fonte usada pelo pacote exige versao e SHA-256;
- publicacao pode exigir que todas as traducoes estejam como `reviewed`.

Validacoes atuais:

- IDs ausentes, invalidos ou duplicados;
- fontes fora da matriz aprovada;
- fonte usada mas ausente dos metadados do pacote;
- hashes SHA-256 invalidos;
- traducao sem entrada ou sentido correspondente;
- SVG sem kanji correspondente;
- traducao fora de `pt-BR` ou com status invalido;
- publicacao com traducao ainda em rascunho.

## Compatibilidade e Rollback

- `data/dictionary.json` permanece com as 42 entradas atuais;
- `data/kanji.json` permanece com os 10 kanji atuais;
- o provider V2 e o launcher nao foram alterados;
- nenhum download de fonte foi adicionado ao runtime;
- nenhuma acao no Firebase e necessaria nesta fase;
- a flag da Fase 10 continua permitindo rollback para o caminho legado.

## Testes

Executar:

```text
npm.cmd run test:dictionary-pipeline
node Applications/japanese-study/tests/dictionary-provider.test.mjs
node scripts/test-dictionary-equivalence.mjs
```

Cobertura da Fase 11 ate este recorte:

- matriz de quatro fontes e respectivas licencas;
- baseline de 42 palavras e 10 kanji;
- IDs JMdict e Unicode estaveis;
- normalizacao lexical, kanji, traducao e SVG;
- referencias internas do pacote;
- bloqueio de traducoes sem revisao.

## Fase 11.3: Importacao e Validacao

Implementado:

- leitura de snapshots XML ou XML compactado com gzip;
- decodificacao UTF-8 estrita e bloqueio de mojibake conhecido;
- verificacao opcional de SHA-256 esperado antes do parsing;
- parser XML estruturado com suporte a DTD e entidades do JMdict;
- importacao de `ent_seq`, escritas, leituras, restricoes, tags e glosses em ingles;
- importacao de kanji, tracos, grau, frequencia, leituras e significados em ingles;
- selecao pelas 42 palavras e 10 kanji do baseline atual;
- aliases entre IDs legados e IDs estaveis das fontes;
- relatorio de registros ausentes e correspondencias lexicais ambiguas;
- artefatos deterministas, sem timestamp variavel;
- validador conjunto que bloqueia ausencias obrigatorias, hashes e IDs invalidos.

Arquivos principais:

- `scripts/dictionary/config/bootstrap-selection.json`;
- `scripts/dictionary/lib/source-io.mjs`;
- `scripts/dictionary/lib/xml-sources.mjs`;
- `scripts/dictionary/lib/bootstrap-selection.mjs`;
- `scripts/dictionary/lib/import-pipeline.mjs`;
- `scripts/dictionary/import-jmdict.mjs`;
- `scripts/dictionary/import-kanjidic2.mjs`;
- `scripts/dictionary/validate-imports.mjs`.

O parser `fast-xml-parser` esta fixado na versao `5.10.0` como dependencia de
desenvolvimento. Ele nao e carregado pelo navegador nem altera o runtime
zero-build.

Comandos:

```text
npm.cmd run dictionary:import:jmdict -- \
  --input <JMdict_e.xml.gz> \
  --output <jmdict-import.json> \
  --version <data-da-fonte> \
  --expected-sha256 <hash-opcional>

npm.cmd run dictionary:import:kanjidic2 -- \
  --input <kanjidic2.xml.gz> \
  --output <kanjidic2-import.json> \
  --version <data-da-fonte> \
  --expected-sha256 <hash-opcional>

npm.cmd run dictionary:validate-imports -- \
  --jmdict <jmdict-import.json> \
  --kanjidic2 <kanjidic2-import.json>
```

No CMD do Windows, executar cada comando em uma unica linha e omitir as barras
de continuacao exibidas acima.

O download automatico e a atualizacao em CI permanecem reservados para a Fase
13. Na Fase 11, os imports devem aceitar arquivos locais fixados para que os
testes sejam repetiveis e nao dependam de rede.

Validacao automatizada deste recorte:

- 16 testes do pipeline;
- parsing de entidades DTD e atributos de idioma;
- leitura gzip, hash correto/incorreto e UTF-8 invalido;
- selecao ambigua permitida e ausencia obrigatoria bloqueada;
- igualdade byte a byte de artefatos gerados com a mesma entrada;
- execucao ponta a ponta dos dois importadores e do validador com fixtures.

## Fase 11.4: Geracao do Bootstrap N5

Implementado:

- snapshots oficiais JMdict_e e KANJIDIC2 fixados em 2026-07-13;
- release KanjiVG `r20250816` fixada e validada por SHA-256;
- somente os 10 SVGs necessarios extraidos para o app;
- `bootstrap-n5` gerado com 94 entradas lexicais e 10 kanji;
- aliases dos 42 IDs lexicais e 10 IDs de kanji preservados;
- 26 traducoes lexicais unicas geradas como `draft`;
- 10 traducoes de kanji mantidas em camada pt-BR separada;
- 16 correspondencias ambiguas enviadas para fila de revisao;
- glosses ingleses das fontes preservados sem sobrescrita;
- hashes individuais dos SVGs armazenados no pacote;
- hashes e atribuicoes dos 10 SVGs recalculados pelo validador independente;
- licencas das quatro fontes verificadas pelo validador;
- limite de 250 KB aplicado ao pacote essencial;
- publicacao bloqueada enquanto houver rascunhos.

Artefatos:

- `Applications/japanese-study/data/dictionary/packs/bootstrap-n5.json`;
- `Applications/japanese-study/data/dictionary/reports/bootstrap-n5.report.json`;
- `DICTIONARY_BOOTSTRAP_N5_REPORT.md`;
- 10 SVGs em `Applications/japanese-study/assets/strokes/kanji/`.

Resultado:

```text
42/42 palavras encontradas
26 correspondencias unicas
16 correspondencias ambiguas
10/10 kanji encontrados
10/10 SVGs KanjiVG incluidos
156.020 bytes de 256.000 permitidos
```

Comandos adicionados:

```text
npm.cmd run dictionary:generate-bootstrap -- <argumentos>
npm.cmd run dictionary:validate-bootstrap -- <argumentos>
```

O pacote foi validado independentemente depois da gravacao. Seu campo
editorial permanece `review-required` e o relatorio registra
`publication.ready: false`.

Validacao automatizada acumulada: 21 testes do pipeline, alem das suites de
regressao do Japanese Study, provider, launcher e equivalencia com o legado.

## Fase 11.5: Revisao de Conteudo e Atribuicoes

Revisar as 16 ambiguidades, as 26 traducoes lexicais e os significados dos 10
kanji. Depois da aprovacao humana, gerar uma nova versao do pacote com status
`reviewed`, confirmar as atribuicoes exibidas no Japanese Study e executar a
comparacao final com o JSON legado.

Status: **Concluida**.

Politica aprovada em 2026-07-13:

- modelo hibrido com pt-BR opcional;
- ingles usado como fallback quando nao houver traducao;
- 26 correspondencias unicas aceitas em bloco com o conteudo atual;
- significados atuais dos 10 kanji aceitos em bloco;
- novas palavras futuras nao exigem traducao pt-BR para entrar no catalogo;
- 16 ambiguidades revisadas pelo proprietario em blocos pelo chat;
- uma ambiguidade pode selecionar uma ou varias entradas JMdict;
- escolhas ficam registradas em arquivo editorial versionado.

Arquivo editorial:

- `scripts/dictionary/editorial/bootstrap-n5.review.json`;
- 26 entradas lexicais com status `accepted-baseline`;
- 10 kanji com status `accepted-baseline`;
- 16 entradas lexicais com status `reviewed`.

Resultado final:

- pacote promovido de `2026.07.13-1` para `2026.07.13-2`;
- 44 traducoes lexicais e 10 traducoes de kanji com status `reviewed`;
- zero traducoes em rascunho e zero ambiguidades pendentes;
- `publication.ready: true`, sem bloqueios;
- 44 entradas lexicais aprovadas e candidatas rejeitadas removidas do pacote;
- tamanho final de 106.673 bytes, abaixo do limite de 256.000 bytes;
- atribuicoes de JMdict, KANJIDIC2, KanjiVG e Mathicx pt-BR exibidas na aba
  Configuracoes do Japanese Study;
- comparacao final com o JSON legado aprovada;
- JSON legado mantido como fonte ativa e rollback ate as fases de distribuicao.

Validacao automatizada acumulada: 25 testes do pipeline, 58 testes do Japanese
Study, 5 testes de equivalencia e 5 testes da busca do launcher.
