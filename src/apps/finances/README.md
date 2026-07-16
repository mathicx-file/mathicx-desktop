# Wrapper do Finances

Esta pasta integra `Applications/finances` ao Mathicx Desktop.

## Componentes

- `manifest.js`: registra o app e declara o contrato integrado, dados financeiros
  e isolamento por usuario.
- `view.js`: monta o iframe, transmite tema e UID, conecta o protocolo de dados e
  remove listeners no fechamento.

O aplicativo participa automaticamente da Central de Sincronizacao e do backup
unificado por meio de `defineIntegratedAppManifest`. Apps fechados permanecem
lazy; a Central oferece **Abrir** antes de consultar o adaptador do iframe.

## Contratos

- ID canonico: `finances`;
- dados pessoais: `users/{uid}/apps/finances`;
- storage local: escopo por UID ou `guest-local-v1`;
- backup: exportar, validar, importar, pausar e retomar restauracao;
- seguranca: `financial: true`, exigindo backup protegido no fluxo unificado.

Para uma nova integracao, use `templates/integrated-app` e nao copie este wrapper
diretamente. O guia vigente esta em `docs/app-integration.md`.
