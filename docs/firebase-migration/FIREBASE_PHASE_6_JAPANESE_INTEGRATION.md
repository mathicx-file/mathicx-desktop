# Fase 6: Integracao inicial do Japanese Study

> Data: 2026-07-08
>
> Escopo: integrar `Applications/japanese-study` ao desktop como app externo, preparar o namespace Firestore e ativar a sincronizacao remota local-first por usuario aprovado.

## Decisao

O Japanese Study entra inicialmente como app externo em iframe.

Motivos:

- preserva o modo standalone do projeto;
- reduz o risco da primeira integracao;
- mantem LocalStorage e IndexedDB funcionando como cache local;
- permite sincronizar dados pessoais pelo Firebase sem remover o modo standalone.

## Namespace Firestore aprovado

O caminho canonico para dados pessoais do app sera:

```text
users/{uid}/apps/japanese-study/...
```

Esse padrao foi escolhido para organizar futuros apps no mesmo modelo, como `finances`.

Paths preparados:

```text
users/{uid}/apps/japanese-study/settings/main
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/japanese-study/stats/summary
users/{uid}/apps/japanese-study/events/{eventId}
users/{uid}/apps/japanese-study/achievements/{achievementId}
users/{uid}/apps/japanese-study/srs/{itemId}
users/{uid}/apps/japanese-study/favorites/{entryId}
users/{uid}/apps/japanese-study/dictionaryFavorites/{entryId}
```

## Implementado nesta fase

- Criado wrapper do host em `src/apps/japanese-study`.
- Registrado `japanese-study` no catalogo de apps do desktop.
- Mantido o app real em `Applications/japanese-study`.
- Criada sincronizacao Firebase local-first dentro do Japanese Study.
- Atualizados helpers de path em `src/firebase/firestore-paths.js`.
- Regras Firestore continuam usando o wildcard seguro `users/{uid}/apps/{appId}/...`.
- Ativadas as flags `firestoreJapaneseReadEnabled` e `firestoreJapaneseWriteEnabled`.
- Corrigido repasse de tema do host para o iframe usando o tema resolvido `dark`/`light`.
- Corrigido isolamento local por usuario Firebase: LocalStorage e IndexedDB do Japanese Study agora usam escopo baseado no UID aprovado.
- Corrigido o botao "Excluir dados" para nao depender de `window.confirm`, que pode falhar dentro do iframe.
- Adicionado teste cobrindo isolamento de LocalStorage por usuario Firebase.
- Confirmado em teste manual que usuarios diferentes mantem progresso, tema e favoritos separados.

## Ajustes pos-teste da integracao

Durante os testes no GitHub Pages foram corrigidos pontos de experiencia do host e do app integrado:

- tela de login do Mathicx-File recebeu opcao `Lembre de mim`, salvando apenas o e-mail/usuario;
- tema `auto` foi removido do Mathicx-File, deixando apenas claro e escuro;
- menu do usuario na taskbar passou a abrir acima do botao, proximo a barra;
- Japanese Study passou a aplicar o escopo local por UID antes de ler preferencias, progresso, favoritos e SRS;
- o fluxo de exclusao de dados locais no Japanese Study passou a usar a confirmacao visual ja existente na aba Dados.

## Fora do escopo desta fase

- mover dicionario ou assets estaticos para Firebase;
- criar widgets, deep links ou busca global.

## Proxima fase recomendada

Evoluir a camada de sync local-first do Japanese Study depois da Fase 7:

1. melhorar reconciliacao de conflitos entre dispositivos;
2. mostrar detalhes expandiveis do ultimo sync;
3. adicionar botao "Sincronizar agora";
4. avaliar widgets, deep links e busca global.

## Validacao

- `npm.cmd test` em `Applications/japanese-study`: 49 testes passando.
- `npm.cmd run test:firestore-rules`: 10 testes passando.
- imports de `registry`, manifest e wrapper do app validados por Node.
- Deploy GitHub Pages validado pelo workflow `Deploy GitHub Pages #3` no commit `7e4e940`.
