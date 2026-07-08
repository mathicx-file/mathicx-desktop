# Fase 3: Firebase Auth como Gate Principal

> Data: 2026-07-04
>
> Escopo: fazer o desktop usar Firebase Auth quando `authMode === "firebase"`.

## Status da implementacao

Arquivos alterados:

- `src/firebase/feature-flags.js`
- `src/auth/provider.js`
- `src/auth/login-screen.js`
- `src/core/kernel.js`

## Comportamento atual

As flags agora deixam o modo Firebase ativo:

```javascript
authMode: 'firebase'
firebaseEnabled: true
firebaseAuthEnabled: true
```

Com isso:

- o kernel nao usa mais usuarios/sessoes locais do IndexedDB para decidir login;
- o login principal usa e-mail/senha do Firebase;
- cadastro cria credencial no Firebase Auth e perfil `users/{uid}` no Firestore;
- perfil novo nasce como `accessStatus: "pending"`;
- usuario pendente autentica, mas nao entra no desktop;
- usuario aprovado entra no desktop;
- logout continua recarregando a pagina pelos fluxos atuais da UI.

## Rollback

Para voltar temporariamente ao login local, edite:

```javascript
// src/firebase/feature-flags.js
authMode: 'local'
firebaseEnabled: false
firebaseAuthEnabled: false
```

## Validacao manual recomendada

1. Abrir `http://localhost:8080`.
2. Confirmar que a tela de login pede e-mail, nao username.
3. Entrar com usuario aprovado.
4. Confirmar que o desktop abre.
5. Sair.
6. Entrar com usuario pendente.
7. Confirmar que aparece a tela de aguardando aprovacao.
8. Aprovar no Firestore:

```text
users/{uid}.accessStatus = approved
```

9. Clicar em "Verificar aprovacao".
10. Confirmar que o desktop abre.

O botao "Verificar aprovacao" força uma nova leitura de `users/{uid}` no servidor Firestore. Isso evita manter em memoria o perfil antigo `pending` depois que o campo `accessStatus` for editado no Console.

## Observacoes

- O painel admin local nao gerencia usuarios Firebase nesta fase.
- A aprovacao continua manual pelo Firebase Console.
- Admin remoto ainda deve ser feito por custom claims em fase posterior.
- Dados locais do desktop ainda nao foram migrados para Firestore.
