# Reestrutura de Gamificacao e Preparacao para Firebase

> Data: 2026-07-08
>
> Escopo: sistema local-first de XP, niveis, missoes e conquistas, preparado e integrado a sincronizacao por usuario no Mathicx-File.

## Objetivo

O sistema antigo calculava nivel a partir de metricas agregadas, como caracteres estudados, streak, SRS dominado e respostas no quiz. Isso era simples, mas pouco auditavel e facil de distorcer: muitas respostas no quiz podiam aumentar XP mesmo sem dominio real.

A nova estrutura separa tres dimensoes:

- **Habito**: ritmo, streak, dias ativos e tempo de estudo.
- **Dominio**: conclusao por escrita, itens dominados no SRS, precisao no quiz e precisao de digitacao.
- **Pratica**: eventos reais de estudo, como acertos no quiz, revisoes SRS e sessoes de digitacao.

O nivel final combina as tres dimensoes. A intencao e equilibrar consistencia com aprendizado real.

## Decisao Arquitetural

Foi criado um ledger local de eventos de gamificacao usando o IndexedDB existente:

```text
JapaneseStudyDB/japanese_progress
```

Eventos novos usam:

```json
{
  "type": "gamification_event",
  "entityType": "gamification-event",
  "eventType": "quiz.correct",
  "source": "quiz",
  "action": "correct-answer",
  "xp": 9,
  "skill": "recognition",
  "itemId": "a_あ",
  "syncStatus": "local",
  "schemaVersion": 1
}
```

Essa escolha evita uma migracao IndexedDB nova agora, preserva backup/importacao e prepara o caminho para Firestore append-only.

## Arquivos Principais

- `js/gamification-engine.js`: regras puras de XP, niveis, conquistas e missoes.
- `js/learning-levels.js`: ponte publica para o novo motor.
- `js/storage.js`: grava eventos de gamificacao junto com quiz, SRS e digitacao.
- `js/app.js`: inclui `gamificationStats` no contexto do Dashboard.
- `js/ui.js`: exibe XP total, dimensoes, missoes e conquistas.
- `tests/gamification-engine.test.mjs`: cobre eventos e resumo de progressao.

## Regras de XP

Eventos de pratica:

- `quiz.correct`: XP base por acerto.
- `quiz.incorrect`: XP pequeno por tentativa.
- `quiz.review-correct`: XP maior por corrigir erro reapresentado.
- `quiz.review-incorrect`: XP pequeno por tentativa em revisao.
- `srs.difficult`, `srs.good`, `srs.easy`: XP por revisao de memoria.
- `typing.session`: XP por sessao concluida, com bonus por volume e precisao.

Dimensoes calculadas:

- `dimensions.habit`
- `dimensions.mastery`
- `dimensions.practice`

O `xp` total soma essas dimensoes e usa uma tabela de 10 niveis.

## Comportamento Local-First

O app continua independente quando aberto em modo standalone:

- sem dependencia de Firebase;
- sem usuario remoto;
- backup JSON continua incluindo os eventos;
- importacao por mescla preserva eventos;
- o Dashboard recalcula o nivel a partir dos dados locais.

Quando roda dentro do Mathicx-File com Firebase ativo, o mesmo armazenamento local passa a usar escopo por UID e e sincronizado com Firestore.

## Preparacao para Firebase

Quando o Japanese Study roda dentro do Mathicx-File, a estrutura canonica e:

```text
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/japanese-study/events/{eventId}
users/{uid}/apps/japanese-study/achievements/{achievementId}
users/{uid}/apps/japanese-study/stats/summary
users/{uid}/apps/japanese-study/srs/{itemId}
users/{uid}/apps/japanese-study/settings/main
```

### Eventos

`events/{eventId}` deve receber os registros `gamification_event`.

Recomendacao:

- tratar eventos como append-only;
- usar o `id` local como `eventId`;
- manter `createdAt`, `timestamp`, `source`, `eventType`, `xp`, `skill`, `itemId` e `schemaVersion`;
- atualizar `syncStatus` local para `synced` depois do envio.

### Perfil de Progressao

`profile/progression` deve guardar um resumo cacheado:

```json
{
  "schemaVersion": 1,
  "level": 4,
  "title": "Praticante Constante",
  "xp": 620,
  "progress": 30,
  "dimensions": {
    "habit": 120,
    "mastery": 350,
    "practice": 150
  },
  "updatedAt": "serverTimestamp"
}
```

Esse resumo e cache. A fonte auditavel continua sendo `events`.

### Conflitos

Regra sugerida:

- Eventos: mesclar por `eventId`; nunca sobrescrever evento existente.
- Perfil/resumo: recalcular depois da sincronizacao.
- SRS: usar `updatedAt` mais recente por item.
- Settings: ultimo update vence, enquanto nao houver colaboracao multi-dispositivo simultanea.

## Integracao com Mathicx-File

Quando roda como iframe:

1. O Japanese Study usa a camada Firebase carregada pelo Mathicx-File.
2. O app valida o usuario aprovado via Firebase Auth/Firestore.
3. O path base vem do usuario autenticado:

```text
users/{uid}/apps/japanese-study
```

4. Nao enviar token por `postMessage`.
5. Dicionario e dados estaticos continuam locais.
6. Firestore sincroniza apenas dados pessoais de estudo.
7. LocalStorage e IndexedDB usam escopo por UID para evitar mistura entre contas no mesmo navegador.

## Rules Futuras

Exemplo conceitual:

```text
match /users/{uid}/apps/japanese-study/{document=**} {
  allow read, write: if request.auth != null
    && request.auth.uid == uid
    && get(/databases/$(database)/documents/users/$(uid)).data.accessStatus == "approved";
}
```

As rules reais no Mathicx-File usam wildcard seguro para `users/{uid}/apps/{appId}/...` e exigem usuario aprovado.

## Trade-offs

Alternativa considerada: salvar apenas `xpTotal` no perfil local.

Motivo para nao escolher:

- dificil auditar;
- dificil sincronizar sem conflito;
- dificil explicar por que o usuario subiu de nivel;
- ruim para recalcular regras de XP no futuro.

Escolha atual: ledger de eventos + resumo calculado.

Beneficios:

- local-first;
- pronto para Firestore;
- facil de testar;
- permite recalcular niveis;
- preserva historico de aprendizado.

Custo:

- mais registros no IndexedDB;
- precisa de compactacao/resumo se o uso crescer muito.

## Proximos Passos

Status em 2026-07-08:

1. Caderno visual de erros implementado no Dashboard a partir de `difficultyMap`, `recentErrors` e resumo de gamificacao.
2. Metas configuraveis implementadas localmente em `settings.gamificationGoals`.
3. Conquistas desbloqueadas persistidas em `settings.gamificationAchievements`, com estado de desbloqueio preservado em backup/importacao.
4. Repositorio/sync Firebase inicial implementado no contexto do Mathicx-File.
5. Isolamento local por usuario Firebase implementado em LocalStorage e IndexedDB.
6. Pendencias restantes: UI de status de sync, marcador de migracao e reconciliacao mais forte entre dispositivos.

## Novos Contratos Locais

Metas locais:

```json
{
  "gamificationGoals": {
    "dailyReviewTarget": 10,
    "quizAnswerTarget": 10,
    "weeklyStreakTarget": 7,
    "typingSessionTarget": 1
  }
}
```

Conquistas locais:

```json
{
  "gamificationAchievements": {
    "first-steps": {
      "id": "first-steps",
      "title": "Primeiros passos",
      "unlocked": true,
      "unlockedAt": "2026-07-07T00:00:00.000Z",
      "seenAt": "2026-07-07T00:00:00.000Z"
    }
  }
}
```

Caderno de erros:

- derivado em runtime pelo `GamificationEngine`;
- nao precisa de store propria neste momento;
- usa `difficultyMap` e `quizStats.recentErrors`;
- pode iniciar treino focado usando script/categoria do item.

## Integracao no Mathicx-File

Quando a aplicacao esta como iframe dentro do Mathicx-File, os campos locais acima sincronizam para:

```text
users/{uid}/apps/japanese-study/settings/main
users/{uid}/apps/japanese-study/achievements/{achievementId}
```

O app independente deve continuar local-first e sem dependencia obrigatoria de Firebase.
