# Fase 18.6.1: Gate de Sync Seletivo e Granularizacao

> Avaliada em: 2026-07-16
>
> Status: concluida e aprovada em 2026-07-16

## 1. Objetivo

Verificar se sincronizacao em tempo real, colaboracao ou granularizacao do
Finances ja possuem evidencia suficiente para justificar mais complexidade.
Esta subfase nao altera dados, rules nem o comportamento atual dos aplicativos.

## 2. Arquitetura Encontrada

| Modulo | Modelo atual | Protecao principal | Resultado |
| --- | --- | --- | --- |
| Desktop | documento unico de preferencias | debounce de 600 ms | manter |
| Japanese Study | documentos por dominio | batches de ate 450 operacoes | manter |
| Finances | snapshot unico | transacao, revisao e conflito explicito | manter e medir |

O Japanese Study ja esta granularizado em configuracoes, progressao, SRS,
eventos e conquistas. O snapshot do Finances preserva consistencia entre
lancamentos, parcelas, cartoes, metas e demais entidades durante uma revisao.

## 3. Gate Repetivel

Comando sem dados pessoais:

```text
npm run firebase:assess-sync
```

Opcionalmente, um JSON local de metricas pode ser informado:

```text
npm run firebase:assess-sync -- --metrics caminho/metricas.json
```

Formato por aplicativo:

```json
{
  "finances": {
    "payloadBytes": 120000,
    "recordCount": 800,
    "conflicts30d": 0,
    "syncP95Ms": 400,
    "collaborators": 1
  }
}
```

O gate reabre a arquitetura quando ocorrer ao menos um destes eventos:

- snapshot do Finances atingir 524.288 bytes;
- Finances atingir 5.000 registros;
- ocorrerem 3 conflitos em 30 dias;
- latencia p95 de sync atingir 1.500 ms;
- qualquer modulo exigir dois ou mais colaboradores.

O alerta de tamanho ocorre em 50% do limite oficial de 1 MiB por documento do
Firestore, deixando margem para metadados e crescimento durante a migracao.

## 4. Decisao Recomendada

Manter os tres modelos atuais e coletar metricas somente quando houver problema
observavel. Nao adicionar listeners em tempo real nem dividir o snapshot do
Finances nesta fase. Ao atingir um gatilho, a proxima subfase deve primeiro
projetar migracao reversivel e politicas de conflito por entidade.

A recomendacao foi aprovada pelo proprietario em 2026-07-16. A arquitetura
atual permanece oficial e a 18.6 somente sera reaberta quando o gate retornar
`review-triggered` ou surgir demanda explicita de colaboracao.

## 5. Fonte Oficial

- [Limites do Cloud Firestore](https://firebase.google.com/docs/firestore/quotas)
- [Transacoes e escritas em lote](https://firebase.google.com/docs/firestore/manage-data/transactions)
