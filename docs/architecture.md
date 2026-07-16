# Arquitetura do mathicx-file

Este documento descreve como o `mathicx-file` funciona por dentro. Ele complementa o [README principal](../README.md) e serve como referencia para evoluir o desktop virtual e integrar novas aplicacoes.

## Visao Geral

O projeto e um desktop virtual client-side. O navegador e o runtime da
aplicacao; LocalStorage e IndexedDB sustentam o modelo local-first, enquanto
Firebase Auth e Cloud Firestore fornecem identidade e sincronizacao opcionais
para contas aprovadas.

Nao existe servidor de aplicacao proprio, build step ou framework no host. A
aplicacao usa:

- HTML estatico como shell.
- CSS modular por area da interface.
- ES Modules nativos.
- Um kernel central para coordenar boot.
- Subsistemas independentes comunicando por event bus.
- Apps carregados sob demanda.
- Firebase App Check para proteger Authentication e Firestore.
- GitHub Actions para validar e montar o artefato estatico do Pages.

## Fluxo de Boot

```text
index.html
  |
  v
src/main.js
  |
  v
app.boot()
  |
  |-- db.open()
  |-- _hydrateState()
  |-- _authGate()
      |
      |-- restaurar sessao Firebase ou visitante
      |-- LoginScreen se nao houver sessao
      |-- validar whitelist para conta Firebase
      |-- _bootDesktop() apos autenticar ou entrar como visitante
          |
          |-- themeManager.init()
          |-- appRegistry.registerAll()
          |-- WindowManager.init()
          |-- Desktop.init()
          |-- Taskbar.init()
          |-- Launcher.init()
          |-- explorerProvider.seed()
          |-- _registerHotkeys()
          |-- _wireUsageTracking()
```

## Camadas

### Shell

Arquivo principal: `index.html`

Responsabilidades:

- Declarar fontes e folhas de estilo.
- Criar o ponto de montagem `#app`.
- Criar portais globais para toasts, menus de contexto e modais.
- Importar `src/main.js`.

### Kernel

Arquivo principal: `src/core/kernel.js`

Responsabilidades:

- Abrir IndexedDB.
- Hidratar estado inicial.
- Controlar o gate de autenticacao.
- Inicializar modulos na ordem correta.
- Registrar hotkeys globais.
- Ligar rastreamento de uso.
- Expor helper `app.launchApp(appId)`.

O kernel e um orquestrador. Regra de UI, regra de app e regra de storage ficam nos modulos especializados.

### Event Bus

Arquivo principal: `src/core/event-bus.js`

O event bus e um pub/sub simples:

```javascript
const unsubscribe = bus.on(EVT.WINDOW_OPEN, (payload) => {
  console.log(payload);
});

bus.emit(EVT.APP_LAUNCH, 'calculadora');
unsubscribe();
```

Ele reduz acoplamento entre:

- Desktop e WindowManager.
- Launcher e WindowManager.
- Taskbar e WindowManager.
- Explorer e busca global.
- AuthProvider e UI.
- Kernel e estatisticas.

### Store Reativo

Arquivo principal: `src/core/state.js`

O store guarda estado compartilhado por chave:

```javascript
store.set('theme', 'dark');
store.patch('usage', { calculadora: 3 });

store.subscribe('theme', ({ value, prev }) => {
  console.log(prev, value);
});
```

Estado hidratado no boot:

- `theme`
- `widgets`
- `widgetLayout`
- `shortcuts`
- `favorites`
- `recents`
- `usage`
- `pinned`
- `activity`

### Storage

Arquivos principais:

- `src/storage/local-storage.js`
- `src/storage/indexeddb.js`

LocalStorage e usado para preferencias e listas leves. IndexedDB guarda dados
estruturados. Chaves pessoais recebem escopo por UID; o visitante usa
`guest-local-v1` e nunca compartilha o namespace de uma conta.

Stores IndexedDB:

| Store | Key | Descricao |
| --- | --- | --- |
| `fs` | `id` | Filesystem virtual. |
| `widgets` | `id` | Estado de widgets. |
| `windows` | `id` | Estado reservado para janelas. |
| `kv` | `key` | Chave/valor generico. |
| `users` | `id` | Usuarios locais. |
| `sessions` | `key` | Sessoes autenticadas. |
| `stats` | `id` | Eventos de uso. |

### Identidade e Acesso

Arquivos principais:

- `src/auth/provider.js`
- `src/auth/login-screen.js`
- `src/auth/firebase-auth-provider.js`
- `src/auth/guest-session.js`
- `src/auth/guest-migration.js`

Fluxo:

```text
boot
  |
  |-- restaurar Firebase ou visitante
  |-- sem sessao -> LoginScreen
  |     |-- login/cadastro Firebase
  |     `-- entrar como visitante
  |-- Firebase -> validar accessStatus e claims
  |-- visitante -> aplicar guest-local-v1
  `-- iniciar desktop
```

Firebase Auth e a fonte de verdade. O perfil Firestore define `accessStatus` e
o papel administrativo confiavel vem de claims. O App Check protege chamadas
ao backend. O provider local baseado em Web Crypto permanece dormente somente
como legado controlado, sem participar do fluxo de producao.

O visitante nao cria usuario anonimo no Firebase: sua sessao e seus dados ficam
no navegador atual. A migracao posterior usa backup identificado, confirmacao e
snapshot preventivo da conta de destino.

### Desktop

Arquivos principais:

- `src/desktop/desktop.js`
- `src/desktop/shortcuts.js`
- `src/desktop/widgets.js`

Responsabilidades:

- Renderizar marca, relogio e data.
- Renderizar widgets.
- Renderizar atalhos.
- Permitir criar, editar, renomear, excluir e reordenar atalhos.
- Abrir dashboard.
- Alternar tema.

Atalhos emitem `EVT.APP_LAUNCH`; o Desktop nao abre janelas diretamente.

### Window Manager

Arquivos principais:

- `src/window-manager/manager.js`
- `src/window-manager/window.js`
- `src/window-manager/interactions.js`
- `src/window-manager/snap.js`

Responsabilidades:

- Criar e destruir janelas.
- Garantir uma janela por app.
- Controlar foco, z-index e cascata.
- Minimizar, restaurar e maximizar.
- Arrastar e redimensionar.
- Aplicar snap layouts.
- Carregar views de app por lazy import.
- Executar cleanup retornado pela view quando a janela fecha.

Fluxo de abertura:

```text
EVT.APP_LAUNCH
  |
  v
WindowManager.open(appId)
  |
  |-- appRegistry.get(appId)
  |-- calcula rect inicial
  |-- cria AppWindow
  |-- anexa interacoes
  |-- manifest.loader()
  |-- mount(host, context)
  `-- EVT.WINDOW_OPEN
```

### Launcher e Taskbar

Arquivos principais:

- `src/launcher/launcher.js`
- `src/launcher/taskbar.js`
- `src/launcher/search.js`
- `src/launcher/registry.js`

Launcher:

- Lista apps por categoria.
- Mantem favoritos.
- Faz busca global.
- Oculta app admin para usuarios comuns.
- Emite `EVT.APP_LAUNCH`.

Taskbar:

- Renderiza botao Menu.
- Renderiza apps abertos e fixados.
- Controla foco/minimizacao pelo botao da janela.
- Exibe relogio/data.
- Mostra avatar de usuario.
- Abre menu de perfil e logout.
- Exibe acesso admin quando aplicavel.

### Explorer

Arquivos principais:

- `src/explorer/fs-store.js`
- `src/explorer/explorer.js`
- `src/explorer/operations.js`
- `src/apps/arquivos/view.js`

O Explorer usa o store `fs` no IndexedDB. O modelo de no e:

```javascript
{
  id: 'doc_xxx',
  parentId: 'root',
  type: 'folder', // ou 'doc'
  name: 'Documento.txt',
  content: '',
  starred: false,
  createdAt: 0,
  updatedAt: 0
}
```

Operacoes principais:

- `seed()`
- `getChildren(parentId)`
- `create()`
- `rename()`
- `update()`
- `remove()`
- `duplicate()`
- `move()`
- `copy()`
- `toggleStar()`
- `search(query)`

Toda mutacao emite `EVT.FS_CHANGE`, permitindo refresh do explorer e da busca global.

## Modelo de Apps

### App Interno

Um app interno mora em `src/apps/<app-id>` e compartilha o runtime do host.

```text
src/apps/calculadora/
|-- manifest.js
`-- view.js
```

Contrato do manifesto:

```javascript
export default {
  id: 'calculadora',
  name: 'Calculadora',
  icon: '...',
  category: 'ferramenta',
  description: '...',
  defaultSize: { width: 340, height: 520 },
  resizable: true,
  loader: () => import('./view.js'),
};
```

Contrato da view:

```javascript
export function mount(host, { win, wm, bus }) {
  host.innerHTML = '...';

  return () => {
    // cleanup
  };
}
```

Use app interno quando precisar de integracao profunda com o host.

### App Externo via Iframe

Um app externo tem dois lados:

```text
Applications/<app-id>/       # app real
src/apps/<app-id>/           # wrapper do host
```

O wrapper cria um iframe para `Applications/<app-id>/index.html`.

Vantagens:

- Isolamento de CSS e JS.
- Desenvolvimento independente.
- Pode usar dependencias proprias.
- Facilita integrar projetos ja existentes.
- Reduz risco de conflito com o desktop virtual.

Desvantagens:

- Comunicacao com o host exige `postMessage`.
- Nao ha acesso direto ao DOM do host.
- Permissoes dependem de `sandbox`.

Japanese Study e Finances usam esse modelo. Novos apps devem partir do kit em
`templates/integrated-app`, que acrescenta contrato de dados, tema e escopo.

## Comunicacao Host-App

Apps internos recebem contexto diretamente no `mount`.

Apps externos devem usar `postMessage` quando precisarem conversar com o host:

```javascript
// iframe -> host
window.parent.postMessage({
  type: 'japanese-study:progress',
  payload: { lessonId: 'kana-01', done: true },
}, '*');
```

No wrapper do host:

```javascript
function onMessage(event) {
  if (event.data?.type !== 'japanese-study:progress') return;
  // validar payload e reagir
}

window.addEventListener('message', onMessage);

return () => {
  window.removeEventListener('message', onMessage);
};
```

Wrappers atuais validam `origin`, `source` e payload. Tokens Firebase nunca
trafegam por esse canal.

## Temas

O tema e controlado por `src/themes/theme-manager.js` e tokens CSS em `styles/tokens.css`.

O estado do tema e persistido em `prefs.theme`.

Fluxo:

```text
themeManager.cycle()
  |
  |-- atualiza atributo/data-theme
  |-- store.set('theme', next)
  `-- EVT.THEME_CHANGE
```

## Atividade e Diagnostico

O kernel registra atividade no escopo do usuario atual. O diagnostico operacional
da Central agrega somente estado tecnico sanitizado, versoes e falhas curtas:

- `WINDOW_OPEN` registra `app_open`.
- `WINDOW_CLOSE` registra `app_close` com duracao.
- `login()` registra `login`.
- `logout()` registra `logout`.

Dados de uma conta ou visitante nao sao compartilhados com outro escopo local.

## Extensibilidade Recomendada

Para novos apps:

1. Use `templates/integrated-app` se o app e independente.
2. Use app interno se precisa de acesso ao host.
3. Mantenha manifesto pequeno e descritivo.
4. Retorne cleanup em toda view.
5. Use categorias existentes para manter launcher organizado.
6. Declare contrato de sync/backup e isolamento no manifesto integrado.
7. Documente dependencias do app externo no README proprio do app.

Para evoluir o host:

1. Evite colocar regras novas no kernel.
2. Prefira criar providers dedicados quando houver estado/dados.
3. Adicione eventos ao `EVT` antes de usar strings soltas.
4. Persistencia estruturada deve ir para IndexedDB.
5. Preferencias leves podem ficar em LocalStorage.

## Riscos e Pontos de Atencao

- Firebase config publica nao e segredo; seguranca depende de Auth, App Check,
  claims e Firestore Rules.
- Dados locais podem ser apagados pelo usuario/navegador.
- Web Crypto API exige contexto seguro fora de `localhost`.
- Apps externos com CDNs podem falhar offline.
- Iframes precisam de sandbox bem escolhido para equilibrar compatibilidade e seguranca.
- O registry exige importar um manifesto novo, mas Central e backup descobrem
  capacidades automaticamente.

## Gates Futuros

As Fases 0 a 18 concluiram testes automatizados, backup global, PWA, Firebase e
contrato multi-app. Mudancas de infraestrutura agora dependem dos gates
`dictionary:assess-infrastructure` e `firebase:assess-sync`. Novos aplicativos
ou uma Fase 19 exigem prioridade e escopo aprovados antes de alterar o kernel.
