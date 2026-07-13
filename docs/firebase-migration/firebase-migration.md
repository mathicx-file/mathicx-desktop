# Proposta Revisada de Migracao para Firebase

> Status documental: referencia historica e tecnica.
>
> A numeracao oficial atual esta em [FIREBASE_ROADMAP_OFICIAL.md](FIREBASE_ROADMAP_OFICIAL.md).

Este documento registra uma leitura critica do plano original arquivado em `docs/archive/firebase-migration-original.md` e propoe uma rota de implementacao mais alinhada ao estado atual do `mathicx-file`.

O objetivo aqui nao e substituir o plano original. Ele e bom como documento amplo. A ideia e transformar aquela especificacao em uma estrategia mais pratica para este projeto: um desktop virtual estatico, sem build, com apps internos em ES Modules e apps externos em `Applications/` via iframe.

## Diagnostico Rapido

O projeto atual tem estas caracteristicas importantes:

- Host sem framework, sem `package.json`, sem bundler e sem etapa de build.
- Entrada unica em `index.html`, carregando `src/main.js` como ES Module.
- Autenticacao local ja implementada em `src/auth`, usando IndexedDB e Web Crypto API.
- Estado leve em LocalStorage via `src/storage/local-storage.js`.
- Dados estruturados em IndexedDB via `src/storage/indexeddb.js`.
- Apps internos registrados em `src/apps/registry.js`.
- Apps externos isolados em `Applications/<app-id>` e expostos por wrapper em `src/apps/<app-id>`.
- App de financas ja integrado via iframe.
- Projeto `japanese-study` ainda deve ser encaixado, provavelmente como app externo ou semi-externo.

Por isso, a migracao Firebase deve comecar pelo desktop como identidade e camada de dados compartilhada, sem exigir que todos os apps sejam reescritos de uma vez.

## Avaliacao do Plano Existente

O plano original arquivado em `docs/archive/firebase-migration-original.md` acerta nos pontos grandes:

- Um projeto Firebase compartilhado por ambiente.
- Firebase Auth centralizado no desktop.
- Firestore para dados pessoais e sincronizaveis.
- Dados grandes de dicionario japones fora do Firestore.
- Regras de seguranca desde o inicio.
- Migracao gradual, reversivel e com fallback local.
- Emuladores e testes de rules como requisito real.

Mas eu ajustaria alguns pontos antes de implementar:

1. O plano usa exemplos com `VITE_*` e `import.meta.env`, mas o projeto atual nao usa Vite.
2. A frase "uma unica instancia Firebase por pagina" nao se aplica literalmente a apps em iframe, porque cada iframe tem seu proprio contexto JavaScript.
3. Nao e seguro tentar migrar senhas locais para Firebase Auth pelo frontend.
4. O conceito de admin precisa ser repensado: admin real em Firebase deve usar custom claims ou escrita server-side confiavel, nao apenas um campo editavel pelo cliente.
5. A primeira migracao nao deve mirar apenas `japanese-study`; o desktop tambem tem dados de usuario que pedem sincronizacao.
6. O Firestore deve ser modelado por consultas reais e por custo de leitura, nao como espelho completo do IndexedDB.

## Decisao Principal Recomendada

Eu faria a migracao em duas trilhas:

```text
Trilha A: Identidade e infraestrutura compartilhada
  - Firebase SDK
  - Firebase Auth
  - AuthProvider novo
  - Firestore rules
  - user profile
  - feature flags

Trilha B: Dados por dominio
  - desktop preferences
  - desktop shortcuts/pinned/favorites
  - explorer virtual, se fizer sentido sincronizar
  - japanese-study progress
  - finances, se for migrar depois
```

Essa separacao evita que a autenticacao, o desktop, o app japones e todos os dados locais virem uma unica grande migracao dificil de testar.

## Zero-Build Primeiro

Minha recomendacao inicial e preservar o modelo zero-build.

O Firebase Web SDK pode ser usado em navegador moderno por ES Modules via CDN oficial/estatico, sem instalar npm. Isso combina melhor com o projeto atual e evita introduzir Vite apenas para ler variaveis de ambiente.

Estrutura sugerida:

```text
src/firebase/
|-- firebase-config.example.js
|-- firebase-config.local.js       # ignorado no git
|-- firebase-client.js
|-- firebase-emulators.js
|-- firebase-auth-provider.js
|-- firestore-paths.js
`-- feature-flags.js
```

Exemplo conceitual:

```javascript
// src/firebase/firebase-client.js
import { initializeApp, getApp, getApps } from 'https://www.gstatic.com/firebasejs/__/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/__/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/__/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.local.js';

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const firebaseAuth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
```

Observacao: os caminhos exatos do CDN devem ser definidos na implementacao conforme a versao escolhida. O principio e usar SDK modular e importar somente produtos necessarios.

Se depois voce quiser build, ai sim faria sentido migrar para:

```text
package.json
Vite
import.meta.env
npm scripts
GitHub Actions com secrets
bundle otimizado
```

Mas eu nao colocaria isso como pre-requisito da migracao.

## Firebase Web Config

A configuracao Web do Firebase nao e segredo no mesmo sentido de uma service account. Ela aparece no frontend. A seguranca deve vir de:

- Firebase Authentication.
- Firestore Security Rules.
- App Check em fase posterior.
- Ausencia total de credenciais administrativas no cliente.

Ainda assim, eu nao versionaria valores reais direto no repositorio no inicio. Usaria:

```text
src/firebase/firebase-config.example.js
src/firebase/firebase-config.local.js
```

E adicionaria no `.gitignore`:

```text
src/firebase/firebase-config.local.js
```

Para deploy estatico no GitHub Pages sem build, ha duas opcoes:

1. Versionar um `firebase-config.prod.js` com config publica de producao.
2. Gerar esse arquivo no workflow antes de publicar.

A opcao 2 e mais limpa, mas exige configurar um workflow. A opcao 1 e aceitavel tecnicamente desde que as rules estejam corretas, mas menos elegante.

## Autenticacao

Eu substituiria gradualmente o `authProvider` local por um provider compatibilizado com Firebase, mantendo a interface mental atual do projeto.

Hoje o desktop usa:

```text
src/auth/provider.js
src/auth/login-screen.js
src/auth/crypto.js
```

Eu migraria para:

```text
src/auth/provider.js              # facade usada pelo desktop
src/auth/local-auth-provider.js   # legado temporario, se necessario
src/auth/firebase-auth-provider.js
src/auth/login-screen.js          # reaproveitada e adaptada
```

Contrato sugerido para a facade:

```javascript
authProvider.ready()
authProvider.restoreSession()
authProvider.login(email, password)
authProvider.register({ nome, email, senha })
authProvider.logout()
authProvider.getCurrentUser()
authProvider.isAdmin()
authProvider.onAuthChange(callback)
```

O kernel continua perguntando ao `authProvider` se existe sessao. O desktop nao precisa saber se por baixo e IndexedDB local ou Firebase Auth.

### Fonte de verdade da identidade

Como os usuarios locais atuais sao apenas registros de teste, eu nao tentaria reconciliar usuario local com usuario Firebase.

A regra recomendada para a migracao e:

```text
Firebase Auth define quem e o usuario.
Firestore guarda dados persistentes por uid.
IndexedDB/localStorage nao decidem identidade.
```

Isso significa que, quando `firebaseAuthEnabled` estiver ativo:

- o kernel nao deve aceitar sessao local como autenticacao valida;
- `authProvider.restoreSession()` deve observar o estado do Firebase Auth, nao o store `sessions` do IndexedDB;
- `users`, `sessions` e `stats` locais devem ser ignorados para decisao de login;
- logout do Firebase deve limpar qualquer estado pessoal em memoria no desktop;
- apps protegidos devem depender do `uid` Firebase;
- nenhum dado novo deve ser associado a um usuario local sem `uid` Firebase.

Se houver necessidade de manter o login local para desenvolvimento, ele deve ficar atras de uma flag explicita, por exemplo:

```javascript
export const featureFlags = {
  authMode: 'firebase', // 'local' somente para dev/rollback temporario
};
```

No modo `firebase`, a autenticacao local nao deve rodar em paralelo. Rodar os dois gates ao mesmo tempo e o caminho mais facil para criar bugs de usuario "meio logado": desktop autenticado localmente, mas Firestore sem `uid` valido.

### Dados locais de teste

Como os dados locais atuais nao precisam ser preservados como contas reais:

1. Nao migrar usuarios locais para Firebase Auth.
2. Nao tentar converter hashes PBKDF2 locais em contas Firebase.
3. Criar usuarios novos diretamente no Firebase Auth.
4. Opcionalmente adicionar uma ferramenta de desenvolvimento para limpar `users`, `sessions` e `stats` locais.
5. Migrar apenas dados de produto que voce realmente queira preservar, e somente depois de login Firebase.

Em outras palavras: a migracao de identidade deve ser uma troca de fonte de verdade, nao uma mesclagem entre duas bases de usuarios.

### Migracao de usuarios locais

Eu nao tentaria migrar senhas locais para o Firebase Auth pelo cliente.

Se algum dado local deixar de ser apenas teste e passar a ser importante, o melhor caminho e:

1. Usuario cria ou acessa uma conta Firebase.
2. O app detecta dados locais antigos no mesmo navegador.
3. O app pergunta se deseja vincular/importar esses dados para a conta atual.
4. A migracao copia dados pessoais locais para `users/{uid}`.
5. Os dados locais ficam como backup temporario.

Isso evita lidar com importacao de hash, Admin SDK e riscos de seguranca.

### Admin

O admin atual e local (`perfil: 'admin'`). Em Firebase, existem duas camadas:

- UX admin: mostrar ou esconder painel.
- Permissao admin real: permitir ou negar leitura/escrita em paths administrativos.

Para permissao real, eu recomendo custom claims:

```text
request.auth.token.admin == true
```

Custom claims exigem Admin SDK, Cloud Functions ou script administrativo fora do frontend. Portanto, para a primeira fase:

- usar Firebase Console para gerenciar usuarios;
- ou criar um script/admin function especifico;
- nao permitir que o cliente se autopromova a admin por Firestore.

## Apps Internos e Externos

### Apps internos

Apps internos podem receber dependencias pelo contexto do `mount`:

```javascript
export function mount(host, { win, wm, bus, services }) {
  const { auth, db } = services;
}
```

Para isso, o `WindowManager` pode passar um objeto `services` central, vindo do kernel.

### Apps externos via iframe

Um iframe no mesmo dominio pode inicializar o Firebase com a mesma configuracao e observar o mesmo Auth persistence da origem, mas ele ainda e outro contexto JavaScript.

Eu trataria assim:

- O desktop e dono da sessao visual.
- O app externo pode inicializar Firebase por conta propria, usando a mesma config.
- O app externo deve usar `onAuthStateChanged` e aguardar o usuario.
- Nao enviar senha por `postMessage`.
- Nao enviar token por URL.
- Se precisar comunicar estado de UI, usar `postMessage` com payload minimo.

Para `japanese-study`, eu escolheria uma destas abordagens:

| Abordagem | Quando usar |
| --- | --- |
| Iframe com Firebase proprio | Melhor se o projeto ja existe independente e voce quer preservar autonomia. |
| App interno nativo | Melhor se ele sera profundamente integrado ao desktop. |
| Hibrido | App roda em iframe, mas usa um pequeno SDK/bridge comum para auth, tema e eventos. |

Minha escolha inicial: iframe/hibrido. Mantem o projeto japones independente e reduz risco.

## Modelo Firestore Proposto

Eu manteria todos os dados pessoais sob `users/{uid}`.

```text
users/{uid}
  displayName
  email
  photoURL
  createdAt
  updatedAt
  schemaVersion

users/{uid}/desktop/settings/main
users/{uid}/desktop/shortcuts/{shortcutId}
users/{uid}/desktop/pinned/{appId}
users/{uid}/desktop/favorites/{appId}
users/{uid}/desktop/activity/{activityId}

users/{uid}/explorer/nodes/{nodeId}

users/{uid}/apps/japanese/settings/main
users/{uid}/apps/japanese/kanaProgress/{kanaId}
users/{uid}/apps/japanese/kanjiProgress/{kanjiId}
users/{uid}/apps/japanese/favorites/{entryId}
users/{uid}/apps/japanese/reviews/{reviewId}
users/{uid}/apps/japanese/customLists/{listId}
users/{uid}/apps/japanese/customLists/{listId}/items/{entryId}

users/{uid}/apps/finances/...       # futuro, se migrar financas

users/{uid}/migrations/{migrationId}

publicAppCatalog/{appId}
publicAppConfig/{configId}
```

Eu prefiro `users/{uid}/apps/{appId}/...` em vez de `users/{uid}/japanese/...`, porque escala melhor quando novas aplicacoes entrarem no desktop.

### O que migrar primeiro

Primeira leva:

- `desktop/settings/main`
- `desktop/pinned`
- `desktop/favorites`
- `apps/japanese/settings/main`
- `apps/japanese/*Progress`
- `apps/japanese/favorites`
- marcador de migracao

Segunda leva:

- atalhos do desktop;
- explorer virtual;
- activity log;
- financas;
- configuracoes avancadas por app.

### O que nao migrar para Firestore

Eu nao colocaria no Firestore:

- dicionarios grandes;
- KanjiVG;
- assets publicos;
- cache derivado;
- logs verbosos de UI;
- snapshots grandes de documentos;
- qualquer segredo;
- tokens;
- senhas.

Dados linguisticos grandes devem ficar como assets versionados, com cache em IndexedDB.

## Security Rules Inicial

Comecaria com regra fechada e bem pequena:

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    match /users/{userId} {
      allow create: if isOwner(userId);
      allow read, update, delete: if isOwner(userId);

      match /{document=**} {
        allow read, write: if isOwner(userId);
      }
    }

    match /publicAppCatalog/{appId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /publicAppConfig/{configId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Depois, quando os schemas estabilizarem, eu adicionaria validacoes de campos por path. No inicio, bloquear acesso cruzado entre usuarios e mais importante que tentar validar tudo no primeiro commit.

## Camada de Dados

Eu criaria repositories por dominio, nao um repository gigante.

```text
src/data/
|-- repository-contracts.js
|-- desktop/
|   |-- local-desktop-repository.js
|   |-- firestore-desktop-repository.js
|   `-- hybrid-desktop-repository.js
|-- explorer/
|   |-- local-explorer-repository.js
|   |-- firestore-explorer-repository.js
|   `-- hybrid-explorer-repository.js
`-- migrations/
    |-- migration-runner.js
    |-- migrate-local-auth-user.js
    |-- migrate-desktop-v1.js
    `-- migrate-japanese-v1.js
```

Para `japanese-study`, se ele ficar fora de `src`, eu criaria dentro do app uma camada equivalente:

```text
Applications/japanese-study/js/data/
|-- japanese-repository.js
|-- local-japanese-repository.js
|-- firestore-japanese-repository.js
`-- hybrid-japanese-repository.js
```

Mas manteria um contrato documentado no host para padronizar.

## Estrategia de Sincronizacao

Eu evitaria listeners em tempo real em tudo.

Usaria:

- `getDoc/getDocs` para carregamento inicial de configuracoes e progresso.
- Escritas com debounce para progresso frequente.
- `onSnapshot` apenas em dados que realmente precisam refletir mudanca ao vivo.
- Cache local como abertura rapida.
- Fila local simples para writes offline, se a persistencia offline do Firestore nao for suficiente para o caso.

Para o desktop, provavelmente leitura simples basta.

Para `japanese-study`, eu faria:

```text
abrir app
  -> carregar dicionario/cache local
  -> aguardar auth ready
  -> carregar progresso local
  -> carregar progresso remoto
  -> merge por updatedAt/schemaVersion
  -> renderizar estado final
  -> salvar mudancas com debounce
```

## Feature Flags

Antes de trocar comportamento, eu colocaria flags:

```javascript
export const featureFlags = {
  firebaseEnabled: false,
  firebaseAuthEnabled: false,
  firestoreDesktopReadEnabled: false,
  firestoreDesktopWriteEnabled: false,
  firestoreJapaneseReadEnabled: false,
  firestoreJapaneseWriteEnabled: false,
  localMigrationEnabled: false,
  localFallbackEnabled: true,
};
```

Isso deixa a migracao reversivel sem desfazer codigo.

## Ordem de Implementacao que Eu Seguiria

### Fase 0: Auditoria real

Entregavel:

```text
docs/firebase-migration/FIREBASE_AUDIT.md
```

Mapear:

- todos os usos de LocalStorage;
- todos os stores IndexedDB;
- todos os dados do auth local;
- apps que usam dados proprios;
- como `japanese-study` sera encaixado;
- quais dados sao pessoais, publicos, cache ou derivados.

### Fase 1: Config Firebase zero-build

Criar:

```text
src/firebase/firebase-config.example.js
src/firebase/firebase-client.js
src/firebase/firebase-emulators.js
src/firebase/feature-flags.js
firebase.json
firestore.rules
firestore.indexes.json
```

Sem trocar auth ainda.

### Fase 2: Firebase Auth em paralelo

Criar `firebase-auth-provider.js`, mas manter o provider local apenas como codigo legado/desenvolvimento.

Objetivo: provar cadastro/login/logout Firebase sem quebrar o desktop.

### Fase 3: Trocar gate de auth do desktop

O kernel passa a usar Firebase Auth quando `firebaseAuthEnabled` estiver ativo.

Quando Firebase Auth estiver ativo:

- nao restaurar sessao local do IndexedDB;
- nao mostrar setup do primeiro admin local;
- nao considerar usuario local como usuario autenticado;
- limpar estado pessoal em memoria ao receber logout do Firebase;
- fechar ou bloquear apps protegidos se o Firebase Auth ficar sem usuario.

Manter fallback local temporario somente por flag explicita, como `authMode: 'local'`, para desenvolvimento ou rollback.

### Fase 4: Perfil e documento `users/{uid}`

Ao logar:

- criar/mesclar `users/{uid}`;
- gravar `lastLoginAt`;
- nao sobrescrever campos existentes;
- preparar rules.

### Fase 5: Rules e emulator tests

Antes de escrever dados reais:

- testar owner read/write;
- testar acesso negado a outro uid;
- testar usuario anonimo;
- testar admin claim, se existir;
- testar paths desconhecidos negados.

### Fase 6: Repositories do desktop

Migrar preferencias leves primeiro:

- theme;
- pinned;
- favorites;
- shortcuts, se o formato estiver estavel.

Nao mexer ainda no explorer inteiro.

### Fase 7: Integrar `japanese-study`

Definir se sera iframe/hibrido ou app interno.

Criar repository local e Firestore para progresso/favoritos.

### Fase 8: Migracao local por usuario

Importar dados locais somente depois de login Firebase.

Para o estado atual do projeto, essa fase nao precisa migrar usuarios locais, pois eles sao dados de teste. Ela deve focar apenas em dados de produto que voce decidir preservar.

Usar marcador:

```text
users/{uid}/migrations/local-v1
```

### Fase 9: Rollout controlado

Ativar leitura remota antes de escrita remota para todos.

Depois ativar escrita por app.

### Fase 10: Remover legado com calma

So remover auth local e storage local como fonte principal depois de uma versao estavel.

## Ajustes no Plano Original

Eu mudaria estes pontos no documento original:

| Plano original | Ajuste recomendado |
| --- | --- |
| Usar `VITE_*` desde a Fase 1 | Comecar zero-build com config JS local/exemplo; Vite e opcional depois. |
| Um Firebase client unico para desktop e apps | Um projeto/config unico; instancia unica so dentro do mesmo contexto JS. Iframes terao instancia propria. |
| Auth pertence ao desktop | Correto, mas apps em iframe tambem devem observar Auth no proprio contexto. |
| Migrar StorageDB do app japones | Antes, inventariar tambem dados do desktop: prefs, shortcuts, pinned, explorer, auth local. |
| Compatibilizar usuario local com Firebase | Nao reconciliar usuarios de teste; Firebase Auth vira fonte de verdade e auth local fica desativada no modo Firebase. |
| Admin via perfil de usuario | Para seguranca real, usar custom claims ou backend/admin script. |
| Firestore em `users/{uid}/japanese` | Preferir `users/{uid}/apps/japanese` para escalar para outros apps. |
| Firestore sync amplo | Comecar por dados pequenos e com query clara. |

## Riscos Principais

### Risco 1: adotar build cedo demais

Introduzir Vite pode ser positivo no futuro, mas agora aumenta escopo. A migracao para Firebase ja e grande.

Mitigacao: preservar zero-build na primeira etapa.

### Risco 2: permissao admin falsa

Campo `perfil: 'admin'` no Firestore pode virar brecha se o proprio usuario puder escrever nele.

Mitigacao: custom claims ou path administrativo escrito apenas por ambiente confiavel.

### Risco 3: duplicar dados por app

Cada app pode inventar seu proprio schema e seu proprio Firebase.

Mitigacao: criar convencao `users/{uid}/apps/{appId}` e repositories.

### Risco 4: custo por listeners

Listeners permanentes em desktop, taskbar, apps e iframes podem aumentar leituras.

Mitigacao: usar leitura pontual por padrao; listener so onde houver valor claro.

### Risco 5: vazamento entre usuarios no mesmo navegador

Se trocar conta sem limpar estado em memoria, um app pode mostrar dados do usuario anterior.

Mitigacao: `AUTH_CHANGE` deve limpar caches pessoais em memoria e fechar/recarregar apps protegidos.

### Risco 6: migrar senha local

Hash local nao deve virar problema de seguranca.

Mitigacao: nao migrar senha; migrar dados apos login Firebase.

### Risco 7: dupla autenticacao ativa

Se o gate local e o gate Firebase ficarem ativos juntos, o desktop pode abrir como usuario local enquanto o Firestore ainda esta sem usuario, ou com outro `uid`.

Mitigacao: definir `authMode` e garantir que, no modo Firebase, o IndexedDB local de usuarios/sessoes nao decide login. Firebase Auth deve ser a unica fonte de identidade.

## Criterios de Pronto da Primeira Entrega Firebase

Eu consideraria a primeira entrega pronta quando:

- Firebase inicializa sem quebrar o desktop.
- Auth Firebase funciona com cadastro, login, logout e restore.
- O modo Firebase ignora usuarios e sessoes locais de teste.
- Usuario logado gera `users/{uid}`.
- Rules impedem acesso a outro usuario.
- Emuladores rodam localmente.
- Desktop ainda funciona sem migrar todos os dados.
- Nenhum segredo administrativo esta no repositorio.
- Existe rollback por feature flag.

## Fontes Oficiais Consultadas

- Firebase Web Setup: https://firebase.google.com/docs/web/setup
- Firebase Auth persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Firebase Local Emulator Suite: https://firebase.google.com/docs/emulator-suite
- Authentication Emulator: https://firebase.google.com/docs/emulator-suite/connect_auth

## Conclusao

Eu seguiria o plano original como norte, mas implementaria uma versao mais conservadora:

1. Preservar zero-build inicialmente.
2. Colocar Firebase atras de uma facade.
3. Migrar Auth antes dos dados.
4. Migrar dados por dominio, com repositories.
5. Tratar iframes como contextos separados que compartilham projeto/config, nao instancia JS.
6. Usar custom claims ou backend confiavel para admin real.
7. Manter local como cache/fallback ate a sincronizacao estar comprovada.

Essa rota combina melhor com o projeto atual e deixa espaco para integrar `japanese-study`, `finances` e futuros apps sem transformar o desktop em uma reescrita grande demais.
