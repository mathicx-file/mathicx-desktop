# Autenticacao Local - Legado

Este arquivo substitui os documentos antigos `AUTENTICACAO.md` e `Autenticacao-progresso.md`, que descreviam a implementacao de autenticacao 100% client-side antes da decisao de migrar identidade para Firebase.

## Contexto

A autenticacao local foi planejada para proteger o desktop em um ambiente estatico, sem backend e sem build. Ela usa:

- IndexedDB para `users`, `sessions` e `stats`.
- Web Crypto API com PBKDF2 para hash de senha.
- `src/auth/provider.js` como provider local.
- `src/auth/login-screen.js` como gate visual.
- Eventos de auth no event bus.
- Painel admin local e estatisticas de uso.

## Status Historico

O plano original foi executado em fases:

| Fase | Status historico |
| --- | --- |
| Schema IndexedDB com stores `users`, `sessions`, `stats` | Concluido |
| Modulo de criptografia `src/auth/crypto.js` | Concluido |
| Provider local `src/auth/provider.js` | Concluido |
| Eventos de auth no event bus | Concluido |
| Gate de boot e tela de login | Concluido |
| Rastreamento de uso | Concluido |
| UI de perfil/logout | Concluido |
| Painel administrativo local | Concluido |

## Decisao Atual

Com a migracao para Firebase, esta autenticacao local deixa de ser fonte de verdade da identidade.

A regra atual e:

```text
Firebase Auth define quem e o usuario.
Firestore guarda dados persistentes por uid.
IndexedDB/localStorage nao decidem identidade.
```

Usuarios locais existentes sao considerados dados de teste. Eles nao devem ser migrados automaticamente para Firebase Auth.

## O Que Preservar

Mesmo como legado, algumas ideias continuam uteis:

- A interface `authProvider` como facade para o desktop.
- O gate de boot no kernel.
- Eventos `AUTH_CHANGE`, `USER_LOGIN` e `USER_LOGOUT`.
- Limpeza de estado pessoal no logout.
- Registro de estatisticas, se for reimplementado sobre Firebase/Firestore.

## O Que Evitar

- Rodar auth local e Firebase Auth em paralelo no modo producao.
- Considerar `sessions` locais como login valido quando `authMode === 'firebase'`.
- Migrar hashes locais de senha para Firebase.
- Usar `perfil: 'admin'` local como autorizacao real em Firestore.

## Referencia

Se algum detalhe antigo for necessario, consulte o historico do projeto ou restaure os arquivos originais a partir do controle de versao/backups:

- `AUTENTICACAO.md`
- `Autenticacao-progresso.md`
