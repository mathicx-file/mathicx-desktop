# Fase 9: Padrao de integracao para novos apps

> Data: 2026-07-09
>
> Status: concluida no commit `c342463`
>
> Objetivo: transformar o aprendizado da integracao do Japanese Study em um padrao reutilizavel para proximos apps.

## Escopo

A Fase 9 prepara o Mathicx-File para receber novas aplicacoes integradas com menos retrabalho.

O primeiro recorte implementado nesta fase e de padronizacao:

- documentar responsabilidades entre host e app;
- criar uma ponte reutilizavel para apps em iframe;
- manter o Japanese Study como referencia funcional;
- validar o padrao com isolamento e sincronizacao do `finances`.

## Responsabilidades do Host

O Mathicx-File deve cuidar de:

- registro do app em `src/apps/registry.js`;
- manifest em `src/apps/{appId}/manifest.js`;
- wrapper em `src/apps/{appId}/view.js`;
- criacao e cleanup do iframe;
- envio de tema para o iframe;
- envio de acoes via `EVT.APP_ACTION`;
- abertura/reuso de janela pelo `WindowManager`;
- integracao opcional com launcher e widgets;
- sync de preferencias do desktop por usuario.

## Responsabilidades do App Integrado

Cada app dentro de `Applications/{appId}` deve cuidar de:

- renderizar a propria interface;
- manter busca interna e fluxos especializados;
- receber mensagens do host quando fizer sentido;
- isolar dados por usuario quando houver Firebase;
- expor backup/sync proprio quando necessario;
- validar seus dados e manter testes locais.

## Padrao de Mensagens

Host para iframe:

```js
{ type: 'theme', payload: 'dark' }
{ type: 'navigate', payload: { view: 'dictionary' } }
{ type: 'refresh' }
{ type: 'focus' }
```

Iframe para host, quando necessario:

```js
window.parent.postMessage({
  type: 'app:event',
  payload: { appId: 'meu-app', event: 'updated' }
}, window.location.origin);
```

## Padrao Firebase

Para apps com dados remotos, usar:

```text
users/{uid}/apps/{appId}/...
```

Exemplos:

```text
users/{uid}/apps/japanese-study/settings/main
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/finances/settings/main
users/{uid}/apps/finances/transactions/{transactionId}
```

Regras gerais:

- dados pessoais devem ficar abaixo de `users/{uid}`;
- o usuario so acessa os proprios documentos;
- dados publicos ou catalogos compartilhados devem usar colecoes separadas, como `publicData` ou `publicAppCatalog`;
- cada app deve ter um documento de settings principal quando houver preferencias remotas.

## Helper Criado

Foi criado o helper:

```text
src/apps/integration/iframe-app.js
```

API inicial:

```js
import { mountIframeApp } from '../integration/iframe-app.js';

export function mount(host, context = {}) {
  return mountIframeApp(host, {
    appId: 'meu-app',
    appPath: './Applications/meu-app/index.html',
    title: 'Meu App',
    className: 'mxc-meu-app',
    styleId: 'mxc-meu-app-style',
    loadingText: 'Carregando Meu App...',
    errorText: 'Meu App nao pode ser carregado.',
    context,
    actionType: 'navigate',
  });
}
```

O helper cobre:

- container e spinner padrao;
- sandbox do iframe;
- atributos de performance;
- envio automatico de tema;
- reenvio de tema no `EVT.THEME_CHANGE`;
- envio de payload inicial da janela;
- reacao a `EVT.APP_ACTION`;
- mensagens basicas `theme`, `refresh` e `focus`;
- tela de erro;
- cleanup do iframe.

## Aplicado Nesta Etapa

O wrapper do Japanese Study foi refatorado para usar `mountIframeApp`.

Comportamentos preservados:

- app abre em iframe;
- recebe tema claro/escuro;
- recebe `navigate` quando aberto pelo launcher/widget;
- reusa janela existente;
- limpa iframe no fechamento.

## Ajuste de Isolamento do Desktop

Durante a revisao da Fase 9 foi identificado que o Dashboard do Mathicx-File ainda usava chaves globais de `localStorage` para dados locais leves:

```text
mathicx:activity
mathicx:recents
mathicx:usage
```

Isso podia misturar atividades recentes, apps recentes e contadores de uso entre usuarios diferentes no mesmo navegador.

O Kernel passou a hidratar e persistir esses dados com escopo por usuario:

```text
mathicx:activity:{uid}
mathicx:recents:{uid}
mathicx:usage:{uid}
```

As chaves globais antigas deixam de ser carregadas para usuarios autenticados. Em logout, o estado em memoria desses itens e limpo antes do recarregamento da aplicacao.

## Validacao

- Imports ESM de `src/apps/integration/iframe-app.js`, `src/apps/japanese-study/view.js` e `src/apps/japanese-study/manifest.js`: OK.
- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- `git diff --check`: OK.
- Dashboard local: `activity`, `recents` e `usage` isolados por usuario no `localStorage`.
- `npm.cmd run test:app-ids`: alias legado e id canonico do Finances validados.
- Boot local no navegador: tela de autenticacao carregada sem erros de modulo ou console.
- Finances: 37 testes funcionais e 5 testes de sync passando.
- Japanese Study: 49 testes passando apos a padronizacao do Finances.

## Checklist Para Proximos Apps

- [ ] App existe em `Applications/{appId}/index.html`.
- [ ] Manifest criado em `src/apps/{appId}/manifest.js`.
- [ ] Wrapper usa `mountIframeApp`.
- [ ] App registrado em `src/apps/registry.js`.
- [ ] App abre pelo launcher.
- [ ] Tema claro/escuro chega ao iframe.
- [ ] Cleanup nao deixa iframe ativo apos fechar.
- [ ] Deep links basicos definidos, quando necessario.
- [ ] Caminho Firebase definido em `users/{uid}/apps/{appId}/...`, quando houver dados remotos.
- [ ] Regras Firestore previstas antes de salvar dados pessoais.
- [ ] Documentacao especifica do app criada ou atualizada.

## App de Validacao

O `finances` validou o padrao da Fase 9 com:

- wrapper reutilizavel por iframe;
- id canonico `finances` e alias legado `finanças`;
- isolamento local por usuario;
- snapshot Firestore em `users/{uid}/apps/finances/profile/snapshot`;
- revisao transacional e resolucao visivel de conflitos;
- retomada de alteracoes locais pendentes entre sessoes;
- testes funcionais e regras de isolamento no Firestore.

O snapshot permanece como estrategia recomendada para o volume atual. A granularizacao em colecoes por entidade deve ser reavaliada apenas quando consultas parciais, colaboracao ou crescimento de volume justificarem a complexidade adicional.
