# Integracao de Aplicativos

Guia vigente para adicionar um aplicativo independente ao Mathicx Desktop. O
padrao foi consolidado na Fase 18.1 e permite launcher, iframe, tema, UID, sync e
backup sem listas fixas na Central de Sincronizacao.

## 1. Estrutura

Use `lowercase-kebab-case` como ID canonico:

```text
Applications/meu-app/
src/apps/meu-app/
```

Parta de:

```text
templates/integrated-app/
```

O template inclui manifesto, view e adaptador de dados neutros.

## 2. Manifesto Integrado

Registre o app com `defineIntegratedAppManifest`:

```javascript
export default defineIntegratedAppManifest({
  id: 'meu-app',
  name: 'Meu App',
  category: 'pessoal',
  defaultSize: { width: 900, height: 650 },
  integration: {
    appData: true,
    version: '1.0.0',
    shortName: 'MA',
    canOpen: true,
    financial: false,
    userScoped: true,
    order: 30,
  },
  loader: () => import('./view.js'),
});
```

`financial` deve ser verdadeiro para qualquer dado financeiro. Isso faz o
backup unificado exigir protecao adequada e nao pode ser usado apenas como uma
preferencia visual.

Registre somente o manifesto em `src/apps/registry.js`. A Central descobre
automaticamente manifests com `integration.appData: true`.

## 3. Iframe e Host

O wrapper deve:

- criar o iframe apenas quando o app for aberto;
- preservar query e hash ao adicionar `desktopUserScope`;
- enviar tema e escopo antes de o app ler dados pessoais;
- validar origem, source e formato de mensagens;
- remover listeners, timers e iframe no cleanup;
- manter o aplicativo fechado em estado lazy.

Nao envie senha, ID token, App Check token ou service account por `postMessage`.
Aplicativos same-origin usam a sessao Firebase inicializada no proprio origin.

## 4. Escopo Local

Use `src/apps/integration/user-scope.js` para normalizar e transportar o UID.

Regras obrigatorias:

- conta Firebase: namespace local por UID;
- visitante: namespace `guest-local-v1`;
- app standalone: namespace local proprio;
- aplique o escopo antes de qualquer leitura de LocalStorage ou IndexedDB;
- trocar de usuario nao pode reutilizar estado pessoal anterior.

## 5. Firestore

Dados pessoais ficam somente em:

```text
users/{uid}/apps/{appId}/...
```

Adicione paths em `src/firebase/firestore-paths.js`, rules por UID e testes no
Emulator Suite. Dados estaticos publicos nao devem ser duplicados por usuario.

## 6. Contrato de Sync e Backup

O adaptador pode usar `createIntegratedAppDataHandlers` para implementar:

- capacidades e versao contratual;
- estado de sincronizacao;
- sincronizacao manual;
- exportacao e validacao sem efeito colateral;
- importacao `merge` e `replace`;
- confirmacao explicita;
- pausa, commit e rollback de restauracao.

Backups devem possuir `format`, `schemaVersion`, `appVersion`, `exportedAt` e
payload de dados. Versoes futuras desconhecidas devem ser recusadas.

## 7. Modo Visitante

Visitante nunca inicializa repository Firestore. O app deve continuar funcional
localmente e participar do backup unificado identificado como `guest-local`.
Migracao para uma conta aprovada ocorre pelo fluxo de backup, com snapshot
preventivo da conta antes da importacao.

## 8. Testes

Adapte `scripts/testing/integrated-app-contract.mjs` e execute:

```bash
npm run test:integration-kit
npm run test:app-data-contract
npm run test:recovery
npm run test:guest-mode
npm run test:firebase-security
npm run pages:build
npm run pages:validate
```

Teste manualmente:

1. dois usuarios no mesmo navegador;
2. dois navegadores com a mesma conta;
3. app fechado e aberto pela Central;
4. sync manual, conflito e falha de rede;
5. backup merge/replace e rollback;
6. visitante sem requisicoes Firebase;
7. tema claro e escuro;
8. GitHub Pages com caminhos relativos.

## 9. Checklist

- [ ] ID canonico e sem colisao
- [ ] manifest integrado e versao semantica
- [ ] iframe lazy com cleanup
- [ ] UID aplicado antes do storage
- [ ] visitante estritamente local
- [ ] Firestore sob `users/{uid}/apps/{appId}`
- [ ] rules e testes por UID
- [ ] backup versionado e validacao pura
- [ ] merge, replace, confirmacao e rollback
- [ ] diagnostico sem dados pessoais
- [ ] Pages e dois usuarios validados

Japanese Study e Finances sao as referencias reais. O placeholder French Study
nao faz parte da integracao ou do artefato enquanto nao houver aprovacao explicita.
