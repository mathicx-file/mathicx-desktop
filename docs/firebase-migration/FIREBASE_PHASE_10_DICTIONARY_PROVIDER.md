# Fase 10: Abstracao do Dicionario

> Data: 2026-07-10
>
> Status: concluida
>
> Recorte concluido: Fases 10.1 a 10.5

## Objetivo

Desacoplar a UI e as buscas da fonte atual do dicionario, preservando o JSON local, o runtime zero-build e o comportamento existente.

## Fase 10.1: Contrato e Schema

Implementado:

- `DictionaryProvider` com API assincrona;
- schema normalizado versao 1;
- normalizacao de entradas legadas;
- conversao temporaria para o formato atual da UI;
- busca centralizada por escrita, leitura, romaji, significado e tags;
- filtros por script e categoria/tag;
- metadados da fonte e contagem de entradas.

Contrato inicial:

```js
provider.init()
provider.search(query, options)
provider.getById(id)
provider.getMany(ids)
provider.getMetadata()
```

## Fase 10.2: Fonte Legada

Implementado:

- `LegacyDictionarySource` sobre `data/dictionary.json`;
- `fetch` injetavel para testes;
- validacao do payload;
- metadados de origem e formato;
- manutencao das 42 entradas como baseline.

## Decisoes

- API assincrona desde o inicio para preparar shards e IndexedDB.
- Modulos ESM dentro do Japanese Study para preservar o modo standalone.
- Nenhuma mudanca visual neste recorte.
- A feature flag `dictionaryProviderV2Enabled` permaneceu desligada durante as Fases 10.1 a 10.4 e foi ativada somente na Fase 10.5.
- JMdict, KANJIDIC2, traducoes e licencas continuam reservados para a Fase 11.

## Proximos Subtopicos

Fase 10 concluida. O proximo marco oficial e a Fase 11.

## Fase 10.3: Integracao Controlada com a UI

Implementado:

- `DictionaryRuntime` seleciona provider ou legado;
- UI usa o runtime para busca, favoritos e historico;
- resultados normalizados sao convertidos para o formato visual atual;
- falha ao inicializar o provider retorna automaticamente ao JSON legado;
- query string `dictionaryProviderV2=1|0` permite validacao local controlada;
- flag central continua sendo a configuracao padrao do desktop integrado.

O runtime legado continua recebendo os dados mesmo no modo provider. Isso preserva compatibilidade temporaria com componentes ainda nao migrados e permite rollback sem recarregar outra estrutura.

## Fase 10.4: Busca Compartilhada no Launcher

Implementado:

- launcher usa o mesmo `DictionaryProvider` quando a flag V2 esta ativa;
- limite de seis resultados foi preservado;
- resultados continuam usando o formato e payload atuais;
- `resolveAction` consulta o cache do adaptador pelo ID estavel;
- pontuacao lexical duplicada foi removida do caminho provider;
- algoritmo antigo permanece encapsulado somente como fallback temporario;
- falha do provider ativa o caminho legado sem remover resultados anteriores.
- teste integrado confirma `globalSearch()` e `resolveAction()` no modo provider.

## Fase 10.5: Equivalencia, Rollback e Ativacao

Implementado:

- comparacao automatizada entre provider e legado;
- consultas de referencia por escrita, romaji, significado e categoria;
- comparacao dos filtros hiragana, katakana e kanji;
- validacao da ordem de favoritos e historico por ID;
- comparacao do primeiro resultado no launcher;
- rollback explicito com `dictionaryProviderV2=0`;
- fallback automatico mantido para falhas de inicializacao;
- `dictionaryProviderV2Enabled` ativado como caminho padrao.

O JSON atual continua sendo a fonte de dados. A ativacao troca apenas a camada de acesso e busca, sem iniciar shards, manifesto remoto ou Firebase para conteudo publico.

## Criterios Deste Recorte

- provider carrega as 42 entradas atuais;
- schema rejeita IDs ausentes ou duplicados;
- busca cobre os campos atuais;
- fonte e provider podem ser testados sem DOM ou Firebase;
- app continua usando o caminho legado ate a Fase 10.3.

## Validacao

- `npm.cmd test`: 58 testes passando;
- 9 testes especificos do provider, schema, runtime e fonte legada;
- baseline confirmada com 42 entradas;
- `npm.cmd run check:mojibake`: OK;
- verificacao de sintaxe dos quatro modulos ESM: OK;
- feature flag confirmada como ativada ao concluir a Fase 10.5;
- modo provider validado no navegador com 42 entradas, `mizu` e filtro Katakana;
- modo legado validado no navegador com as mesmas 42 entradas;
- nenhum erro ou aviso no console durante a comparacao.
- `npm.cmd run test:launcher-dictionary`: 5 testes passando;
- integracao real de `globalSearch()` e `resolveAction()` validada com provider ativo;
- `npm.cmd run test:dictionary-equivalence`: 5 testes passando;
- ativacao padrao validada no navegador em `mode=provider` com 42 entradas;
- rollback `dictionaryProviderV2=0` validado em `mode=legacy` com 42 entradas.
