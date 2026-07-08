# Documentacao do mathicx-file

Esta pasta concentra a documentacao tecnica viva do desktop virtual `mathicx-file`.

## Leitura Recomendada

1. [README principal](../README.md): visao geral, execucao local, funcionalidades e fluxo de desenvolvimento.
2. [architecture.md](architecture.md): arquitetura do host, boot, subsistemas, storage, autenticacao e modelo de apps.
3. [firebase-migration/](firebase-migration/): documentos de planejamento e auditoria da migracao Firebase.
4. [app-integration.md](app-integration.md): passo a passo para integrar aplicacoes externas via iframe.
5. [../roadmap.md](../roadmap.md): ordem sugerida de versoes e funcionalidades.

## Documentos Ativos

| Documento | Quando usar |
| --- | --- |
| [architecture.md](architecture.md) | Para entender como o desktop virtual funciona internamente. |
| [firebase-migration/firebase-migration.md](firebase-migration/firebase-migration.md) | Para planejar a migracao Firebase ajustada ao projeto atual. |
| [app-integration.md](app-integration.md) | Para adicionar apps independentes em `Applications/<app-id>` com wrapper em `src/apps/<app-id>`. |

## Arquivo Historico

Documentos substituidos, longos ou historicos ficam em [archive](archive).

| Documento | Motivo |
| --- | --- |
| [archive/local-auth-legacy.md](archive/local-auth-legacy.md) | Resumo da autenticacao local antiga, agora legado diante do Firebase Auth. |
| [archive/firebase-migration-original.md](archive/firebase-migration-original.md) | Plano Firebase original gerado antes da proposta revisada. |

## Templates para Apps Externos

Os arquivos em [templates](templates) servem como ponto de partida para apps integrados por iframe.

| Template | Descricao |
| --- | --- |
| [templates/manifest.js](templates/manifest.js) | Manifesto do app no host. |
| [templates/view.js](templates/view.js) | Wrapper que cria o iframe, aplica sandbox e faz cleanup. |
| [templates/index.html](templates/index.html) | HTML base da aplicacao externa. |
| [templates/app.js](templates/app.js) | Estrutura JavaScript com listeners e cleanup. |
| [templates/styles.css](templates/styles.css) | CSS base para a aplicacao externa. |

## Scripts

| Script | Descricao |
| --- | --- |
| [scripts/setup-novo-app.sh](scripts/setup-novo-app.sh) | Gera a estrutura inicial de um novo app externo a partir dos templates. |

## Aplicacoes Externas de Exemplo

O projeto ja inclui apps externos reais em `Applications/`:

| App | Host wrapper | App real | Observacao |
| --- | --- | --- | --- |
| Japanese Study | `src/apps/japanese-study` | `Applications/japanese-study` | Integrado por iframe, com tema do host e sincronizacao Firebase local-first por usuario. |
| Finances | wrapper em `src/apps/` | `Applications/finances` | App de financas pessoais. |

Use essas integracoes como referencia pratica para novos projetos independentes.
