# Roadmap do mathicx-file

Este roadmap organiza ideias de evolucao para o `mathicx-file` considerando o estado atual do projeto e o planejamento de migracao para Firebase.

O objetivo e evitar uma reescrita grande. A ordem prioriza base tecnica, seguranca, dados por usuario e extensibilidade para novos apps internos/externos.

## Premissas

- O projeto continua zero-build no curto prazo.
- Firebase Auth sera a fonte de verdade da identidade.
- Usuarios locais atuais sao dados de teste e nao precisam ser migrados como contas reais.
- Firestore sera usado para dados pessoais pequenos e sincronizaveis.
- IndexedDB/localStorage continuam uteis como cache, fallback e armazenamento temporario.
- Apps externos via iframe continuam sendo uma estrategia valida, especialmente para projetos independentes como `japanese-study`.
- Dados grandes, publicos ou versionados, como dicionarios e assets, nao devem ir para Firestore.

## Principios de Priorizacao

1. Identidade antes de dados: sem `uid` confiavel nao ha sincronizacao segura.
2. Regras antes de escrita: Firestore so deve receber dados com Security Rules testadas.
3. Migrar por dominio: desktop, explorer, japanese-study, finances e futuros apps devem ter repositories proprios.
4. Fallback primeiro: local continua funcionando ate o remoto estar provado.
5. Poucos listeners: leitura pontual por padrao, realtime somente quando fizer diferenca real.
6. Apps independentes: cada app pode evoluir sem acoplar demais o host.
7. Rollback simples: feature flags para desligar Firebase Auth, leitura remota e escrita remota por etapa.

## Versao 0.1 - Base Documentada e Auditoria

Objetivo: entender o estado real antes de mexer no comportamento.

Funcionalidades:

- Criar `docs/FIREBASE_AUDITORIA_LOCAL.md`.
- Mapear usos de LocalStorage, IndexedDB e stores atuais.
- Separar dados em categorias: identidade, preferencias, dados pessoais, cache, assets publicos e dados de teste.
- Inventariar apps internos e externos, incluindo possiveis pontos de integracao do `japanese-study`.
- Definir quais dados locais serao descartados, preservados ou migrados.
- Criar um quadro de feature flags planejadas.

Resultado esperado:

- A equipe sabe exatamente o que pode ser apagado, migrado ou mantido como cache.
- A autenticacao local fica marcada como legado/teste.

## Versao 0.2 - Firebase Zero-Build e Emuladores

Objetivo: adicionar infraestrutura Firebase sem trocar a autenticacao ainda.

Funcionalidades:

- Criar `src/firebase/firebase-client.js`.
- Criar `src/firebase/firebase-config.example.js`.
- Criar `src/firebase/feature-flags.js`.
- Criar `firebase.json`, `firestore.rules` e `firestore.indexes.json`.
- Preparar conexão com Firebase Local Emulator Suite.
- Documentar setup local de Firebase no README ou em `docs/FIREBASE_SETUP.md`.
- Adicionar `.gitignore` para configs locais, se necessario.

Resultado esperado:

- Firebase inicializa em ambiente de desenvolvimento.
- Nenhuma credencial administrativa entra no repositorio.
- O desktop continua funcionando como antes.

## Versao 0.3 - Firebase Auth como Fonte de Verdade

Objetivo: substituir o gate de identidade local por Firebase Auth.

Funcionalidades:

- Criar `src/auth/firebase-auth-provider.js`.
- Transformar `src/auth/provider.js` em facade ou roteador por `authMode`.
- Implementar `authMode: 'firebase' | 'local'`.
- Adaptar `LoginScreen` para cadastro/login Firebase.
- Implementar logout Firebase limpando estado pessoal em memoria.
- Ignorar `users`, `sessions` e `stats` locais quando `authMode === 'firebase'`.
- Criar ou mesclar `users/{uid}` no primeiro login.

Resultado esperado:

- Firebase Auth decide quem esta logado.
- Usuarios locais de teste nao interferem mais no desktop.
- O desktop so abre com usuario Firebase autenticado.

## Versao 0.4 - Security Rules e Testes de Permissao

Objetivo: garantir isolamento entre usuarios antes de gravar dados reais.

Funcionalidades:

- Criar rules iniciais com deny-by-default.
- Permitir acesso do usuario apenas a `users/{uid}`.
- Criar testes de rules com emulador.
- Testar acesso negado entre usuarios.
- Testar usuario anonimo sem permissao.
- Testar paths publicos de catalogo/config.
- Definir estrategia de admin real com custom claims ou script confiavel.

Resultado esperado:

- Firestore bloqueia acesso cruzado.
- A base esta pronta para receber dados pessoais pequenos.

## Versao 0.5 - Perfil, Preferencias e Desktop Sync Inicial

Objetivo: sincronizar dados leves do desktop sem tocar ainda em apps complexos.

Funcionalidades:

- Sincronizar `theme`.
- Sincronizar favoritos e fixados.
- Sincronizar preferencias de widgets.
- Sincronizar atalhos do desktop, se o formato estiver estavel.
- Criar `DesktopRepository` local, Firestore e hibrido.
- Adicionar merge simples por `updatedAt`.
- Manter cache local para abertura rapida.

Resultado esperado:

- Usuario logado ve suas preferencias basicas em outro navegador/dispositivo.
- LocalStorage deixa de ser fonte de verdade para preferencias sincronizadas.

## Versao 0.6 - Framework de Apps Protegidos

Objetivo: criar uma base para apps internos/externos usarem identidade e dados por usuario.

Funcionalidades:

- Adicionar `requiresAuth` no manifesto de apps.
- Bloquear abertura de app protegido durante `auth loading`.
- Fechar ou bloquear apps protegidos no logout.
- Passar `services` para apps internos no `mount`.
- Criar um bridge padrao para iframes com `postMessage` minimo.
- Documentar contrato para apps externos acessarem Firebase com a mesma config.

Resultado esperado:

- Apps passam a ter um contrato comum de autenticacao.
- O desktop consegue hospedar apps protegidos sem cada um reinventar login.

## Versao 0.7 - Integracao Inicial do Japanese Study

Objetivo: integrar `japanese-study` como app do desktop com dados por usuario.

Funcionalidades:

- Definir se `japanese-study` entra como iframe/hibrido ou app interno.
- Criar wrapper em `src/apps/japanese-study`.
- Criar `Applications/japanese-study`, se for app externo.
- Criar `JapaneseStudyRepository` com contrato minimo.
- Separar dados de usuario de dados publicos do dicionario.
- Salvar progresso, favoritos e configuracoes em `users/{uid}/apps/japanese-study`.
- Manter dicionario, KanjiVG e assets como arquivos estaticos versionados/cacheados.

Resultado esperado:

- Usuario abre `japanese-study` pelo desktop sem novo login.
- Progresso basico fica associado ao `uid` Firebase.

## Versao 0.8 - Migracao Controlada de Dados Locais Relevantes

Objetivo: importar somente dados locais que valham a pena preservar.

Funcionalidades:

- Criar `MigrationRunner`.
- Criar marcadores em `users/{uid}/migrations/{migrationId}`.
- Criar migracao idempotente para preferencias do desktop.
- Criar migracao idempotente para progresso do `japanese-study`, se houver dados locais reais.
- Mostrar resumo da migracao para o usuario.
- Nao migrar usuarios/sessoes locais de teste.
- Manter backup local temporario.

Resultado esperado:

- Rodar a migracao duas vezes nao duplica dados.
- Usuario Firebase pode importar dados locais relevantes com seguranca.

## Versao 0.9 - Explorer Sincronizado Opcional

Objetivo: avaliar se o filesystem virtual deve ser sincronizado.

Funcionalidades:

- Definir limite de tamanho para docs do explorer.
- Criar `ExplorerRepository`.
- Sincronizar metadados e documentos pequenos.
- Considerar Firebase Storage apenas para arquivos maiores, se necessario.
- Adicionar export/import manual do explorer.
- Criar politica de conflito para documentos editados em dois dispositivos.

Resultado esperado:

- Explorer pode acompanhar o usuario entre dispositivos, sem transformar Firestore em armazenamento de arquivos grandes.

## Versao 1.0 - Release Firebase Estavel

Objetivo: consolidar uma primeira versao utilizavel com Firebase.

Funcionalidades:

- Firebase Auth em producao.
- Firestore rules testadas.
- Perfil e preferencias sincronizadas.
- `japanese-study` integrado com progresso remoto basico.
- Feature flags documentadas.
- Rollback documentado.
- Guia de deploy GitHub Pages atualizado.
- Checklist de privacidade e seguranca revisado.

Resultado esperado:

- Projeto pronto para uso real com multiplos usuarios.
- Dados pessoais basicos seguem o usuario.
- Apps protegidos respeitam logout e troca de conta.

## Versao 1.1 - App Catalog e Instalacao de Apps

Objetivo: transformar o desktop em plataforma de apps.

Funcionalidades:

- Criar catalogo remoto de apps em `publicAppCatalog`.
- Permitir habilitar/desabilitar apps por usuario.
- Criar grupos: sistema, estudo, produtividade, financas, ferramentas.
- Permitir favoritos por usuario no Firestore.
- Criar tela de gerenciamento de apps nas configuracoes.
- Definir manifestos com `requiresAuth`, `dataScopes` e `launchMode`.

Resultado esperado:

- O desktop deixa de depender apenas do registry estatico.
- Futuros apps podem ser adicionados com menos alteracao manual.

## Versao 1.2 - Backup, Exportacao e Privacidade

Objetivo: dar controle real dos dados ao usuario.

Funcionalidades:

- Exportar dados do usuario em JSON.
- Importar backup com validacao.
- Solicitar exclusao de dados do usuario.
- Tela de "Meus dados" nas configuracoes.
- Separar cache local de dados pessoais.
- Limpar estado local ao logout, preservando apenas cache publico seguro.

Resultado esperado:

- O usuario entende e controla o que esta salvo.
- O projeto fica mais preparado para uso serio.

## Versao 1.3 - Melhorias de UX do Desktop

Objetivo: deixar a experiencia mais polida e produtiva.

Funcionalidades:

- Busca global unificada com apps, arquivos, comandos e itens de apps.
- Command palette.
- Multi-workspaces ou mesas virtuais.
- Restaurar sessao de janelas por usuario.
- Layouts salvos de janelas.
- Widgets configuraveis por usuario.
- Notificacoes centralizadas.
- Melhor suporte mobile/tablet.

Resultado esperado:

- O desktop passa a parecer uma central diaria de trabalho/estudo, nao apenas um launcher.

## Versao 1.4 - Sincronizacao Avancada e Offline

Objetivo: melhorar resiliencia e experiencia multi-dispositivo.

Funcionalidades:

- Fila local de escritas offline por dominio.
- Indicador de sync: salvo, pendente, offline, erro.
- Retry com backoff.
- Resolucao de conflitos por tipo de dado.
- Logs tecnicos sem dados sensiveis.
- Testes de troca de usuario no mesmo navegador.

Resultado esperado:

- O app continua usavel com instabilidade de rede.
- O usuario sabe quando algo ainda nao foi sincronizado.

## Versao 1.5 - Hardening de Seguranca

Objetivo: reduzir risco em producao.

Funcionalidades:

- App Check em modo observacao.
- App Check enforcement gradual.
- Custom claims para admin real.
- Scripts administrativos fora do frontend.
- Testes automatizados de Firestore Rules em CI.
- Revisao de paths publicos e privados.
- Validacao de schema nas rules para documentos criticos.

Resultado esperado:

- Firebase fica mais protegido contra abuso e erro de configuracao.

## Versao 2.0 - Plataforma Pessoal de Apps

Objetivo: tornar o `mathicx-file` um desktop virtual extensivel.

Funcionalidades:

- Registro dinamico de apps.
- SDK/bridge oficial para apps externos.
- Canal padronizado de eventos entre host e iframe.
- Temas compartilhados com apps.
- Permissoes por app, como leitura de perfil, escrita de progresso, notificacoes.
- Marketplace pessoal/local de apps.
- PWA instalavel.
- Cache offline de shell e apps principais.

Resultado esperado:

- Novos apps podem entrar no ecossistema com baixo atrito.
- O desktop vira a base comum de identidade, dados e experiencia.

## Ideias Extras para Backlog

### Produto e Experiencia

- Onboarding visual apos primeiro login Firebase.
- Tour do desktop para novos usuarios.
- Tela "continuar de onde parei".
- Historico de atividades por app.
- Favoritos inteligentes com base no uso.
- Perfil de estudo para apps educacionais.
- Sistema de conquistas opcional para `japanese-study`.
- Notificacoes de revisao espacada.
- Painel "Hoje" com tarefas, estudos e financas.

### Apps

- `japanese-study` como app principal de estudo.
- App de flashcards reutilizavel por outros conteudos.
- App de tarefas simples sincronizado.
- App de calendario leve.
- App de links/bookmarks.
- App de snippets/notas tecnicas.
- App de leitura com progresso.
- App de financas migrado parcialmente para Firebase, se fizer sentido.

### Desenvolvimento

- Testes smoke do host.
- Testes de contratos de repositories.
- Testes de Firestore Rules no emulador.
- Documentacao de "como criar um app interno".
- Documentacao de "como criar um app externo".
- Templates atualizados com Firebase/bridge opcional.
- CI para validar Markdown, links e regras.

### Arquitetura

- `services` central no kernel.
- `authGuard` reutilizavel.
- `DataRepository` por dominio.
- `AppBridge` para iframes.
- `SyncStatusStore`.
- `FeatureFlagProvider`.
- `MigrationRunner`.
- `SchemaVersionManager`.

## Skills Uteis para Fases Futuras

Estas skills podem ser chamadas em momentos especificos:

| Skill | Quando usar |
| --- | --- |
| `firebase` | Ao implementar Auth, Firestore, emuladores, rules e App Check. |
| `architecture` | Ao revisar o desenho de services, repositories e app bridge. |
| `api-security-best-practices` | Ao endurecer rules, permissoes e fluxos administrativos. |
| `accesslint-audit` ou `accesslint-scan` | Ao revisar acessibilidade do desktop e telas de login/configuracao. |
| `acceptance-orchestrator` | Ao definir criterios de aceite por versao. |
| `app-builder` | Ao criar novos apps internos ou externos. |
| `ai-product` | Ao priorizar features por valor de produto. |
| `testing-qa` ou skills de testes equivalentes | Ao estruturar testes de smoke, regras e repositories. |
| `documentation` e `readme` | Ao atualizar docs depois de cada versao maior. |

## Ordem Recomendada Resumida

```text
0.1 Auditoria e classificacao dos dados
0.2 Firebase zero-build e emuladores
0.3 Firebase Auth como identidade unica
0.4 Security Rules e testes
0.5 Preferencias do desktop no Firestore
0.6 Apps protegidos e bridge inicial
0.7 Japanese Study integrado
0.8 Migracao controlada de dados relevantes
0.9 Explorer sincronizado opcional
1.0 Release Firebase estavel
1.1 Catalogo e gerenciamento de apps
1.2 Backup, exportacao e privacidade
1.3 UX avancada do desktop
1.4 Offline/sync avancado
1.5 Hardening de seguranca
2.0 Plataforma pessoal de apps
```

## Nao-Objetivos por Enquanto

- Reescrever o projeto em React/Vue/Angular.
- Migrar todos os dados locais de uma vez.
- Migrar usuarios locais de teste para Firebase Auth.
- Usar Firestore para dicionarios grandes ou assets publicos.
- Criar backend proprio antes de provar a necessidade.
- Criar marketplace publico antes de estabilizar o modelo de apps pessoais.

## Definicao de Sucesso

O roadmap sera bem-sucedido se:

- Firebase Auth substituir a identidade local sem confusao entre usuarios.
- Firestore armazenar apenas dados que precisam ser sincronizados.
- Apps internos e externos conseguirem usar a identidade comum.
- `japanese-study` funcionar dentro do desktop com progresso por usuario.
- O projeto continuar simples de rodar localmente.
- A arquitetura permitir novos apps sem reescrever o host.
