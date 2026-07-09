# Fase 9: Revisao inicial do Finances

> Data: 2026-07-09
>
> Status: primeiro recorte implementado
>
> Objetivo: revisar o app Finances como proximo candidato de integracao padronizada e garantir isolamento de dados por usuario do desktop.

## Resumo

O app `Applications/finances` ja esta integrado ao Mathicx-File via iframe, mas antes desta revisao usava uma chave fixa no `localStorage`:

```text
financas_pessoais_v1
```

Isso fazia com que todos os usuarios do desktop no mesmo navegador compartilhassem os mesmos dados financeiros locais.

## Decisao de Escopo

Nesta etapa ainda nao foi implementada sincronizacao Firestore do Finances.

O foco foi corrigir o isolamento local por usuario e preparar o desenho para Firebase.

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

- `src/apps/finanças/view.js`
- `Applications/finances/js/storage.js`
- `Applications/finances/js/app.js`

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

Observacao: o manifesto do host ainda usa `finanças` como app id legado do desktop. A troca desse id deve ser planejada separadamente para nao quebrar atalhos/favoritos existentes.

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

## Observacoes Tecnicas

- O app continua funcionando standalone com escopo `local`.
- O host envia o escopo via query string e tambem via `postMessage`.
- O Store aceita troca de escopo em runtime com `Store.setUserScope(scope)`.
- O wrapper do Finances passou a usar `mountIframeApp`, criado na Fase 9.

## Validacao

- Import ESM do wrapper do Finances: OK.
- `node test/smoke.js` e `node test/functional.js` falham diretamente porque os testes usam CommonJS em um repositorio com `"type": "module"`.
- Os mesmos testes rodaram com copias temporarias `.cjs`: smoke OK, functional OK, 37 asserts passando.
- Teste isolado de escopo por usuario: OK.
- Helpers `firestorePaths.finances*`: OK.
- Imports ESM dos wrappers integrados (`japanese-study`, `finanças`) e do helper `mountIframeApp`: OK.
- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- Testes Firestore incluem acesso permitido a `users/{uid}/apps/finances/...` para usuario aprovado.
- Testes Firestore incluem negacao para usuario pendente e para outro usuario tentando acessar dados do Finances.

## Proximos Passos Recomendados

1. Decidir se o app id do desktop sera migrado de `finanças` para `finances`.
2. Corrigir ou adaptar os testes do Finances para rodarem nativamente no repositorio ESM.
3. Mapear o schema remoto de cada entidade financeira.
4. Criar regras Firestore para `users/{uid}/apps/finances/...`.
5. Implementar sync remoto em modo controlado, com backup/export antes da primeira migracao.
