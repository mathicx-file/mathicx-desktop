# Fase 12: Indices, Shards e Cache

> Iniciada em: 2026-07-13
>
> Status: concluida
>
> Recorte concluido: Fases 12.1 a 12.6

## Objetivo

Permitir que o catalogo cresca sem exigir um JSON monolitico nem consultas ao
Firestore durante a pesquisa. O pacote `bootstrap-n5` continua local e
monolitico; shards sao usados para entradas adicionais carregadas sob demanda.

## Fase 12.1: Shards e IDs Estaveis

Status: **Concluida**.

### Contrato aprovado

- IDs lexicais continuam baseados na sequencia oficial JMdict;
- rota calculada por SHA-256 do ID em UTF-8;
- os dois primeiros caracteres hexadecimais definem o shard;
- existem 256 buckets logicos (`00` a `ff`);
- somente buckets nao vazios sao gravados;
- entradas e traducoes pt-BR ficam juntas no mesmo arquivo;
- registros sao ordenados por ID para manter geracao deterministica;
- aliases legados permanecem no pacote essencial;
- kanji, SVGs, indices, routes e manifesto nao fazem parte deste recorte.

Configuracao versionada:

- `scripts/dictionary/config/sharding.json`;
- ideal comprimido entre 50 KiB e 250 KiB;
- maximo comprimido de 500 KiB;
- tamanho abaixo do ideal gera metrica, nao bloqueio;
- tamanho acima do maximo bloqueia a validacao.

### Pipeline

Comandos:

```text
npm.cmd run dictionary:generate-entry-shards -- <argumentos>
npm.cmd run dictionary:validate-entry-shards -- <argumentos>
```

O validador rejeita:

- schema ou versao de pacote incompativel;
- shard vazio ou duplicado;
- entrada armazenada no prefixo incorreto;
- entrada ou traducao ausente, duplicada ou alterada;
- traducao separada de sua entrada;
- ordenacao nao deterministica;
- arquivo acima do limite comprimido.

### Medicao do Bootstrap

| Item | Resultado |
| --- | ---: |
| Entradas lexicais | 44 |
| Traducoes lexicais | 44 |
| Buckets logicos | 256 |
| Shards nao vazios | 39 |
| Entradas por shard | 1 a 3 |
| Total sem compressao | 92.900 bytes |
| Total comprimido estimado | 23.177 bytes |
| Maior shard sem compressao | 6.849 bytes |
| Maior shard comprimido | 940 bytes |

Todos os 39 arquivos ficam abaixo do tamanho ideal porque o bootstrap e
deliberadamente pequeno. Por isso, eles sao evidencia do contrato e entrada
para os testes das proximas subfases, mas nao substituem o carregamento
monolitico do pacote essencial.

Artefatos:

- `Applications/japanese-study/data/dictionary/shards/entries/2026.07.13-2/`;
- `Applications/japanese-study/data/dictionary/reports/bootstrap-n5.shards.report.json`;
- `scripts/dictionary/lib/entry-shards.mjs`;
- `scripts/dictionary/tests/entry-shards.test.mjs`.

Validacao acumulada neste recorte:

- 28 testes do pipeline;
- 58 testes do Japanese Study;
- 5 testes de equivalencia com o legado;
- 5 testes da busca do launcher;
- segunda geracao byte a byte identica para os 39 shards e o relatorio.

## Fase 12.2: Indices de Busca

Status: **Concluida**.

Foram gerados quatro indices invertidos, sempre no formato `termo -> IDs`:

- `written`: formas escritas em NFKC e paginas Unicode de 256 caracteres;
- `reading`: leituras convertidas para hiragana e roteadas pelo primeiro kana;
- `romaji`: WanaKana 5.3.1, estilo Hepburn, com variante compacta sem apostrofo;
- `pt`: tokens alfanumericos pt-BR normalizados sem acentos.

A WanaKana e dependencia apenas do pipeline. Nenhum codigo adicional foi
incluido no navegador. A configuracao e a versao ficam fixadas em
`scripts/dictionary/config/search-indexes.json`.

### Medicao do Bootstrap

| Indice | Shards | Termos | Referencias | Entradas cobertas | Comprimido |
| --- | ---: | ---: | ---: | ---: | ---: |
| Escrita | 25 | 42 | 42 | 30 | 5.766 bytes |
| Leitura | 32 | 57 | 59 | 44 | 7.691 bytes |
| Romaji | 15 | 57 | 59 | 44 | 3.677 bytes |
| Portugues | 18 | 49 | 53 | 44 | 4.259 bytes |
| **Total** | **90** | **205** | **213** | - | **21.393 bytes** |

As 14 entradas sem forma escrita oficial continuam cobertas por leitura,
romaji e portugues. Uma verificacao permanente executa 137 consultas sobre os
42 itens legados e confirma resolucao para pelo menos um ID aprovado por alias.

Assim como nos entry shards, os arquivos do bootstrap ficam abaixo do tamanho
ideal por causa do recorte pequeno. Eles validam o contrato, mas ainda nao sao
carregados pelo runtime.

Artefatos:

- `Applications/japanese-study/data/dictionary/indexes/2026.07.13-2/`;
- `Applications/japanese-study/data/dictionary/reports/bootstrap-n5.indexes.report.json`;
- `scripts/dictionary/lib/search-indexes.mjs`;
- `scripts/dictionary/tests/search-indexes.test.mjs`.

Comandos:

```text
npm.cmd run dictionary:generate-search-indexes -- <argumentos>
npm.cmd run dictionary:validate-search-indexes -- <argumentos>
```

Validacao acumulada apos a Fase 12.2:

- 32 testes do pipeline;
- 58 testes do Japanese Study;
- 5 testes de equivalencia com o legado;
- 5 testes da busca do launcher;
- 137 verificacoes de cobertura dos 42 registros legados;
- segunda geracao byte a byte identica para os 90 shards e o relatorio;
- dependencia WanaKana auditada sem vulnerabilidades conhecidas pelo npm.

## Fase 12.3: Routes, Hashes e Manifesto

Status: **Concluida**.

Foi criada uma cadeia local de distribuicao:

```text
manifesto versionado
  -> pacote bootstrap e licencas
  -> 5 arquivos de routes
  -> 39 entry shards e 90 index shards
```

Cada descritor registra caminho relativo seguro, tamanho exato e SHA-256. Os
routes guardam os hashes dos shards; o manifesto guarda os hashes do pacote,
licencas e routes. O manifesto nao calcula o proprio hash, evitando referencia
circular.

Artefatos:

- `Applications/japanese-study/data/dictionary/manifests/2026.07.13-2.json`;
- `Applications/japanese-study/data/dictionary/routes/2026.07.13-2/entries.json`;
- routes de `written`, `reading`, `romaji` e `pt` no mesmo diretorio;
- `scripts/dictionary/lib/distribution-manifest.mjs`;
- `scripts/dictionary/tests/distribution-manifest.test.mjs`.

Medicao:

| Item | Resultado |
| --- | ---: |
| Manifesto | 2.277 bytes |
| Routes | 25.195 bytes |
| Total de metadados | 27.472 bytes |
| Artefatos verificados pela cadeia | 136 |
| Entry shards roteados | 39 |
| Index shards roteados | 90 |

O manifesto usa `releaseStatus: staged`, `runtime.active: false` e
`activeSource: legacy-json`. Portanto, sua existencia nao ativa o novo
dicionario nem altera o fallback atual.

O validador independente rejeita:

- tamanho ou SHA-256 divergente;
- shard ausente, adulterado ou fora dos routes;
- route incompleto ou com cobertura incorreta;
- pacote, versao ou fontes divergentes;
- fonte sem atribuicao;
- caminho absoluto, vazio ou com travessia `..`;
- tentativa de marcar o runtime como ativo nesta subfase.

Comandos:

```text
npm.cmd run dictionary:generate-manifest -- <argumentos>
npm.cmd run dictionary:validate-manifest -- <argumentos>
```

Validacao acumulada apos a Fase 12.3:

- 35 testes do pipeline, incluindo adulteracao e path traversal;
- 58 testes do Japanese Study;
- 5 testes de equivalencia com o legado;
- 5 testes da busca do launcher;
- 136 artefatos reais relidos e validados;
- segunda geracao identica para os cinco routes e o manifesto.
- manifesto, route e shard acessiveis por HTTP local com status 200.

## Fase 12.4: Cache IndexedDB Versionado

Status: **Concluida**.

### Contrato implementado

- banco publico exclusivo `MathicxJapaneseDictionaryCache`;
- nenhum store ou nome de banco e compartilhado com `JapaneseStudyDB[_uid]`;
- stores reservados `dictionary_meta`, `dictionary_chunks`,
  `dictionary_entries`, `dictionary_packs` e `dictionary_failures`;
- artefatos brutos identificados por versao e caminho;
- verificacao de `byteLength` e SHA-256 via Web Crypto antes de cada gravacao;
- candidato permanece em estado `installing` ate todos os routes e shards
  estarem presentes e integros;
- promocao atomica apenas para candidatos em estado `ready`;
- versao ativa anterior preservada como rollback;
- rollback atomico sem excluir nenhuma das duas versoes;
- falhas de integridade e quota registradas sem trocar a versao ativa;
- versoes ativa e anterior nao podem ser sobrescritas durante uma instalacao;
- manifesto `staged` continua exigindo `legacy-json` como runtime ativo.

### Arquivos entregues

- `Applications/japanese-study/js/dictionary/dictionary-cache-repository.js`;
- `Applications/japanese-study/js/dictionary/dictionary-cache-installer.js`;
- `scripts/dictionary/tests/dictionary-cache.test.mjs`;
- dependencia de desenvolvimento `fake-indexeddb@6.2.5`.

### Validacao

- 6 testes especificos do cache cobrindo schema, instalacao, promocao,
  rollback, adulteracao, quota e versoes protegidas;
- distribuicao real `2026.07.13-2` instalada em IndexedDB de teste;
- 137 registros validados: 136 artefatos publicados mais o manifesto;
- 260.384 bytes armazenados no ensaio da distribuicao real;
- nenhuma alteracao no provider visivel ou no progresso pessoal.

Intervencao do proprietario: nenhuma nesta subfase.

## Fase 12.5: Lazy Loading, Cancelamento e Metricas

Status: **Concluida**.

### Contrato implementado

- `LazyDictionarySource` inicializa apenas o manifesto e cinco routes;
- consulta vazia carrega o pacote essencial `bootstrap-n5`;
- consultas digitadas classificam escrita, leitura, romaji ou portugues;
- somente buckets de indice compativeis com a consulta sao lidos;
- IDs encontrados sao agrupados pelo prefixo SHA-256 antes de buscar entradas;
- todo artefato de rede ou cache e validado por tamanho e SHA-256;
- cache valido e usado antes da rede e atualiza `lastAccessedAt`;
- cache adulterado e removido antes de nova tentativa pela rede;
- `AbortController` cancela buscas substituidas por uma consulta mais recente;
- resultado obsoleto nunca substitui o resultado da busca atual na interface;
- metricas tecnicas acumulam latencia, hits, misses, bytes, requisicoes,
  shards lidos, cancelamentos e falhas, sem registrar termos ou usuario;
- falha de rede ou cache cai no JSON legado para aquela consulta;
- `AbortError` permanece cancelamento e nao dispara fallback visual;
- IDs estaveis novos e aliases legados coexistem em favoritos e historico;
- banco de progresso pessoal continua fora do cache publico.

### Ativacao controlada

A flag global `dictionaryChunkLoadingEnabled` permanece `false`. O fluxo pode
ser testado sem alterar o padrao usando:

```text
http://127.0.0.1:4174/?dictionaryChunks=1
```

O parametro e lido tanto no Japanese Study direto quanto na janela pai do
Mathicx-File. Para rollback explicito, usar `?dictionaryChunks=0` ou
`?dictionaryProviderV2=0`.

### Arquivos entregues ou alterados

- `Applications/japanese-study/js/dictionary/lazy-dictionary-source.js`;
- `Applications/japanese-study/js/dictionary/dictionary-cache-repository.js`;
- `Applications/japanese-study/js/dictionary/dictionary-provider.js`;
- `Applications/japanese-study/js/dictionary/dictionary-runtime.js`;
- `Applications/japanese-study/js/app.js`;
- `Applications/japanese-study/tests/lazy-dictionary-source.test.mjs`;
- `Applications/japanese-study/tests/dictionary-provider.test.mjs`.

### Validacao

- 5 testes especificos da fonte lazy com os artefatos reais;
- 2 testes adicionais de runtime lazy, compatibilidade e fallback;
- 41 testes do pipeline;
- 65 testes do Japanese Study;
- 5 testes de equivalencia com o legado;
- 5 testes da busca do launcher;
- jornada no Chrome headless com `mizu`, resultado `水 / みず / mizu / agua`;
- IndexedDB publico e pessoal confirmados como bancos separados;
- resources do navegador confirmaram routes, indices `m` e apenas o shard `35`;
- repeticao da mesma busca atendida sem nova requisicao de shard.

Intervencao do proprietario: validar no desktop local com
`?dictionaryChunks=1` antes da decisao de ativacao global da Fase 12.6.

## Fase 12.6: Falhas, Cache e Desempenho

Status: **Concluida**.

### Entregas tecnicas

- limitador configuravel com teto de tres downloads simultaneos;
- consultas latinas de um caractere restritas ao pacote essencial;
- medicao de concorrencia ativa e maxima;
- relatorio de uso do cache por tipo de artefato;
- limpeza seletiva de shards opcionais;
- preservacao de manifesto, pack, licencas e routes;
- benchmark reproduzivel por arquivo local ou servidor HTTP;
- matriz ampliada de rede, 404, adulteracao, manifesto, quota e concorrencia.

### Resultado

- bootstrap HTTP local: 22,26 ms, meta abaixo de 100 ms;
- primeira busca `mizu`: 39,46 ms e 3.912 bytes;
- busca cacheada: media 1,75 ms, p95 3,80 ms e zero requests;
- concorrencia maxima: 3;
- pacote essencial preservado depois da limpeza;
- criterios tecnicos para ativacao global atendidos.

Evidencia: `DICTIONARY_PERFORMANCE_REPORT.md`.

### Decisao final

O proprietario aprovou busca vazia, `mizu`, `agua`, `水`, favoritos antigos e
uma nova favorita no desktop. `dictionaryChunkLoadingEnabled` foi alterada para
`true`; `?dictionaryChunks=0` e `?dictionaryProviderV2=0` permanecem como
rollback explicito.

Apos a ativacao, o Chrome foi validado sem parametros na URL: a busca `mizu`
retornou `水 / みず / mizu / agua`, criou o IndexedDB publico e carregou somente
manifesto, indices `romaji/m`, `pt/m` e entry shard `35`.

Intervencao do proprietario: validacao funcional concluida e ativacao global
aprovada.
