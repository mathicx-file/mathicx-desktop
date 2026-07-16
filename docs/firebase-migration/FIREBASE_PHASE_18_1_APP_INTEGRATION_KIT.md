# Fase 18.1: Kit de Integracao para Novos Aplicativos

> Iniciada em: 2026-07-15
>
> Status: concluida e aprovada em 2026-07-16

## 1. Objetivo

Permitir que novos aplicativos adotem launcher, iframe, escopo por UID,
sincronizacao, backup e restauracao sem alterar o kernel, a Central de
Sincronizacao ou os orquestradores de backup.

## 2. Componentes

### Manifest integrado

`defineIntegratedAppManifest` valida o ID canonico e concentra em
`manifest.integration`:

- participacao no protocolo `mathicx-app-data`;
- nome curto da Central;
- abertura lazy pelo Window Manager;
- classificacao de dados financeiros;
- isolamento por usuario;
- ordem de exibicao.

A Central deixou de possuir uma lista fixa. Ela descobre automaticamente os
manifests registrados que declaram `integration.appData: true`.

### Factory de capacidades

`createIntegratedAppDataHandlers` monta handlers padronizados para:

- capacidades;
- estado e disparo manual de sync;
- exportacao, validacao e importacao de backup;
- pausa e retomada transacional de restore;
- confirmacao explicita e modos `merge`/`replace`.

Japanese Study, Finances e Desktop usam o mesmo factory sem mudar seus formatos
de backup ou comportamento externo.

### Escopo por UID

`user-scope.js` normaliza o UID, adiciona `desktopUserScope` a URLs preservando
query/hash e cria a mensagem `user-scope`. O Finances passou a consumir esse
helper; novos apps devem usa-lo desde o primeiro acesso ao storage local.

### Template e teste reutilizavel

O diretorio `templates/integrated-app` contem manifest, view e adaptador neutros.
O helper `scripts/testing/integrated-app-contract.mjs` valida capacidades, sync,
backup e confirmacao sem depender da UI do aplicativo.

## 3. Checklist de Integracao

1. escolher um ID canonico em lowercase kebab-case;
2. criar o aplicativo em `Applications/{appId}` sem copiar dados de outro app;
3. criar manifest e view host em `src/apps/{appId}` a partir do template;
4. declarar dados financeiros corretamente;
5. aplicar o UID antes de ler ou gravar LocalStorage/IndexedDB;
6. armazenar Firestore somente em `users/{uid}/apps/{appId}`;
7. implementar backup versionado e validacao que nao altere estado;
8. exigir confirmacao para importacao e suportar rollback de restore;
9. registrar apenas o manifest em `src/apps/registry.js`;
10. executar o teste contratual, rules, Pages e um teste com dois usuarios.

## 4. Limites de Seguranca

- o iframe nao recebe token, senha ou service account por `postMessage`;
- o app obtem a sessao pelo Firebase Auth same-origin;
- `containsFinancialData` nao pode ser falso para contornar criptografia;
- App Check, whitelist e rules continuam obrigatorios;
- modo local nunca pode compartilhar chaves com um UID Firebase;
- um app fechado permanece lazy e nao e aberto silenciosamente para sincronizar.

## 5. Validacao Automatizada

Comando dedicado:

```text
npm run test:integration-kit
```

Cobertura inicial:

- descoberta automatica e ordenacao de manifests;
- factory completo de sync/backup;
- rejeicao de contrato incompleto;
- validacao de capacidades;
- confirmacao obrigatoria de restore;
- normalizacao e transporte do escopo por UID;
- Central com app lazy, conflito e iframe descoberto pelo Window Manager.

Resultado em 2026-07-15:

- `test:integration-kit`: 9 de 9 testes aprovados;
- contratos de dados: 7 de 7 testes aprovados;
- recuperacao e rollback: 17 de 17 testes aprovados;
- sync Firebase dos aplicativos: 9 de 9 testes aprovados;
- `firebase:rollout:check`: `technicalReady: true`, 18 de 18 controles;
- boot no Google Chrome sem erros e descoberta de Desktop, Japanese Study e
  Finances pelas capacidades dos manifests.

## 6. Criterio de Aceite

Um manifest neutro aparece automaticamente na Central, e seu adaptador passa na
suite contratual, sem alteracao no kernel, na Central ou no backup unificado.

Aceite concluido em 2026-07-16 no servidor local. O proprietario validou login,
Central de Sincronizacao e aplicativos integrados. Como Authentication e
Firestore ja exigem App Check, o navegador local foi autorizado com um token de
debug privado registrado no Console; o token e a configuracao local permanecem
fora do Git.
