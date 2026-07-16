# Fase 18.5.1: Gate de Infraestrutura do Dicionario

> Avaliada em: 2026-07-16
>
> Status: concluida e aprovada em 2026-07-16

## 1. Objetivo

Decidir com medidas reproduziveis se os pacotes do dicionario devem continuar
no GitHub Pages ou migrar para Cloud Storage, Firestore editorial ou um motor de
busca externo. Nenhum recurso pago e criado nesta subfase.

## 2. Estado Medido

Comando:

```text
npm run dictionary:assess-infrastructure
```

Resultado de 2026-07-16:

| Medida | Resultado |
| --- | ---: |
| Dicionario | 34.037.191 bytes |
| Arquivos do dicionario | 1.413 |
| Artefato Pages completo | 35.570.829 bytes |
| Arquivos Pages | 1.588 |
| Maior shard | 225.377 bytes |
| Entradas `core` | 30.142 |
| Entradas `full` | 217.856 |
| Decisao automatica | `keep-static` |

O Pages ocupa aproximadamente 3,3% do limite publicado de 1 GB. Os pacotes ja
possuem shards, indices por leitura/escrita, hashes, manifests, instalacao
seletiva, cache local e funcionamento offline.

## 3. Gate Repetivel

O script `scripts/dictionary/assess-infrastructure.mjs` reabre a analise quando:

- o artefato Pages atingir 512 MiB;
- um artefato individual atingir 50 MiB;
- houver evidencia externa de banda mensal relevante;
- a latencia p95 da busca deixar de ser adequada;
- a frequencia editorial ou o numero de editores exigir workflow compartilhado.

Os limites de capacidade sao alertas conservadores, nao limites tecnicos finais.

## 4. Alternativas

### A. Manter o Pipeline Estatico

Recomendacao: **aprovar agora**.

- nenhum custo ou recurso externo novo;
- preserva Pages, PWA, instalacao offline e hashes atuais;
- mantem releases reproduziveis no repositorio;
- gate pode ser executado novamente a cada release ampla.

### B. Distribuicao Hibrida com Cloud Storage

Mover somente `core/full` e manter shell, catalogo e pacote essencial no Pages.
Exigiria plano Blaze, conta de faturamento, budget alerts, regras, CORS, App
Check e suporte a duas origens de download. Desde 2026, Cloud Storage for
Firebase exige o plano Blaze mesmo quando o consumo fica na franquia gratuita.

Intervencao do proprietario: vincular faturamento e escolher regiao do bucket.

### C. Backend Editorial e Busca Gerenciada

Adicionar painel editorial, Firestore administrativo e exportacao de bundles;
Algolia ou Meilisearch entrariam somente se a busca local medida se tornar
insuficiente. Este caminho cria operacao, permissoes, custos e novos backups.

Intervencao do proprietario: definir editores, frequencia de publicacao,
orcamento e provedor de busca.

## 5. Recomendacao

Manter a alternativa A e considerar a 18.5 avaliada e adiada. O volume atual
nao compensa Blaze, regras de Storage, CORS ou um servico de busca. A alternativa
B passa a ser a primeira opcao quando um gatilho quantitativo for atingido; a C
depende de demanda editorial real.

A alternativa A foi aprovada pelo proprietario em 2026-07-16. O pipeline
estatico permanece como arquitetura oficial e o gate sera reexecutado quando
um dos gatilhos da secao 3 for atingido.

## 6. Fontes Oficiais

- [Limites do GitHub Pages](https://docs.github.com/pt/pages/getting-started-with-github-pages/github-pages-limits)
- [Requisitos atuais do Cloud Storage for Firebase](https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024?hl=pt-br)
- [Planos e faturamento Firebase](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
