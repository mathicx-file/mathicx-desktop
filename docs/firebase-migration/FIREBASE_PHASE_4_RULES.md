# Fase 4: Rules, Emuladores e Isolamento

> Data: 2026-07-06
>
> Escopo: validar as regras Firestore antes de sincronizar dados do desktop.

## Status da implementacao

Arquivos adicionados:

- `package.json`
- `scripts/firebase/test-firestore-rules.mjs`

O `package.json` foi adicionado apenas para dependencias de desenvolvimento e testes. O runtime do host continua zero-build e sem bundle.

## Comando de validacao

Instalar dependencias de desenvolvimento:

```bash
npm install
```

Rodar os testes:

```bash
npm run test:firestore-rules
```

Esse comando sobe o emulador Firestore e executa os testes de isolamento contra `firestore.rules`.

## Casos cobertos

- dono cria o proprio perfil como `pending`;
- dono nao consegue nascer como `approved`;
- anonimo nao cria/le perfil pessoal;
- usuario B nao le nem edita perfil de A;
- dono atualiza somente campos seguros do proprio perfil;
- dono nao consegue autopromover `accessStatus` nem `role`;
- usuario `pending` nao acessa `desktop`, `apps` nem `migrations`;
- usuario `approved` acessa os proprios paths pessoais;
- usuario aprovado nao acessa subcolecoes de outro usuario;
- usuarios logados leem metadados publicos;
- somente admin claim escreve metadados publicos;
- paths desconhecidos sao negados.

## Intervencao do proprietario

O Firestore Emulator do `firebase-tools` atual exige JDK 21 ou superior.

No ambiente testado, `java -version` retornou Java 8:

```text
java version "1.8.0_491"
```

Ao rodar `npm run test:firestore-rules`, o Firebase CLI retornou:

```text
firebase-tools no longer supports Java version before 21.
Please install a JDK at version 21 or above to get a compatible runtime.
```

Portanto, antes de concluir a validacao automatizada da Fase 4, instale um JDK 21+ e confirme:

```bash
java -version
```

Depois rode novamente:

```bash
npm run test:firestore-rules
```

Se o terminal ainda estiver apontando para Java 8, use o JDK 21 instalado antes do comando:

```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.11.10-hotspot'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
npm.cmd run test:firestore-rules
```

## Resultado validado

Com o JDK 21 apontado via `JAVA_HOME`, a suite passou:

```text
10 Firestore rules tests passed.
```

Observacao: durante os testes aparecem logs `PERMISSION_DENIED`. Eles sao esperados para os casos que usam `assertFails`, pois confirmam que a regra bloqueou o acesso indevido.

## Proximo passo tecnico

Depois que os testes de rules estiverem verdes, a Fase 5 pode iniciar a sincronizacao de dados leves do desktop:

- tema;
- fixados;
- favoritos;
- configuracoes estaveis.
