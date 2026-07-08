# Fase 8: Experiencia integrada do Japanese Study

> Data: 2026-07-08
>
> Escopo: aproximar o Japanese Study da experiencia nativa do Mathicx-File, com deep links e acoes no launcher.

## Objetivo

Depois da Fase 7/7.5 estabilizar visibilidade e controle da sincronizacao, a Fase 8 inicia a camada de experiencia integrada.

O primeiro recorte implementado foi:

- permitir que o host abra o Japanese Study em uma aba interna especifica;
- expor acoes do Japanese Study na busca global do launcher;
- reaproveitar a janela existente quando o app ja estiver aberto.

## Implementado

### Deep links internos

O wrapper `src/apps/japanese-study/view.js` agora entende acoes de navegacao e repassa para o iframe via `postMessage`:

```js
{ type: 'navigate', payload: { view: 'quiz' } }
```

Views suportadas:

```text
home
characters
dictionary
quiz
typing
data
```

Aliases aceitos pelo app:

```text
sync -> data
settings -> data
dicionario -> dictionary
digitacao -> typing
inicio -> home
caracteres -> characters
```

### Acoes no launcher

A busca global agora inclui acoes para o Japanese Study:

- `Abrir Japanese Study`;
- `Japanese Study: Quiz`;
- `Japanese Study: Dicionario`;
- `Japanese Study: Digitacao guiada`;
- `Japanese Study: Sincronizacao`.

Essas acoes abrem o app e navegam direto para a aba correspondente.

### Reuso de janela aberta

O `WindowManager.open(appId, opts)` agora aceita:

```js
{
  action: 'navigate',
  payload: { view: 'quiz' }
}
```

Se o app ja estiver aberto, a janela e focada/restaurada e o evento `EVT.APP_ACTION` e emitido para o wrapper ativo.

## Arquivos Alterados

- `src/core/event-bus.js`
- `src/window-manager/manager.js`
- `src/launcher/search.js`
- `src/launcher/launcher.js`
- `src/apps/japanese-study/view.js`
- `Applications/japanese-study/js/app.js`

## Validacao

- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- Imports ESM de `src/launcher/search.js` e `src/apps/japanese-study/manifest.js`: OK.

## Proximos Incrementos da Fase 8

1. Widget/resumo do Japanese Study no desktop ou dashboard.
2. Botao "Estudar agora" fora do app, abrindo direto a recomendacao diaria.
3. Busca global consultando termos do dicionario local.
4. Indicadores de SRS pendente, streak e ultimo sync no host.
