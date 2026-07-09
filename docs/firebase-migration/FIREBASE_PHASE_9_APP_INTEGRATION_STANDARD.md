# Fase 9: Padrao de integracao para novos apps

> Data: 2026-07-09
>
> Status: iniciada
>
> Objetivo: transformar o aprendizado da integracao do Japanese Study em um padrao reutilizavel para proximos apps.

## Escopo

A Fase 9 prepara o Mathicx-File para receber novas aplicacoes integradas com menos retrabalho.

O primeiro recorte implementado nesta fase e de padronizacao:

- documentar responsabilidades entre host e app;
- criar uma ponte reutilizavel para apps em iframe;
- manter o Japanese Study como referencia funcional;
- deixar `finances` como candidato futuro, sem migracao de dados nesta etapa.

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

## Validacao

- Imports ESM de `src/apps/integration/iframe-app.js`, `src/apps/japanese-study/view.js` e `src/apps/japanese-study/manifest.js`: OK.
- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- `git diff --check`: OK.

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

## Proximo Candidato

`finances` e o candidato natural para validar a Fase 9, mas o proximo passo recomendado e primeiro revisar o estado atual dele:

- confirmar estrutura em `Applications/finances`;
- revisar manifest e id publico;
- decidir se o id sera `finances` ou `financas`;
- verificar suporte a tema;
- mapear dados que futuramente iriam para Firebase.

Somente depois dessa revisao deve comecar a migracao de dados do app.
