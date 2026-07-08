# Fase 5: Dados Leves do Desktop

> Data: 2026-07-06
>
> Escopo: sincronizar preferencias leves do desktop para Firestore.

## Status da implementacao

Arquivos adicionados:

- `src/data/desktop/firestore-desktop-repository.js`
- `src/data/desktop/desktop-sync.js`

Arquivos alterados:

- `src/core/kernel.js`
- `src/firebase/feature-flags.js`
- `scripts/firebase/test-firestore-rules.mjs`

## Dados sincronizados

Documento:

```text
users/{uid}/desktop/settings
```

Campos:

```text
theme
widgets
widgetLayout
shortcuts
favorites
pinned
updatedAt
schemaVersion
```

## Comportamento

- O sync roda somente para usuario Firebase `approved`.
- A leitura remota acontece antes do `themeManager.init()`, para aplicar o tema remoto antes de renderizar a UI.
- Se o documento remoto existir, ele sobrescreve os valores locais leves.
- Se o documento remoto nao existir e escrita estiver habilitada, o estado local atual cria o documento inicial.
- Mudancas posteriores em tema, widgets, atalhos, favoritos e fixados sao salvas com debounce.

## Flags

```javascript
firestoreDesktopReadEnabled: true
firestoreDesktopWriteEnabled: true
```

Rollback rapido:

```javascript
firestoreDesktopReadEnabled: false
firestoreDesktopWriteEnabled: false
```

## Fora do escopo

- Explorer virtual;
- Notas;
- widget notes/tasks;
- activity log;
- usage/recents;
- apps externos.

Esses dados precisam de schemas e politicas proprias antes de sincronizar.

## Validacao manual

1. Entrar com usuario aprovado.
2. Alternar tema.
3. Favoritar/desfavoritar um app.
4. Fixar/desfixar app na taskbar, se usado.
5. Conferir no Firestore:

```text
users/{uid}/desktop/settings
```

6. Recarregar a pagina.
7. Confirmar que os valores remotos sao reaplicados.
