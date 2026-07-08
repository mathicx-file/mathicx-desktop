# Fase 1: Infraestrutura Firebase Zero-Build

> Data: 2026-07-04
>
> Escopo: preparar Firebase sem trocar a autenticacao local ainda.

## Status da implementacao

Arquivos adicionados:

- `src/firebase/feature-flags.js`
- `src/firebase/firebase-client.js`
- `src/firebase/firebase-emulators.js`
- `src/firebase/firebase-config.example.js`
- `src/firebase/firebase-config.prod.js`
- `src/firebase/firestore-paths.js`
- `firebase.json`
- `firestore.rules`
- `firestore.indexes.json`

Todas as flags Firebase permanecem desligadas por padrao. O login atual do Mathicx-File nao foi alterado nesta fase.

## Decisao de ambiente

Para o estado atual do projeto, usaremos um unico projeto Firebase pessoal inicialmente.

Sugestao:

```text
mathicx-file-prod
```

Antes de liberar para outras pessoas ou fazer testes destrutivos, podemos separar `dev` e `prod`.

## Modelo de aprovacao/whitelist

O Firestore ja foi preparado para cadastro com aprovacao:

- o usuario autenticado pelo Firebase podera criar `users/{uid}` com `accessStatus: "pending"`;
- dados pessoais sob `users/{uid}/desktop`, `users/{uid}/apps` e `users/{uid}/migrations` exigem `accessStatus: "approved"`;
- `accessStatus: "approved"` nao pode ser definido pelo proprio cliente;
- aprovacao inicial pode ser feita manualmente no Firebase Console;
- painel admin real deve usar custom claim `admin == true` em fase posterior.

Estados previstos:

```text
pending
approved
rejected
```

## Intervencoes do proprietario

1. Criar o projeto no Firebase Console.
2. Registrar um Web App.
3. Ativar Authentication com Email/Password.
4. Criar o Cloud Firestore.
5. Copiar o objeto `firebaseConfig`.
6. Criar localmente `src/firebase/firebase-config.local.js` com este formato:

```javascript
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "..."
};
```

Esse arquivo ja esta no `.gitignore`.

## Opcional: Firebase CLI

Quando quiser testar emuladores ou publicar rules:

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase emulators:start --only auth,firestore
```

Use o alias:

```text
prod
```

## Proximo passo tecnico

A Fase 2 deve criar um `firebase-auth-provider` em paralelo, ainda sem remover o provider local. O objetivo sera provar cadastro, login, logout e restore via Firebase Auth antes de trocar o gate principal do kernel.
