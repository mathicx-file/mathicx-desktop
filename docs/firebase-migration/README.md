# Migracao Firebase e Evolucao do Projeto

Esta pasta preserva auditorias, planos, relatorios e criterios de aceite das
Fases 0 a 18. Todas as fases foram encerradas ate 2026-07-16.

## Fonte Oficial

[FIREBASE_ROADMAP_OFICIAL.md](FIREBASE_ROADMAP_OFICIAL.md) controla numeracao,
status e direcao. Em caso de divergencia com documentos antigos, ele prevalece.

## Fases

| Fases | Resultado |
| --- | --- |
| 0-4 | Auditoria, Firebase zero-build, Auth, whitelist e Rules |
| 5-9 | Sync do Desktop, Japanese Study, observabilidade e Finances |
| 10-15 | Provider, pipeline, shards, Pages, atualizacao e pacotes offline do dicionario |
| 16 | Backup unificado, restauracao e recuperacao |
| 17 | App Check, papeis admin, rollout e inventario do legado |
| 18 | Kit multi-app, diagnostico, visitante e gates opcionais |

## Documentos Recentes

1. [Fase 16](FIREBASE_PHASE_16_RELIABILITY_BACKUP.md)
2. [Fase 17](FIREBASE_PHASE_17_SECURITY_ROLLOUT.md)
3. [Inventario do legado](FIREBASE_PHASE_17_6_LEGACY_INVENTORY.md)
4. [Plano da Fase 18](FIREBASE_PHASE_18_OPTIONAL_EVOLUTIONS.md)
5. [Kit de integracao](FIREBASE_PHASE_18_1_APP_INTEGRATION_KIT.md)
6. [Diagnostico operacional](FIREBASE_PHASE_18_3_OPERATIONAL_DIAGNOSTICS.md)
7. [Modo visitante](FIREBASE_PHASE_18_4_GUEST_MODE.md)
8. [Gate do dicionario](FIREBASE_PHASE_18_5_DICTIONARY_INFRASTRUCTURE_GATE.md)
9. [Gate de sync](FIREBASE_PHASE_18_6_SYNC_ARCHITECTURE_GATE.md)

## Gates Reexecutaveis

```bash
npm run firebase:rollout:check
npm run dictionary:assess-infrastructure
npm run firebase:assess-sync
```

Nenhum gate cria automaticamente recursos pagos. Cloud Storage, busca externa,
tempo real ou granularizacao exigem nova aprovacao quando houver evidencia.
