# Documentacao do Mathicx Desktop

Indice da documentacao tecnica viva. O planejamento Firebase das Fases 0 a 18
foi concluido em 2026-07-16.

## Leitura Recomendada

1. [README principal](../README.md): uso, execucao, testes e publicacao.
2. [architecture.md](architecture.md): boot, identidade, dados e aplicativos.
3. [app-integration.md](app-integration.md): contrato para novas aplicacoes.
4. [Roteiro Firebase oficial](firebase-migration/FIREBASE_ROADMAP_OFICIAL.md):
   historico, status e gates.

## Estado Atual

| Area | Documento principal |
| --- | --- |
| Firebase e fases | [firebase-migration/README.md](firebase-migration/README.md) |
| Seguranca e App Check | [Fase 17](firebase-migration/FIREBASE_PHASE_17_SECURITY_ROLLOUT.md) |
| Kit multi-app | [Fase 18.1](firebase-migration/FIREBASE_PHASE_18_1_APP_INTEGRATION_KIT.md) |
| Diagnostico | [Fase 18.3](firebase-migration/FIREBASE_PHASE_18_3_OPERATIONAL_DIAGNOSTICS.md) |
| Visitante | [Fase 18.4](firebase-migration/FIREBASE_PHASE_18_4_GUEST_MODE.md) |
| Gate do dicionario | [Fase 18.5](firebase-migration/FIREBASE_PHASE_18_5_DICTIONARY_INFRASTRUCTURE_GATE.md) |
| Gate de sync | [Fase 18.6](firebase-migration/FIREBASE_PHASE_18_6_SYNC_ARCHITECTURE_GATE.md) |

## Aplicativos

- [Japanese Study](../Applications/japanese-study/README.md)
- [Finances](../Applications/finances/README.md)
- [Wrapper do Finances](../src/apps/finances/README.md)

## Arquivo Historico

Documentos substituidos ficam em [archive](archive). Materiais dentro de
`firebase-migration` preservam a execucao das fases, mas o roteiro oficial
prevalece em caso de divergencia.

## Templates

Novos aplicativos integrados devem partir de
[`templates/integrated-app`](../templates/integrated-app), com manifesto, view,
adaptador de dados e teste contratual. O antigo conjunto de templates manuais foi
substituido pelo kit da Fase 18.1.
