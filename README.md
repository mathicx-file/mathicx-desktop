# mathicx-file

`mathicx-file` e um desktop virtual no navegador para organizar ferramentas pessoais, arquivos locais e aplicacoes independentes em uma unica interface. Ele funciona como um mini sistema operacional web: tem login, area de trabalho, menu iniciar, barra de tarefas, janelas redimensionaveis, widgets, explorador de arquivos virtual e um modelo simples para plugar novos apps.

O projeto foi construido com HTML, CSS e JavaScript nativo usando ES Modules. Nao ha bundler, framework, instalacao de dependencias ou etapa de build.

## Indice

- [Funcionalidades](#funcionalidades)
- [Stack](#stack)
- [Como Executar](#como-executar)
- [Primeiro Acesso](#primeiro-acesso)
- [Arquitetura](#arquitetura)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Aplicacoes Incluidas](#aplicacoes-incluidas)
- [Como Adicionar Novas Aplicacoes](#como-adicionar-novas-aplicacoes)
- [Autenticacao e Dados Locais](#autenticacao-e-dados-locais)
- [Atalhos de Teclado](#atalhos-de-teclado)
- [Desenvolvimento](#desenvolvimento)
- [Testes e Validacao](#testes-e-validacao)
- [Deploy](#deploy)
- [Troubleshooting](#troubleshooting)
- [Documentacao](#documentacao)

## Funcionalidades

- Desktop virtual com atalhos, widgets, dashboard e menu de contexto.
- Sistema de janelas com abrir, focar, minimizar, maximizar, restaurar, fechar, arrastar, redimensionar e snap layouts.
- Launcher com busca global por apps, categorias, pastas e documentos.
- Taskbar com menu iniciar, apps abertos, apps fixados, relogio, perfil de usuario, tema e atalho para dashboard.
- Autenticacao Firebase com usuarios pendentes/aprovados, login, logout, sessao persistida e painel administrativo legado para modo local.
- Explorador de arquivos virtual persistido em IndexedDB, com pastas, documentos, favoritos, duplicacao, busca e operacoes de CRUD.
- Temas claro e escuro, persistidos no navegador.
- Persistencia local via LocalStorage e IndexedDB.
- Apps internos carregados sob demanda com `import()`.
- Apps externos isolados por iframe dentro de `Applications/`, incluindo `japanese-study`.
- Sincronizacao Firebase local-first para desktop e Japanese Study, com dados separados por UID.

## Stack

| Camada | Tecnologia |
| --- | --- |
| Linguagem | JavaScript nativo |
| UI | HTML5, CSS3, ES Modules |
| Estado | Store reativo proprio em `src/core/state.js` |
| Comunicacao | Event bus proprio em `src/core/event-bus.js` |
| Persistencia leve | LocalStorage |
| Persistencia estruturada | IndexedDB |
| Autenticacao | Firebase Auth, com provider local legado baseado em Web Crypto API + IndexedDB |
| Apps internos | Modulos em `src/apps/<app-id>` |
| Apps externos | Iframe apontando para `Applications/<app-id>/index.html` |
| Build | Nenhum |
| Dependencias do host | Nenhuma |

## Como Executar

ES Modules precisam ser servidos por HTTP. Evite abrir `index.html` direto via `file://`.

```bash
# Na raiz do projeto
python -m http.server 8080
```

Abra:

```text
http://localhost:8080
```

Outras opcoes:

```bash
npx serve .
php -S localhost:8080
```

Tambem funciona com extensoes como Live Server no VS Code.

## Primeiro Acesso

Na primeira execucao, como ainda nao existem usuarios no IndexedDB, a aplicacao exibe o fluxo de setup para criar o primeiro administrador.

Depois disso:

1. Faca login com o usuario criado.
2. Abra o menu iniciar pelo botao `Menu` ou pelo atalho `Win/Cmd + E`.
3. Abra apps pelo launcher, por atalhos no desktop ou pela taskbar.
4. Use o app `Configuracoes` para revisar preferencias e dados locais.
5. Se estiver logado como admin, use o botao de admin na taskbar ou abra o app `Painel Admin`.

Os dados ficam no navegador atual. Limpar dados do site, trocar de navegador ou usar modo anonimo afeta usuarios, sessao, arquivos e preferencias.

## Arquitetura

O `index.html` e propositalmente pequeno. Ele carrega CSS global, cria portais compartilhados e importa apenas `src/main.js`.

```text
index.html
  -> src/main.js
    -> app.boot()
      -> IndexedDB + hidratacao do store
      -> auth gate
      -> tema
      -> app registry
      -> window manager
      -> desktop + widgets
      -> taskbar + launcher
      -> explorer provider
      -> atalhos globais
```

O kernel em `src/core/kernel.js` e o orquestrador. Ele nao concentra regras de interface; apenas inicializa subsistemas na ordem correta e liga eventos globais.

Principais decisoes de arquitetura:

- `EventBus`: desacopla desktop, launcher, taskbar, janelas, explorer e autenticacao.
- `Store`: estado compartilhado com subscribers por chave.
- `AppRegistry`: catalogo central dos apps disponiveis.
- `WindowManager`: cria janelas, calcula posicao, gerencia foco e carrega views sob demanda.
- `IndexedDBAdapter`: facade promise-based para stores estruturados.
- `AuthProvider`: cadastro, login, sessoes, permissoes e estatisticas de uso.
- `ExplorerProvider`: filesystem virtual persistido em IndexedDB.

Leia a visao tecnica completa em [docs/architecture.md](docs/architecture.md).

## Estrutura do Projeto

```text
mathicx-file/
|-- index.html
|-- README.md
|-- Applications/
|   `-- finances/              # App externo integrado via iframe
|-- docs/
|   |-- README.md              # Indice da documentacao
|   |-- architecture.md        # Arquitetura do host
|   |-- app-integration.md     # Guia para integrar apps via iframe
|   |-- firebase-migration/     # Documentos de planejamento da migracao Firebase
|   |-- archive/               # Documentos historicos/legado
|   |-- templates/             # Templates para novos apps externos
|   `-- scripts/
|-- src/
|   |-- main.js                # Bootstrap
|   |-- core/                  # Kernel, event bus, store, atalhos e utils
|   |-- auth/                  # Login, provider e crypto
|   |-- storage/               # LocalStorage e IndexedDB
|   |-- themes/                # Gerenciador de tema
|   |-- ui/                    # Toasts, modais, menus e componentes
|   |-- desktop/               # Desktop, atalhos e widgets
|   |-- launcher/              # Launcher, busca, taskbar e favoritos/fixados
|   |-- window-manager/        # Janelas, snap e interacoes
|   |-- explorer/              # Filesystem virtual
|   `-- apps/                  # Apps nativos e wrappers de apps externos
`-- styles/                    # Tokens, base, desktop, janelas, launcher e taskbar
```

## Aplicacoes Incluidas

| App | Tipo | Descricao |
| --- | --- | --- |
| `calculadora` | Interno | Calculadora simples carregada como modulo nativo. |
| `notas` | Interno | Bloco de notas com auto-save local. |
| `arquivos` | Interno | Interface para o filesystem virtual em IndexedDB. |
| `formularios` | Interno | Central/reserva para atalhos e formularios. |
| `configuracoes` | Interno | Preferencias, perfil, tema e dados do sistema. |
| `admin` | Interno | Painel administrativo para usuarios e estatisticas. |
| `finanças` | Externo via iframe | App de financas pessoais localizado em `Applications/finances`. |

## Como Adicionar Novas Aplicacoes

Existem dois caminhos.

### 1. App interno

Use quando o app precisa conversar diretamente com o host, usar `bus`, `store`, `wm`, componentes internos ou APIs do explorer.

Crie:

```text
src/apps/meu-app/
|-- manifest.js
`-- view.js
```

Exemplo de manifesto:

```javascript
export default {
  id: 'meu-app',
  name: 'Meu App',
  icon: 'M',
  category: 'ferramenta',
  description: 'Descricao curta do app.',
  defaultSize: { width: 800, height: 600 },
  resizable: true,
  loader: () => import('./view.js'),
};
```

Exemplo de view:

```javascript
export function mount(host, { win, wm, bus }) {
  host.innerHTML = '<div class="my-app">Ola do meu app</div>';

  return () => {
    // Remova listeners, timers e recursos aqui.
  };
}
```

Depois registre em `src/apps/registry.js`:

```javascript
import meuApp from './meu-app/manifest.js';

registerAll() {
  [calculadora, notas, arquivos, formularios, configuracoes, finanças, admin, meuApp]
    .forEach((manifest) => this.register(manifest));
}
```

### 2. App externo via iframe

Use quando o app deve continuar independente, com HTML/CSS/JS proprios ou ate outro framework. Este e o caminho recomendado para projetos desenvolvidos separadamente, como `japanese-study`.

Estrutura:

```text
Applications/japanese-study/
|-- index.html
|-- css/
|-- js/
`-- assets/

src/apps/japanese-study/
|-- manifest.js
`-- view.js
```

O `view.js` do host cria um iframe apontando para:

```text
Applications/japanese-study/index.html
```

Templates prontos ficam em [docs/templates](docs/templates). O passo a passo completo esta em [docs/app-integration.md](docs/app-integration.md).

## Autenticacao e Dados Locais

A autenticacao atual usa Firebase Auth quando `authMode === "firebase"`.

- Novas contas entram como pendentes no Firestore.
- O acesso ao desktop depende de `accessStatus: "approved"` no perfil do usuario.
- A tela de login possui `Lembre de mim`, salvando apenas o e-mail/usuario no navegador.
- Dados sincronizados do desktop e dos apps seguem o modelo `users/{uid}/...`.
- O provider local continua no codigo como legado/desenvolvimento e fallback controlado por feature flag.

No modo local legado:

- Senhas sao derivadas com PBKDF2 via Web Crypto API.
- Usuarios, sessoes e estatisticas ficam em IndexedDB.
- A sessao atual tambem e refletida no store reativo.
- O primeiro usuario criado vira administrador.
- Novos usuarios comuns ficam pendentes ate aprovacao de um admin.
- O painel admin permite acompanhar usuarios, acessos e uso de apps.

Stores do IndexedDB:

| Store | Uso |
| --- | --- |
| `fs` | Pastas e documentos do explorer. |
| `widgets` | Estado/layout de widgets. |
| `windows` | Estado reservado para janelas. |
| `kv` | Chave/valor generico. |
| `users` | Usuarios locais. |
| `sessions` | Sessoes de login. |
| `stats` | Eventos de uso, login/logout e abertura/fechamento de apps. |

Observacao importante: isso protege o fluxo local da aplicacao, mas nao substitui autenticacao de servidor para dados sensiveis sincronizados em nuvem.

## Atalhos de Teclado

| Atalho | Acao |
| --- | --- |
| `Win/Cmd + E` | Abrir ou fechar o launcher. |
| `Win/Cmd + L` | Alternar tema. |
| `Win/Cmd + D` | Abrir ou fechar o dashboard. |
| `Win/Cmd + W` | Fechar a janela focada. |
| `Win/Cmd + Shift + Z` | Abrir snap layouts da janela focada. |
| `Esc` | Fechar o launcher. |

## Desenvolvimento

### Principios do codigo

- Mantenha apps lazy-loaded por `manifest.loader()`.
- Prefira event delegation em containers.
- Use `bus.emit()` para comunicacao entre modulos.
- Use `store.set()` ou `store.patch()` para estado compartilhado.
- Sempre retorne cleanup em views que criam listeners, timers, iframes ou observers.
- Evite dependencias no host. Apps externos podem ter suas proprias dependencias dentro de `Applications/<app-id>`.

### Categorias de app

As categorias ficam em `src/apps/registry.js`:

```text
pessoal
trabalho
ferramenta
sistema
midia
```

### Eventos centrais

Eventos ficam catalogados em `EVT` dentro de `src/core/event-bus.js`, incluindo:

- `window:*` para ciclo de vida de janelas.
- `launcher:*` para menu iniciar.
- `app:launch` e `app:installed`.
- `shortcut:*` para atalhos do desktop.
- `fs:change` para filesystem virtual.
- `auth:*` e `user:*` para autenticacao.
- `activity:log` e `notification`.

## Testes e Validacao

O host ainda nao possui suite automatizada propria. A validacao recomendada hoje e manual:

1. Iniciar servidor local.
2. Criar primeiro admin.
3. Fazer logout e login.
4. Abrir todos os apps pelo launcher.
5. Testar minimizar, maximizar, snap e fechamento de janelas.
6. Criar, renomear e excluir item no explorer.
7. Alternar tema.
8. Criar um usuario comum e aprovar pelo painel admin.
9. Integrar um app externo de teste usando os templates.

O app externo `Applications/finances` possui testes Node proprios:

```bash
cd Applications/finances
node test/smoke.js
node test/functional.js
```

## Deploy

Como o host e estatico, ele pode ser publicado em qualquer servidor de arquivos estaticos:

- GitHub Pages
- Netlify
- Vercel
- Cloudflare Pages
- Nginx/Apache
- Qualquer bucket ou CDN que sirva HTML, CSS e JS

Recomendacoes:

- Publique via HTTPS para garantir suporte completo a Web Crypto API fora de `localhost`.
- Preserve a estrutura de pastas, principalmente `src/`, `styles/`, `docs/` e `Applications/`.
- Evite reescritas de URL que quebrem caminhos relativos de iframes.
- Se usar apps externos com CDNs proprios, valide politica de CSP e conectividade.

## Troubleshooting

| Problema | Causa provavel | Solucao |
| --- | --- | --- |
| Tela nao carrega ao abrir `index.html` | ES Modules bloqueados em `file://` | Rode `python -m http.server 8080`. |
| Login/setup falha em navegador antigo | Web Crypto ou IndexedDB indisponivel | Use Chrome, Edge, Firefox ou Safari atual. |
| Dados sumiram | Dados do site foram limpos ou outro navegador foi usado | Verifique armazenamento do navegador e perfil usado. |
| App externo aparece em branco | Caminho do iframe errado ou `index.html` ausente | Confira `Applications/<app-id>/index.html` e o wrapper `view.js`. |
| App nao aparece no launcher | Nao foi registrado | Importe o manifesto e inclua no `registerAll()` de `src/apps/registry.js`. |
| Mudanca nao aparece | Cache do navegador | Use `Ctrl+Shift+R` ou limpe dados do site em desenvolvimento. |
| Web Crypto indisponivel | Origem nao segura | Use `localhost` ou HTTPS. |

## Documentacao

- [docs/README.md](docs/README.md): indice geral da documentacao.
- [docs/architecture.md](docs/architecture.md): arquitetura do desktop virtual.
- [docs/firebase-migration/firebase-migration.md](docs/firebase-migration/firebase-migration.md): proposta atual para migrar identidade e dados para Firebase.
- [docs/app-integration.md](docs/app-integration.md): guia detalhado para integrar apps via iframe.
- [docs/archive/local-auth-legacy.md](docs/archive/local-auth-legacy.md): resumo da autenticacao local legada.
- [Applications/finances/README.md](Applications/finances/README.md): documentacao do app de financas.

## Roadmap Sugerido

- Evoluir a observabilidade do Firebase com detalhes do ultimo sync, reconciliacao entre dispositivos e sincronizacao manual.
- Aprofundar a integracao do `japanese-study` com widgets, deep links e busca global.
- Criar uma suite de testes automatizados para o host alem dos testes de rules e do app Japanese Study.
- Adicionar export/import global dos dados do desktop.
- Evoluir para PWA com cache offline.
- Criar manifestos dinamicos para reduzir edicoes manuais no registry.
- Expandir sincronizacao opcional para futuros apps em `users/{uid}/apps/{appId}`.
