# Relatorio do Bootstrap N5

> Pacote: `bootstrap-n5`
>
> Versao: `2026.07.13-2`
>
> Status editorial: revisado
>
> Publicacao: pronta

## Resultado

| Item | Quantidade |
| --- | ---: |
| Palavras do baseline | 42 |
| Palavras encontradas | 42 |
| Correspondencias unicas | 26 |
| Correspondencias ambiguas revisadas | 16 |
| Entradas JMdict aprovadas | 44 |
| Kanji encontrados | 10 de 10 |
| SVGs KanjiVG locais | 10 |
| Traducoes lexicais revisadas | 44 |
| Traducoes de kanji revisadas | 10 |
| Traducoes em rascunho | 0 |
| Total de traducoes revisadas | 54 |
| Tamanho do pacote | 106.673 bytes |
| Orcamento maximo | 256.000 bytes |

O numero de entradas JMdict e maior que o baseline porque formas curtas e
homonimas podem apontar para varias entradas oficiais. As 16 ambiguidades foram
decididas pelo proprietario em quatro blocos, com prioridade para o significado
atual e o uso cotidiano. As escolhas estao registradas em
`scripts/dictionary/editorial/bootstrap-n5.review.json`.

## Politica Editorial

- modelo hibrido com pt-BR opcional;
- ingles como fallback para futuras entradas sem traducao;
- 26 correspondencias unicas e 10 significados de kanji aceitos do baseline;
- 16 ambiguidades revisadas individualmente;
- nenhuma traducao automatica irrestrita;
- pacote promovido somente quando toda a revisao ficou completa.

## Fontes Fixadas

| Fonte | Versao | SHA-256 |
| --- | --- | --- |
| JMdict_e | 2026-07-13 | `5a6356a36532d30613a3469af7098224d010c7d039d0d00e3b063632a2912c31` |
| KANJIDIC2 | 2026-07-13 | `b08df64dd6828463ea31529d9ea93db32a527d87fa25a1606b2e5775d3967bf3` |
| KanjiVG | r20250816 | `69a2944ec1183086fdee5ba9c1f48bc306b867480a95b2f337f3203bf50689a3` |
| Mathicx pt-BR | ea879a4 | `445ea3c5206fe9b7a48272591ce6b713ad3a10bbee43c8e030d06c6607149a7e` |

Os snapshots brutos permanecem somente em `tmp/dictionary-sources/` e nao sao
versionados. O pacote contem apenas o recorte selecionado e os metadados de
origem.

## Validacao Final

- `publication.ready: true` e lista de bloqueios vazia;
- 25 testes do pipeline aprovados;
- 58 testes do Japanese Study aprovados;
- 5 testes de equivalencia com o legado aprovados;
- 5 testes da busca do launcher aprovados;
- hashes dos 10 SVGs recalculados e aprovados;
- painel de atribuicoes validado em desktop e mobile, sem overflow ou erros;
- JSON legado permanece como fonte ativa e caminho de rollback.

Artefatos finais:

- `Applications/japanese-study/data/dictionary/packs/bootstrap-n5.json`;
- `Applications/japanese-study/data/dictionary/reports/bootstrap-n5.report.json`;
- `scripts/dictionary/editorial/bootstrap-n5.review.json`.
