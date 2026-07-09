# Fase 8: Experiencia integrada do Japanese Study

> Data: 2026-07-08
>
> Escopo: aproximar o Japanese Study da experiencia nativa do Mathicx-File, com deep links e acoes no launcher.
>
> Status: concluida em 2026-07-09.

## Objetivo

Depois da Fase 7/7.5 estabilizar visibilidade e controle da sincronizacao, a Fase 8 inicia a camada de experiencia integrada.

O primeiro recorte implementado foi:

- permitir que o host abra o Japanese Study em uma aba interna especifica;
- expor acoes do Japanese Study na busca global do launcher;
- reaproveitar a janela existente quando o app ja estiver aberto.

## Implementado

### Widget no desktop

O desktop agora inclui um widget nativo do Japanese Study com resumo por usuario Firebase.

O widget consulta:

```text
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/japanese-study/settings/main
```

Informacoes exibidas:

- quantidade de itens SRS sincronizados;
- quantidade de eventos de gamificacao registrados;
- total de favoritos do app e do dicionario;
- horario relativo da ultima atualizacao, quando disponivel.

Acoes rapidas:

- `Estudar`: abre `home`;
- `Quiz`: abre `quiz`;
- `Sync`: abre `data`.

Para usuarios que ja tinham layout de widgets salvo, o desktop passa a anexar novos widgets padrao que ainda nao existiam no layout salvo. Isso evita a necessidade de restaurar manualmente o layout para visualizar o widget do Japanese Study.

### Customizacao de widgets

O app `Configuracoes` agora possui uma aba `Widgets`, voltada para personalizar a tela inicial.

Controles disponiveis:

- adicionar/remover widgets do desktop;
- reordenar widgets com botoes de subir/descer;
- restaurar a configuracao padrao de widgets.

As preferencias usam o mesmo estado ja sincronizado do desktop:

```text
widgets
widgetLayout
```

Em modo Firebase, essas chaves sao persistidas por usuario em:

```text
users/{uid}/desktop/settings
```

Com isso, cada usuario pode ter uma tela inicial diferente sem afetar os demais usuarios.

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

### Busca de dicionario no launcher

O launcher tambem consulta o dicionario local do Japanese Study em:

```text
Applications/japanese-study/data/dictionary.json
```

Quando a busca encontra um verbete, o resultado aparece como tipo `Dicionario`.
Ao clicar, o Mathicx-File abre o Japanese Study na aba `dictionary`. A busca refinada e o filtro final permanecem dentro do proprio Japanese Study, que e a ferramenta principal de consulta.

Payload usado pelo host:

```js
{
  view: 'dictionary',
  query: 'mizu',
  dictionaryId: 'hira_mizu'
}
```

Decisao de escopo: a integracao do launcher deve priorizar descoberta e entrada rapida no app. A filtragem detalhada do dicionario nao sera aprofundada nesta fase.

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
- `src/apps/configuracoes/view.js`
- `src/desktop/desktop.js`
- `src/desktop/widgets.js`
- `styles/desktop.css`
- `Applications/japanese-study/js/app.js`

## Validacao

- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- Imports ESM de `src/launcher/search.js` e `src/apps/japanese-study/manifest.js`: OK.
- Imports ESM de `src/desktop/widgets.js`, `src/desktop/desktop.js` e `src/launcher/search.js`: OK.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- Busca mockada do launcher por `mizu`: resultado de dicionario encontrado e acao resolvida para `view: dictionary`.
- Fetch HTTP local de `Applications/japanese-study/data/dictionary.json`: OK.
- Teste manual no GitHub Pages: busca por `mizu` aparece no launcher e abre o Japanese Study na secao `Dicionario`.

## Fechamento

A Fase 8 esta concluida com:

- deep links internos para o Japanese Study;
- acoes do Japanese Study no launcher;
- widget/resumo no desktop;
- aba de customizacao de widgets;
- busca do dicionario local aparecendo no launcher;
- preferencias de widgets sincronizadas por usuario Firebase.

Itens que ficam para fases futuras:

1. Botao "Estudar agora" abrindo uma recomendacao diaria real, assim que o Japanese Study expuser esse criterio.
2. Indicadores mais ricos de SRS pendente, streak e ultimo sync no host.
3. Persistir um documento `stats/summary` agregado para reduzir leituras do widget no futuro.
4. Preparar o mesmo padrao `/users/{uid}/apps/{appId}/...` para proximos apps, como `finances`.
