# Relatorio dos Pacotes do Dicionario

> Fase: 15.1
>
> Medicao: 2026-07-13
>
> Candidato local: `2026.07.13-3` (nao publicado)

## 1. Fontes Fixadas

| Fonte | Snapshot | SHA-256 | Compactado |
| --- | --- | --- | ---: |
| JMdict | `JMdict_e.gz` de 2026-07-13 | `5a6356a36532d30613a3469af7098224d010c7d039d0d00e3b063632a2912c31` | 10.497.151 bytes |
| KANJIDIC2 | `kanjidic2.xml.gz` de 2026-07-13 | `b08df64dd6828463ea31529d9ea93db32a527d87fa25a1606b2e5775d3967bf3` | 1.488.562 bytes |

Os snapshots e produtos volumosos ficam em `tmp/dictionary-sources/2026-07-13`,
que e ignorado pelo Git. O repositorio guarda somente codigo, configuracoes e
este relatorio reproduzivel.

## 2. Composicao Aprovada

| Camada | Regra | Verbetes | Kanji | Instalacao |
| --- | --- | ---: | ---: | --- |
| `essential` | baseline N5 revisada | 44 | conjunto atual | padrao |
| `core` | JMdict com prioridade; KANJIDIC2 graus 1-6 e 8 | 30.142 | 2.136 | opcional |
| `full` | snapshots JMdict e KANJIDIC2 completos | 217.856 | 13.108 | opcional |

O pacote `core` usa os marcadores de prioridade do JMdict em vez de uma lista
JLPT nao oficial. O grau `8` inclui kanji Jinmeiyo registrados pelo KANJIDIC2.

## 3. Tamanho e Geracao

| Camada | JSON | Gzip de referencia | Tempo observado |
| --- | ---: | ---: | ---: |
| `core` | 36.354.953 bytes | 2.335.853 bytes | 8,90 s |
| `full` | 208.682.984 bytes | 13.852.878 bytes | 45,69 s |

Os tempos representam apenas a montagem e compressao do pacote nesta maquina;
download das fontes, importacao XML e geracao dos indices sao etapas separadas.
O tamanho JSON evidencia que a instalacao offline deve usar artefatos
fragmentados e controle de quota, nao carregar o pacote monolitico no runtime.

## 4. Fragmentacao Validada

| Camada | Fragmentos de verbetes | Total comprimido | Maior fragmento |
| --- | ---: | ---: | ---: |
| `core` | 16 | 2.433.779 bytes | 160.885 bytes |
| `full` | 256 | 16.046.548 bytes | 68.482 bytes |

| Camada | Fragmentos de indice | Total comprimido | Maior fragmento |
| --- | ---: | ---: | ---: |
| `core` | 190 | 749.629 bytes | 34.054 bytes |
| `full` | 411 | 5.873.935 bytes | 225.377 bytes |

Todos os fragmentos ficaram abaixo do limite tecnico de 256.000 bytes usado
pelos indices. Para o pacote `full`, romaji e portugues usam roteamento pelos
dois primeiros caracteres latinos; o runtime aceita tanto esse contrato quanto
o formato anterior de um caractere.

## 5. Idiomas e Publicacao

Os catalogos ampliados preservam os significados em ingles das fontes. O indice
pt-BR permanece restrito a traducoes revisadas pela camada editorial do projeto;
por isso ele nao ganha termos artificiais nos pacotes ampliados. Busca por
japones, leitura e romaji cobre todo o catalogo selecionado.

O candidato nao deve ser publicado antes da `15.6`. A `15.2` implementara a
instalacao e remocao explicita de pacotes, e a `15.3` tratara estimativa de
espaco, persistencia e falhas de quota.

## 6. Candidata de Publicacao da Fase 15.6

Em 2026-07-13, os shards foram empacotados individualmente em gzip para evitar
versionar os aproximadamente 240 MB de JSON bruto.

| Camada | Artefatos | Tamanho publicado |
| --- | ---: | ---: |
| `core` | 212 | 3.248.999 bytes |
| `full` | 673 | 22.121.202 bytes |

Duas geracoes independentes produziram 885 arquivos sem diferencas de hash. A
instalacao, busca offline, remocao isolada, SHA-256 e mojibake foram validados.
A candidata permanece fora da arvore publica ate aprovacao do proprietario.
