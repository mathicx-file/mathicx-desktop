# Mathicx Desktop

Desktop virtual pessoal executado no navegador, com aplicativos integrados,
autenticacao Firebase, sincronizacao por usuario, modo visitante local, backup
unificado e publicacao estatica no GitHub Pages.

Aplicacao publicada: [mathicx-file.github.io/mathicx-desktop](https://mathicx-file.github.io/mathicx-desktop/)

## Estado Atual

O roteiro Firebase das Fases 0 a 18 foi concluido em 2026-07-16. O projeto usa:

- Firebase Auth como identidade principal;
- whitelist por `accessStatus` no Firestore;
- App Check aplicado a Authentication e Cloud Firestore;
- dados pessoais isolados em `users/{uid}`;
- modo visitante estritamente local, sem acesso ao Firebase;
- sincronizacao local-first para Desktop, Japanese Study e Finances;
- backup unificado, restauracao seletiva, rollback e criptografia para dados financeiros;
- dicionario japones em pacotes `essential`, `core` e `full`, com cache offline e PWA;
- kit contratual para integrar novos aplicativos sem alterar o kernel.

O [roteiro oficial](docs/firebase-migration/FIREBASE_ROADMAP_OFICIAL.md) e a
fonte de verdade para fases, decisoes e gates de reavaliacao.

## Aplicativos

| Aplicativo | Tipo | Persistencia |
| --- | --- | --- |
| Desktop, Configuracoes, Explorer e utilitarios | Modulos internos | LocalStorage/IndexedDB com sync por UID |
| Japanese Study | Iframe integrado | Local-first e Firestore por dominio |
| Finances | Iframe integrado | Local-first e snapshot transacional no Firestore |

Aplicativos integrados declaram capacidades de sync e backup no manifesto. A
Central de Sincronizacao os descobre automaticamente e mantem apps fechados em
estado lazy ate o usuario abri-los.

## Funcionalidades

- area de trabalho, widgets configuraveis, launcher, taskbar e dashboard;
- janelas redimensionaveis, minimizar, maximizar e snap layouts;
- explorador de arquivos virtual isolado por usuario;
- temas claro e escuro compartilhados com os aplicativos;
- cadastro pendente, aprovacao administrativa, bloqueio e papeis confiaveis;
- diagnostico operacional sanitizado e exportavel;
- conflitos explicitos entre dispositivos no Finances;
- migracao assistida de backup visitante para uma conta Firebase;
- busca do launcher integrada ao dicionario do Japanese Study;
- instalacao e atualizacao offline dos pacotes do dicionario.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Host | HTML, CSS e JavaScript com ES Modules |
| Identidade | Firebase Authentication |
| Dados remotos | Cloud Firestore |
| Protecao | Firebase App Check com reCAPTCHA Enterprise |
| Dados locais | LocalStorage, IndexedDB e Cache Storage |
| Publicacao | GitHub Actions e GitHub Pages |
| Testes | Node Test Runner e Firebase Emulator Suite |

O host nao usa framework ou bundler. O Node.js e usado apenas por testes,
geradores, validadores e pelo pipeline do Pages.

## Executar Localmente

Instale as dependencias de desenvolvimento:

```bash
npm ci --ignore-scripts
```

Sirva a raiz por HTTP:

```bash
python -m http.server 8080
```

Acesse `http://localhost:8080`. No PowerShell, use `npm.cmd` se a politica de
execucao bloquear `npm.ps1`.

### App Check local

Authentication e Firestore exigem App Check. Para testar uma conta Firebase em
`localhost`, use um token de debug registrado no Console Firebase. A configuracao
privada fica em `src/firebase/firebase-config.local.js`, arquivo ignorado pelo Git.
O modo visitante nao precisa de Firebase nem de token.

## Autenticacao e Dados

### Conta Firebase

1. O usuario cria a conta ou faz login.
2. Um perfil pendente e criado em `users/{uid}`.
3. O administrador define `accessStatus: "approved"`.
4. Desktop e aplicativos passam a sincronizar dentro do UID aprovado.

### Visitante

O visitante usa o escopo `guest-local-v1` no navegador atual. Esse modo nunca
le ou escreve Firestore, nao participa da whitelist e pode exportar um backup
identificado para migracao posterior a uma conta aprovada.

### Caminhos principais

```text
users/{uid}/desktop/settings
users/{uid}/apps/japanese-study/...
users/{uid}/apps/finances/...
users/{uid}/migrations/...
```

## Estrutura

```text
Applications/                 aplicativos independentes integrados
docs/                         arquitetura e roteiro Firebase
scripts/                      validacao, dicionario, Firebase e Pages
src/apps/                     apps internos, wrappers e contratos integrados
src/auth/                     Firebase Auth, whitelist e visitante
src/data/                     repositories e sincronizacao do Desktop
src/firebase/                 inicializacao, App Check, flags e paths
templates/integrated-app/     base para novos aplicativos integrados
```

## Testes Principais

```bash
npm run test:integration-kit
npm run test:diagnostics
npm run test:guest-mode
npm run test:recovery
npm run test:sync-architecture
npm run test:dictionary-pipeline
npm test --prefix Applications/japanese-study
npm run pages:build
npm run pages:validate
```

Testes de rules e integracao Auth/Firestore usam Firebase Emulator Suite e JDK:

```bash
npm run test:firestore-rules
npm run test:auth-firestore-integration
npm run test:firebase-security
```

## Publicacao

Pushes para `main` executam `.github/workflows/deploy-pages.yml`. O workflow:

1. valida seguranca Firebase e App Check;
2. executa suites do host, aplicativos e dicionario;
3. gera `_site` sem configuracoes locais ou segredos;
4. valida o artefato;
5. publica no GitHub Pages.

Um `workflow_dispatch` permite publicar uma tag ou commit anterior para rollback.

## Integrar um Novo Aplicativo

Use [templates/integrated-app](templates/integrated-app) e siga
[docs/app-integration.md](docs/app-integration.md). O contrato cobre:

- manifesto e descoberta automatica;
- iframe, tema e escopo por UID;
- estado e comando de sincronizacao;
- backup versionado, validacao, merge/replace e rollback;
- dados pessoais em `users/{uid}/apps/{appId}`.

## Documentacao

- [Indice tecnico](docs/README.md)
- [Arquitetura](docs/architecture.md)
- [Integracao de aplicativos](docs/app-integration.md)
- [Roteiro Firebase oficial](docs/firebase-migration/FIREBASE_ROADMAP_OFICIAL.md)
- [Japanese Study](Applications/japanese-study/README.md)
- [Finances](Applications/finances/README.md)

## Gates Opcionais

Nao ha fase obrigatoria pendente. Os gates podem reabrir decisoes quando houver
evidencia de capacidade, latencia, conflito, custo ou colaboracao:

```bash
npm run dictionary:assess-infrastructure
npm run firebase:assess-sync
```
