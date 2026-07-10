# Fase 9: Revisao inicial do Finances

> Data: 2026-07-09
>
> Status: sync snapshot com isolamento e controle de conflito implementado
>
> Objetivo: revisar o app Finances como proximo candidato de integracao padronizada e garantir isolamento de dados por usuario do desktop.

## Resumo

O app `Applications/finances` ja esta integrado ao Mathicx-File via iframe, mas antes desta revisao usava uma chave fixa no `localStorage`:

```text
financas_pessoais_v1
```

Isso fazia com que todos os usuarios do desktop no mesmo navegador compartilhassem os mesmos dados financeiros locais.

## Decisao de Escopo

Nesta etapa foi implementado o primeiro sync Firestore do Finances em modo local-first.

O foco continua conservador: preservar o armazenamento local, manter backup/restore funcionando e enviar um snapshot remoto por usuario aprovado antes de dividir cada entidade em colecoes independentes.

## Isolamento Local Implementado

O wrapper do Finances agora passa o usuario atual do desktop para o iframe via:

```text
desktopUserScope
```

O Store do Finances passou a montar a chave local assim:

```text
financas_pessoais_v1:{desktopUserScope}
```

Exemplos:

```text
financas_pessoais_v1:abc123
financas_pessoais_v1:def456
financas_pessoais_v1:local
```

Com isso, dois usuarios Firebase aprovados no mesmo navegador deixam de compartilhar movimentacoes, perfis, cartoes, metas e configuracoes financeiras.

## Arquivos Alterados

- `src/apps/finances/view.js`
- `Applications/finances/js/storage.js`
- `Applications/finances/js/app.js`
- `Applications/finances/js/views/settings.js`
- `Applications/finances/js/firebase/sync-utils.js`
- `Applications/finances/js/firebase/finances-firestore-repository.js`
- `Applications/finances/js/firebase/finances-firebase-sync.js`
- `Applications/finances/js/firebase/package.json`
- `Applications/finances/package.json`
- `Applications/finances/test/firebase-sync-utils.test.mjs`
- `Applications/finances/css/styles.css`
- `src/firebase/feature-flags.js`
- `scripts/firebase/test-firestore-rules.mjs`

## Id do App

Para Firebase e documentacao tecnica, o id recomendado e:

```text
finances
```

Motivos:

- evita acento em caminhos Firestore;
- combina com a pasta `Applications/finances`;
- facilita URLs, regras e helpers;
- evita inconsistencias entre sistemas.

O manifesto do host agora usa `finances` como id canonico. O alias legado `finanças` continua aceito pelo registry, e preferencias antigas sao normalizadas durante a hidratacao do desktop.

## Desenho Firebase Futuro

Quando a sincronizacao remota for implementada, usar:

```text
users/{uid}/apps/finances/settings/main
users/{uid}/apps/finances/profile/snapshot
users/{uid}/apps/finances/transactions/{transactionId}
users/{uid}/apps/finances/installments/{installmentId}
users/{uid}/apps/finances/recurring/{recurringId}
users/{uid}/apps/finances/cards/{cardId}
users/{uid}/apps/finances/goals/{goalId}
users/{uid}/apps/finances/categories/{categoryId}
users/{uid}/apps/finances/budgets/{budgetId}
users/{uid}/apps/finances/transfers/{transferId}
```

Regra principal:

```text
request.auth.uid == uid
```

Nada financeiro pessoal deve ser salvo em colecao global.

## Paths Formalizados

Os helpers em `src/firebase/firestore-paths.js` agora incluem os caminhos do Finances:

```js
firestorePaths.financesSettings(uid)
firestorePaths.financesSnapshot(uid)
firestorePaths.financesTransaction(uid, transactionId)
firestorePaths.financesInstallment(uid, installmentId)
firestorePaths.financesRecurring(uid, recurringId)
firestorePaths.financesCard(uid, cardId)
firestorePaths.financesGoal(uid, goalId)
firestorePaths.financesCategory(uid, categoryId)
firestorePaths.financesBudget(uid, budgetId)
firestorePaths.financesTransfer(uid, transferId)
```

As regras Firestore continuam usando o match generico:

```text
users/{uid}/apps/{appId}/{document=**}
```

Com isso, o app `finances` herda a mesma regra de isolamento por usuario ja usada pelo Japanese Study.

## Sync Snapshot Implementado

O primeiro sync remoto do Finances usa o documento:

```text
users/{uid}/apps/finances/profile/snapshot
```

Formato base:

```text
{
  appId: "finances",
  format: "finances-backup",
  schemaVersion: 1,
  revision: 1,
  sourceSchemaVersion: 1,
  source: "initial|manual|local-change",
  state: { ...estado completo do Store },
  counts: { settings, profiles, categories, transactions, installments, recurring, cards, goals, budgets, transfers },
  updatedAt
}
```

Motivos para comecar por snapshot:

- reduz risco em dados financeiros pessoais;
- preserva o backup/restore atual;
- permite validar sync por usuario antes de granularizar colecoes;
- estabelece controle de revisao antes de granularizar as colecoes.

O app continua local-first. Se o Firebase nao estiver disponivel, o Finances segue funcionando pelo `localStorage` escopado por usuario.

## Controle de Conflito

Cada snapshot remoto agora possui uma revisao numerica:

```text
revision: 1, 2, 3...
```

As gravacoes usam transacao no Firestore. O dispositivo somente salva quando a revisao remota continua igual a revisao que ele carregou. Se outro dispositivo tiver salvo antes, o app interrompe o envio e apresenta duas opcoes:

- `Usar versao do Firebase`: substitui o estado local pela versao remota mais recente;
- `Manter versao deste dispositivo`: tenta gravar o estado local sobre a revisao remota identificada.

Enquanto nenhuma opcao for escolhida, os dados locais permanecem intactos. Uma nova mudanca remota durante a resolucao gera outro conflito, evitando sobrescrita silenciosa.

Ao iniciar com um snapshot remoto existente, a versao do Firebase passa a ser a referencia do dispositivo. Isso tambem preserva exclusoes: um snapshot remoto vazio e tratado como estado valido e nao e preenchido novamente por dados locais antigos.

### Alteracoes Locais Pendentes Entre Sessoes

O navegador mantem metadados de sync separados por usuario:

```text
finances_firebase_sync_v1:{uid}
```

Esses metadados registram a ultima `revision` conhecida e o indicador `dirty` de alteracoes locais ainda nao confirmadas no Firebase.

Na reabertura do app:

- local limpo e remoto mais recente: carrega o snapshot do Firebase;
- local pendente e mesma revisao remota: retoma o envio local;
- local pendente e remoto alterado por outro dispositivo: apresenta o conflito;
- escolha pela versao remota: limpa o estado pendente somente depois da importacao;
- escolha pela versao local: limpa o estado pendente somente depois da gravacao confirmada.

O Store tambem salva imediatamente no evento `pagehide`, preservando alteracoes feitas pouco antes de fechar a aplicacao.

## Flags

Foram adicionadas flags independentes:

```js
firestoreFinancesReadEnabled: true
firestoreFinancesWriteEnabled: true
```

Assim e possivel desligar somente o sync do Finances sem afetar Japanese Study ou preferencias do desktop.

## UI de Sync

A tela `Configuracoes` do Finances agora possui:

- status da sincronizacao Firebase;
- detalhes da ultima sync;
- botao `Sincronizar agora`.

Quando um conflito e identificado, o app tambem abre um modal de primeiro plano. O aviso nao pode ser dispensado sem escolher entre a versao do Firebase e a versao deste dispositivo. O painel de Configuracoes permanece disponivel como referencia secundaria.

Estados previstos:

```text
checking, disabled, pending, hydrating, syncing, synced, conflict, error
```

## Observacoes Tecnicas

- O app continua funcionando standalone com escopo `local`.
- O host envia o escopo via query string e tambem via `postMessage`.
- O Store aceita troca de escopo em runtime com `Store.setUserScope(scope)`.
- O wrapper do Finances passou a usar `mountIframeApp`, criado na Fase 9.

## Validacao

- Import ESM do wrapper do Finances: OK.
- `npm.cmd test` em `Applications/finances`: smoke OK, functional OK, 37 asserts passando.
- `node --test test/firebase-sync-utils.test.mjs`: 5 testes passando.
- Teste isolado de escopo por usuario: OK.
- Teste manual em servidor local com dois usuarios, incluindo sincronizacao e isolamento: OK em 2026-07-10.
- Reabertura com alteracao local pendente: implementada apos validacao manual identificar sobrescrita pelo snapshot remoto.
- Modal de conflito em primeiro plano: validado manualmente em 2026-07-10.
- `npm.cmd run test:app-ids`: id canonico, alias legado, favoritos e fixados validados.
- Pasta do wrapper normalizada para `src/apps/finances`.
- Helpers `firestorePaths.finances*`: OK.
- Imports ESM dos wrappers integrados (`japanese-study`, `finances`) e do helper `mountIframeApp`: OK.
- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- Testes Firestore incluem acesso permitido a `users/{uid}/apps/finances/...` para usuario aprovado.
- Testes Firestore incluem negacao para usuario pendente e para outro usuario tentando acessar dados do Finances.
- Testes Firestore incluem o snapshot realista em `users/{uid}/apps/finances/profile/snapshot`.

## Proximos Passos Recomendados

1. Validar que favoritos, fixados e atalhos antigos com `finanças` continuam abrindo o app.
2. Consolidar este recorte da Fase 9 em commit.
3. Manter o snapshot como estrategia principal enquanto o volume de dados continuar pequeno.
4. Reavaliar colecoes granulares somente quando houver necessidade de consultas parciais, colaboracao ou volume relevante.
