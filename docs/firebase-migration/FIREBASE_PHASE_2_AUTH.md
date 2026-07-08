# Fase 2: Firebase Auth em Paralelo

> Data: 2026-07-04
>
> Escopo: criar um provider Firebase Auth paralelo, sem trocar o login principal do desktop.

## Status da implementacao

Arquivo adicionado:

- `src/auth/firebase-auth-provider.js`

O `authProvider` local continua sendo usado pelo kernel. A Fase 2 apenas deixa pronta a implementacao Firebase para testes controlados.

## Contrato disponivel

```javascript
firebaseAuthProvider.ready()
firebaseAuthProvider.restoreSession()
firebaseAuthProvider.register({ nome, email, senha })
firebaseAuthProvider.login(email, senha)
firebaseAuthProvider.logout()
firebaseAuthProvider.getCurrentUser()
firebaseAuthProvider.isAuthenticated()
firebaseAuthProvider.isApproved()
firebaseAuthProvider.isAdmin()
firebaseAuthProvider.onAuthChange(callback)
```

## Whitelist/aprovacao

Ao cadastrar um usuario:

1. Firebase Auth cria a credencial com e-mail/senha.
2. O provider cria `users/{uid}` no Firestore.
3. O perfil nasce com:

```json
{
  "accessStatus": "pending",
  "role": "user",
  "schemaVersion": 1
}
```

Enquanto estiver `pending`, o usuario pode ler o proprio perfil, mas as rules bloqueiam dados pessoais sob:

- `users/{uid}/desktop`
- `users/{uid}/apps`
- `users/{uid}/migrations`

Para aprovar manualmente no Firebase Console, edite o documento `users/{uid}`:

```text
accessStatus = approved
```

Nao altere `role` para `admin` como mecanismo de permissao real. Admin remoto deve usar custom claim em fase posterior.

## Teste manual no navegador

Com um servidor local em execucao:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`, faca login local normalmente e teste no console do navegador:

```javascript
const { firebaseAuthProvider } = await import('./src/auth/firebase-auth-provider.js');

await firebaseAuthProvider.register({
  nome: 'Teste Firebase',
  email: 'teste@example.com',
  senha: '123456'
});

firebaseAuthProvider.getCurrentUser();

await firebaseAuthProvider.logout();

await firebaseAuthProvider.login('teste@example.com', '123456');
```

Resultado esperado:

- usuario aparece em Firebase Authentication;
- documento `users/{uid}` aparece no Firestore como `pending`;
- `firebaseAuthProvider.getCurrentUser()` retorna `provider: "firebase"`;
- o login local do Mathicx-File permanece inalterado.

## Caso comum: Auth criou usuario, mas Firestore negou perfil

Se o cadastro retornar:

```javascript
{ ok: false, error: 'Permissao negada pelo Firestore.' }
```

e o usuario aparecer em Firebase Authentication, a credencial foi criada, mas o documento `users/{uid}` nao foi gravado. Isso normalmente significa que as `firestore.rules` ainda nao tinham sido publicadas.

Depois de publicar as rules, nao cadastre o mesmo e-mail de novo. Faca login:

```javascript
await firebaseAuthProvider.login('teste@example.com', '123456');
```

O provider tentara criar o perfil `users/{uid}` pendente que ficou faltando.

## Proximo passo tecnico

A Fase 3 deve conectar este provider ao gate principal quando `authMode === "firebase"`, impedindo que sessoes locais do IndexedDB decidam identidade no modo Firebase.
