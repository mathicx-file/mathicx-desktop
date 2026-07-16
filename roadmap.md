# Roadmap do Mathicx Desktop

O planejamento historico de migracao foi concluido. A fonte oficial e:

- [FIREBASE_ROADMAP_OFICIAL.md](docs/firebase-migration/FIREBASE_ROADMAP_OFICIAL.md)

## Estado em 2026-07-16

- Fases 0 a 18 concluidas;
- Firebase Auth, whitelist, Firestore Rules e App Check em producao;
- Desktop, Japanese Study e Finances isolados e sincronizados por UID;
- backup unificado, recuperacao, modo visitante e diagnostico operacional ativos;
- dicionario ampliado, pacotes offline, PWA e pipeline Pages concluidos;
- kit reutilizavel para futuras aplicacoes concluido.

Nao existe uma Fase 19 aprovada. Novas fases devem nascer de uma prioridade
funcional clara e ser registradas primeiro no roteiro oficial.

## Gates Mantidos

- `npm run dictionary:assess-infrastructure`: reavalia Pages, Storage e busca;
- `npm run firebase:assess-sync`: reavalia tempo real e granularizacao;
- `npm run firebase:rollout:check`: revalida seguranca e publicacao.

Ideias opcionais nao sao pendencias: novas aplicacoes, colaboracao, infraestrutura
externa do dicionario e granularizacao do Finances aguardam evidencia ou decisao
explicita do proprietario.
