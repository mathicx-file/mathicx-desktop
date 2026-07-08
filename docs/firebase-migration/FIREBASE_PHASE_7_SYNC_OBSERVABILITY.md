# Fase 7: Observabilidade e marcador de sincronizacao

> Data: 2026-07-08
>
> Escopo: tornar a sincronizacao Firebase do Japanese Study visivel para o usuario e registrar um marcador de migracao por UID.

## Objetivo

Depois da integracao inicial do Japanese Study ao Mathicx-File, a prioridade desta fase foi aumentar confianca operacional:

- mostrar ao usuario se o sync esta ativo, sincronizando, concluido ou indisponivel;
- registrar no Firestore que a camada local-first do Japanese Study ja foi inicializada para aquele usuario;
- reforcar os testes de rules para os paths especificos do app japones.

## Implementado

- Adicionado painel "Sincronizacao Firebase" na aba Configuracoes/Dados do Japanese Study.
- Criado status visual com estados:
  - `checking`;
  - `disabled`;
  - `pending`;
  - `hydrating`;
  - `syncing`;
  - `synced`;
  - `error`.
- O fluxo de sync agora emite eventos `japanese:firebase-sync-status` para atualizar a UI.
- O sync informa quando:
  - verifica Firebase e usuario aprovado;
  - baixa dados remotos;
  - aguarda envio de alteracoes locais;
  - envia snapshot para Firestore;
  - conclui a sincronizacao;
  - encontra falha de envio.
- Criado marcador de migracao:

```text
users/{uid}/migrations/japanese-study-local-first-sync-v1
```

Formato do marcador:

```json
{
  "appId": "japanese-study",
  "migrationId": "japanese-study-local-first-sync-v1",
  "schemaVersion": 1,
  "status": "completed",
  "reason": "initial-sync",
  "counts": {},
  "completedAt": "serverTimestamp",
  "updatedAt": "serverTimestamp"
}
```

## Decisoes

- O marcador de migracao e resiliente: se ele falhar, o upload principal de dados nao e desfeito.
- A UI de status vive dentro da aba Dados para ficar perto de backup/importacao.
- O app standalone continua funcionando sem Firebase; nesse caso o status mostra sincronizacao remota indisponivel/desativada.
- O sync continua local-first: Firestore e destino/remoto de sincronizacao, nao fonte obrigatoria para abrir o app.

## Testes

- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- O teste de rules `approved owner can access own desktop/app/migration subcollections` agora cobre explicitamente:
  - `users/{uid}/apps/japanese-study/settings/main`;
  - `users/{uid}/apps/japanese-study/profile/progression`;
  - `users/{uid}/apps/japanese-study/events/{eventId}`;
  - `users/{uid}/apps/japanese-study/srs/{itemId}`;
  - `users/{uid}/apps/japanese-study/achievements/{achievementId}`;
  - `users/{uid}/migrations/japanese-study-local-first-sync-v1`.

## Pendencias Recomendadas

1. Mostrar detalhes expandiveis do ultimo sync, como contagem de eventos/SRS/conquistas enviados.
2. Criar reconciliacao mais forte entre dispositivos para settings e SRS.
3. Criar testes de unidade especificos para a maquina de estados do sync.
4. Avaliar botao "Sincronizar agora" para disparar upload manual.
5. Adicionar indicadores no launcher/widget fora da aba Dados.
