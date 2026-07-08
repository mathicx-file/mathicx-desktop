# Fase 0: Auditoria Firebase do Mathicx-File

> Escopo: contexto e baseline antes da implementacao Firebase.
>
> Data: 2026-07-04
>
> Resultado esperado da fase: nenhum codigo de producao alterado.

## 1. Resumo executivo

O projeto esta pronto para iniciar a migracao por uma camada de facade/feature flags, mas a identidade atual ainda esta profundamente baseada no `authProvider` local. O kernel bloqueia a inicializacao do desktop ate restaurar ou criar uma sessao local, e varios modulos consultam diretamente `authProvider.getCurrentUser()` ou `authProvider.isAdmin()`.

O caminho mais seguro para a Fase 1 e preparar infraestrutura Firebase desligada por padrao, sem trocar ainda o gate principal. A troca real de identidade deve acontecer somente depois de existir um provider Firebase compativel com a API atual.

## 2. Baseline comprovado

### Runtime e entrada

- O host e zero-build: `index.html` importa apenas `src/main.js`, e `src/main.js` chama `app.boot()`.
- O README confirma HTML/CSS/JavaScript nativo, ES Modules, sem bundler e sem dependencias de runtime.
- O kernel e o orquestrador central e executa: abrir IndexedDB, hidratar estado local, rodar auth gate, depois iniciar desktop, registry, window manager, taskbar, launcher e explorer.

Evidencias:

- `src/main.js` importa `./core/kernel.js` e chama `app.boot()`.
- `src/core/kernel.js:49` chama `_hydrateState()`.
- `src/core/kernel.js:52` chama `_authGate()`.
- `src/core/kernel.js:57` chama `authProvider.restoreSession()`.
- `src/core/kernel.js:79` chama `appRegistry.registerAll()`.

### Autenticacao atual

O provider atual e totalmente local:

- usuarios, sessoes e estatisticas ficam no IndexedDB;
- senha e derivada via PBKDF2/Web Crypto;
- o primeiro usuario e admin;
- usuarios comuns podem ficar pendentes;
- sessoes tem TTL de 7 dias;
- o papel admin e um campo editavel pelo admin local.

Evidencias:

- `src/auth/provider.js:56` implementa `register()`.
- `src/auth/provider.js:90` implementa `login()`.
- `src/auth/provider.js:117` grava `store.set('session', ...)`.
- `src/auth/provider.js:126` implementa `logout()`.
- `src/auth/provider.js:145` implementa `restoreSession()`.
- `src/auth/provider.js:190` implementa `setPerfil()`.
- `src/auth/crypto.js` usa PBKDF2 com Web Crypto.

### Storage atual

IndexedDB:

- banco: `mathicx-file`;
- versao atual: 2;
- stores: `fs`, `widgets`, `windows`, `kv`, `users`, `sessions`, `stats`.

LocalStorage:

- prefixo: `mathicx:`;
- usado para preferencias leves, favoritos, recentes, uso, fixados, activity log, notas e widgets simples.

Evidencias:

- `src/storage/indexeddb.js` define `DB_NAME = 'mathicx-file'` e `DB_VERSION = 2`.
- `src/storage/indexeddb.js` define stores `users`, `sessions` e `stats`.
- `src/storage/local-storage.js` define prefixo `mathicx:`.
- `src/core/kernel.js:166` le `prefs`.
- `src/core/kernel.js:172` a `src/core/kernel.js:176` le `favorites`, `recents`, `usage`, `pinned` e `activity`.
- `src/core/kernel.js:182` persiste `prefs`.
- `src/core/kernel.js:193` persiste `favorites`, `recents`, `usage` e `pinned`.

### Dados de produto existentes

Dados pessoais ou sincronizaveis mapeados:

- `users`: identidade local, perfil, status, senha hash, salt, ultimo acesso.
- `sessions`: sessao local, expiracao, duracao.
- `stats`: login/logout, app open/app close.
- `fs`: filesystem virtual do explorer.
- `prefs`: tema, widgets, layout de widgets e atalhos.
- `favorites`, `recents`, `usage`, `pinned`, `activity`: dados leves do desktop.
- `widget-notes`, `widget-tasks`: widgets locais.
- `notepad`: app Notas.

Dados que nao devem ser migrados primeiro:

- senha/hash local;
- todo o explorer;
- estatisticas historicas sem uma politica clara;
- dados de apps externos sem contrato proprio.

### Admin local

O admin atual e uma permissao local, baseada em `user.perfil === 'admin'`.

Consequencias para Firebase:

- o painel admin atual nao deve ser considerado admin remoto;
- `setPerfil()` nao pode virar custom claim client-side;
- qualquer admin real em Firebase deve usar custom claims em ambiente confiavel;
- durante as primeiras fases, a UI admin pode continuar local ou ser desabilitada no modo Firebase.

Evidencias:

- `src/apps/admin/view.js` bloqueia acesso se `user.perfil !== 'admin'`.
- `src/launcher/launcher.js` oculta app `admin` quando `authProvider.isAdmin()` e falso.
- `src/launcher/taskbar.js` mostra botao admin conforme `u?.perfil === 'admin'`.

## 3. Fluxos principais

### Boot atual

```text
index.html
  -> src/main.js
  -> app.boot()
  -> db.open()
  -> _hydrateState()
  -> authProvider.restoreSession()
  -> se autenticado: _bootDesktop()
  -> se nao autenticado: LoginScreen
```

Invariante atual: o desktop nao inicia sem uma sessao local restaurada ou login/setup concluido.

### Login local

```text
LoginScreen
  -> authProvider.login(login, senha)
  -> findByLogin()
  -> verifyPassword()
  -> grava users/sessions/stats
  -> store.set('session')
  -> emite USER_LOGIN e AUTH_CHANGE
  -> kernel chama _bootDesktop()
```

### Logout atual

```text
Taskbar ou Configuracoes
  -> authProvider.logout()
  -> store.set('session', null)
  -> emite USER_LOGOUT e AUTH_CHANGE
  -> location.reload()
```

Observacao: o reload e parte importante do isolamento atual. Sem reload, varios modulos continuariam montados em memoria. Na migracao Firebase, logout/troca de usuario precisa fechar ou resetar janelas, iframes e caches de usuario antes de depender de uma experiencia sem reload.

## 4. Pontos de acoplamento relevantes

| Area | Acoplamento atual | Implicacao para Firebase |
| --- | --- | --- |
| Kernel | chama diretamente `authProvider.restoreSession()` | provider Firebase precisa manter contrato equivalente |
| LoginScreen | chama `hasUsers`, `register`, `login` | tela precisara aceitar modo Firebase sem fluxo de primeiro admin local |
| Taskbar | consulta usuario atual e admin | `getCurrentUser()` deve normalizar usuario Firebase |
| Launcher | esconde admin por `isAdmin()` | admin remoto deve vir de custom claim ou continuar desabilitado |
| Admin app | lista/edita usuarios locais | nao migrar como painel remoto na primeira entrega |
| Stats | kernel chama metodo interno `_logStat()` | criar API publica antes de sincronizar estatisticas |
| Logout | depende de `location.reload()` | planejar limpeza explicita antes de remover reload |
| LocalStorage | varios slices persistem automaticamente | separar preferencias globais de preferencias por usuario |

## 5. Lacunas antes da Fase 1

- Nao existe `src/firebase/`.
- Nao existe `firebase.json`.
- Nao existe `firestore.rules`.
- Nao existe `firestore.indexes.json`.
- Nao existe provider Firebase paralelo.
- Nao existe camada de feature flags.
- `.gitignore` ja ignora `src/firebase/firebase-config.local.js` e `src/firebase/*.local.js`, o que combina com a configuracao local planejada.

## 6. Riscos de migracao

1. **Troca de identidade sem limpar estado**
   - Risco: dados do usuario anterior continuarem em janelas, iframes, store ou caches.
   - Evidencia: logout atual usa reload para limpar a aplicacao.

2. **Admin local confundido com admin remoto**
   - Risco: uma UI client-side editar permissao remota.
   - Mitigacao: custom claims somente por script/ambiente confiavel, e admin app fora da primeira entrega Firebase.

3. **Sessoes locais e Firebase Auth coexistindo sem regra clara**
   - Risco: desktop acreditar em IndexedDB enquanto Firestore usa outro UID.
   - Mitigacao: em `authMode: 'firebase'`, somente Firebase Auth decide identidade.

4. **Persistencia leve global virar vazamento entre usuarios**
   - Risco: `favorites`, `recents`, `pinned`, `notepad` e widgets serem compartilhados no mesmo navegador entre contas.
   - Mitigacao: namespace por UID ou importacao consciente para `users/{uid}`.

5. **Uso de metodos internos**
   - Risco: `_logStat()` virar dependencia da arquitetura Firebase.
   - Mitigacao: criar metodo publico para eventos de uso antes de sincronizar estatisticas.

## 7. Recomendacao para Fase 1

Implementar apenas infraestrutura desligada por flags:

- `src/firebase/firebase-config.example.js`;
- `src/firebase/firebase-config.local.js` ignorado pelo Git;
- `src/firebase/firebase-config.prod.js` como placeholder ou gerado futuramente;
- `src/firebase/firebase-client.js`;
- `src/firebase/firebase-emulators.js`;
- `src/firebase/firestore-paths.js`;
- `src/firebase/feature-flags.js`;
- `firebase.json`;
- `firestore.rules`;
- `firestore.indexes.json`.

Nao alterar ainda:

- gate principal do kernel;
- `authProvider` local;
- `LoginScreen`;
- painel admin;
- dados do explorer;
- integracao do Japanese Study.

## 8. Criterio de aceite da Fase 0

- Este documento existe.
- O baseline do auth/storage/kernel esta registrado.
- As lacunas para Fase 1 estao claras.
- Nenhum arquivo de producao foi alterado nesta fase.
