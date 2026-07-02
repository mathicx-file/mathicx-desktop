# Arquitetura do mathicx-file

Este documento descreve como o `mathicx-file` funciona por dentro. Ele complementa o [README principal](../README.md) e serve como referencia para evoluir o desktop virtual e integrar novas aplicacoes.

## Visao Geral

O projeto e um desktop virtual 100% client-side. O navegador e o runtime da aplicacao, e todos os dados locais ficam no proprio navegador via LocalStorage e IndexedDB.

Nao existe backend, build step ou framework no host. A aplicacao usa:

- HTML estatico como shell.
- CSS modular por area da interface.
- ES Modules nativos.
- Um kernel central para coordenar boot.
- Subsistemas independentes comunicando por event bus.
- Apps carregados sob demanda.

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
      |-- authProvider.restoreSession()
      |-- LoginScreen se nao houver sessao
      |-- _bootDesktop() apos autenticar
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

LocalStorage e usado para preferencias e listas leves. IndexedDB guarda dados estruturados.

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

### Autenticacao

Arquivos principais:

- `src/auth/crypto.js`
- `src/auth/provider.js`
- `src/auth/login-screen.js`

Fluxo:

```text
boot
  |
  |-- restoreSession()
  |     |-- sessao valida -> desktop
  |     `-- sem sessao -> LoginScreen
  |
  |-- primeiro uso -> criar admin
  |-- login valido -> desktop
  `-- novo usuario -> status pendente
```

O `AuthProvider` gerencia:

- Cadastro.
- Login.
- Logout.
- Restauracao de sessao.
- Usuarios pendentes.
- Promocao/rebaixamento de perfil.
- Bloqueio/aprovacao.
- Estatisticas de login e uso de apps.

Senhas usam PBKDF2 via Web Crypto API com salt por usuario.

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

Para integrar projetos como `japanese-study`, o modelo externo via iframe tende a ser o melhor ponto de partida.

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

Em producao, troque `'*'` por uma validacao de origem sempre que possivel.

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

## Estatisticas de Uso

O kernel conecta eventos de janelas ao `AuthProvider`:

- `WINDOW_OPEN` registra `app_open`.
- `WINDOW_CLOSE` registra `app_close` com duracao.
- `login()` registra `login`.
- `logout()` registra `logout`.

Esses eventos alimentam o Painel Admin.

## Extensibilidade Recomendada

Para novos apps:

1. Use iframe se o app e independente.
2. Use app interno se precisa de acesso ao host.
3. Mantenha manifesto pequeno e descritivo.
4. Retorne cleanup em toda view.
5. Use categorias existentes para manter launcher organizado.
6. Documente dependencias do app externo no README proprio do app.

Para evoluir o host:

1. Evite colocar regras novas no kernel.
2. Prefira criar providers dedicados quando houver estado/dados.
3. Adicione eventos ao `EVT` antes de usar strings soltas.
4. Persistencia estruturada deve ir para IndexedDB.
5. Preferencias leves podem ficar em LocalStorage.

## Riscos e Pontos de Atencao

- Autenticacao client-side nao equivale a seguranca de backend.
- Dados locais podem ser apagados pelo usuario/navegador.
- Web Crypto API exige contexto seguro fora de `localhost`.
- Apps externos com CDNs podem falhar offline.
- Iframes precisam de sandbox bem escolhido para equilibrar compatibilidade e seguranca.
- O registry atual exige import manual para cada app.

## Melhorias Futuras

- Testes automatizados para o host.
- Export/import global de dados locais.
- Registro dinamico de apps.
- PWA com cache offline.
- Backend opcional para sincronizacao.
- Canal padronizado de `postMessage` para apps externos.
- Documentacao especifica para criacao de apps internos.
