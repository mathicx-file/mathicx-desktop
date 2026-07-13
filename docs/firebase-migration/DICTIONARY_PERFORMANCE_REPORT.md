# Relatorio de Desempenho do Dicionario

> Medido em: 2026-07-13
>
> Versao do dicionario: `2026.07.13-2`
>
> Fase: 12.6

## Objetivo

Validar o provider lazy antes da decisao de ativar
`dictionaryChunkLoadingEnabled` globalmente. As metas herdadas do plano revisado
sao:

- busca no pacote essencial abaixo de 100 ms;
- busca em chunks cacheados abaixo de 150 ms;
- no maximo tres downloads simultaneos;
- zero requisicoes de rede ao repetir uma busca aquecida;
- limpeza opcional sem remover o pacote essencial.

## Ambiente

- Windows x64;
- Node.js `v25.6.1`;
- servidor local `http://127.0.0.1:4174`;
- 20 repeticoes para a busca aquecida;
- IndexedDB isolado por execucao usando `fake-indexeddb`;
- sem throttling artificial de CPU ou rede.

Os numeros abaixo representam uma linha de base local. Throttling e dispositivos
mais lentos continuam relevantes para validacao manual, mas nao alteram o
contrato de requests e bytes.

## Resultado HTTP Local

| Medicao | Resultado | Meta | Status |
| --- | ---: | ---: | --- |
| Inicializacao de manifesto e routes | 129,08 ms | informativa | OK |
| Busca no pacote essencial | 22,26 ms | < 100 ms | Aprovada |
| Primeira busca `mizu` | 39,46 ms | feedback imediato | Aprovada |
| Busca `mizu` em cache, media | 1,75 ms | < 150 ms | Aprovada |
| Busca `mizu` em cache, p95 | 3,80 ms | < 150 ms | Aprovada |
| Busca `mizu` em cache, maxima | 4,31 ms | < 150 ms | Aprovada |
| Concorrencia maxima | 3 requests | <= 3 | Aprovada |

## Rede e Cache

Inicializacao:

- 6 requests: manifesto e cinco routes;
- 27.472 bytes transferidos;
- nenhum pack, indice ou entry shard carregado.

Pacote essencial:

- 1 request;
- 106.673 bytes;
- carregado apenas para consulta vazia ou consulta latina de um caractere.

Primeira busca `mizu`:

- 3 requests;
- 3.912 bytes;
- indices `romaji/m` e `pt/m`;
- entry shard `35`.

Busca aquecida:

- 0 requests;
- 0 bytes;
- todos os artefatos atendidos pelo IndexedDB e revalidados por SHA-256.

## Limpeza Seletiva

Antes da limpeza:

- 9 artefatos;
- 135.780 bytes;
- pack, cinco routes, dois index shards e um entry shard.

Depois da limpeza:

- 6 artefatos;
- 131.868 bytes;
- pack essencial e cinco routes preservados;
- 3.912 bytes opcionais removidos;
- versao ativa e rollback nao alterados.

## Matriz de Falhas

Foram aprovados testes automatizados para:

- rede offline com busca aquecida;
- HTTP 404 em index shard;
- hash/tamanho invalido no cache com reparo pela rede;
- manifesto incompativel;
- `QuotaExceededError` durante gravacao;
- cancelamento de busca obsoleta;
- busca concorrente mais recente concluida;
- cache parcial nao promovido;
- limpeza sem remover pacote essencial;
- aliases legados em favoritos e historico;
- fallback por consulta para o JSON legado.

## Comando Reproduzivel

Arquivo local:

```text
npm.cmd run dictionary:measure-runtime
```

Servidor HTTP:

```text
npm.cmd run dictionary:measure-runtime -- --base-url http://127.0.0.1:4174/Applications/japanese-study/data/dictionary/
```

## Recomendacao

Os criterios tecnicos para ativar `dictionaryChunkLoadingEnabled` foram
atendidos. O proprietario concluiu a validacao funcional no desktop e aprovou
a ativacao global em 2026-07-13. `?dictionaryChunks=0` e
`?dictionaryProviderV2=0` permanecem como rollback explicito.
