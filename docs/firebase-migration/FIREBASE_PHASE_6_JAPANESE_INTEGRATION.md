# Fase 6: Integracao inicial do Japanese Study

> Data: 2026-07-08
>
> Escopo: integrar `Applications/japanese-study` ao desktop como app externo e preparar o namespace Firestore sem ativar sincronizacao remota.

## Decisao

O Japanese Study entra inicialmente como app externo em iframe.

Motivos:

- preserva o modo standalone do projeto;
- reduz o risco da primeira integracao;
- mantem LocalStorage e IndexedDB funcionando como fonte local;
- permite adicionar Firebase por feature flag em uma fase seguinte.

## Namespace Firestore aprovado

O caminho canonico para dados pessoais do app sera:

```text
users/{uid}/apps/japanese-study/...
```

Esse padrao foi escolhido para organizar futuros apps no mesmo modelo, como `finances`.

Paths preparados:

```text
users/{uid}/apps/japanese-study/settings/main
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/japanese-study/stats/summary
users/{uid}/apps/japanese-study/events/{eventId}
users/{uid}/apps/japanese-study/achievements/{achievementId}
users/{uid}/apps/japanese-study/srs/{itemId}
users/{uid}/apps/japanese-study/favorites/{entryId}
users/{uid}/apps/japanese-study/dictionaryFavorites/{entryId}
```

## Implementado nesta fase

- Criado wrapper do host em `src/apps/japanese-study`.
- Registrado `japanese-study` no catalogo de apps do desktop.
- Mantido o app real em `Applications/japanese-study`.
- Criada sincronizacao Firebase local-first dentro do Japanese Study.
- Atualizados helpers de path em `src/firebase/firestore-paths.js`.
- Regras Firestore continuam usando o wildcard seguro `users/{uid}/apps/{appId}/...`.
- Ativadas as flags `firestoreJapaneseReadEnabled` e `firestoreJapaneseWriteEnabled`.
- Corrigido repasse de tema do host para o iframe usando o tema resolvido `dark`/`light`.

## Fora do escopo desta fase

- migrar dados locais;
- mover dicionario ou assets estaticos para Firebase;
- criar widgets, deep links ou busca global.

## Proxima fase recomendada

Evoluir a camada de sync local-first do Japanese Study:

1. adicionar uma UI de status da sincronizacao;
2. registrar marcador de migracao em `users/{uid}/migrations`;
3. melhorar reconciliacao de conflitos entre dispositivos;
4. adicionar testes de contrato com emulador para os paths especificos do Japanese Study;
5. avaliar widgets, deep links e busca global.

## Validacao

- `npm.cmd test` em `Applications/japanese-study`: 48 testes passando.
- `npm run test:firestore-rules`: 10 testes passando.
- imports de `registry`, manifest e wrapper do app validados por Node.
