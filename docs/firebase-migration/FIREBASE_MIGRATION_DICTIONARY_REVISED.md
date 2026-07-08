# Plano Revisado: Migração Firebase e Dicionário Japonês Escalável

> Documento técnico para orientar a implementação pelo Codex.
>
> Projeto principal: `mathicx-file`
>
> Aplicação integrada: `Applications/japanese-study`
>
> Revisão: 2026-07-02
>
> Substitui a versão anterior de `FIREBASE_MIGRATION_DICTIONARY_REVISED.md` e complementa `docs/firebase-migration/firebase-migration.md`.

---

## 1. Objetivo

Migrar gradualmente o Mathicx-File para Firebase, começando pela identidade e pelos dados sincronizáveis do desktop, sem reescrever o projeto nem abandonar a arquitetura atual baseada em HTML, CSS, JavaScript vanilla, ES Modules e GitHub Pages.

Em seguida, integrar o Japanese Study ao mesmo projeto Firebase e expandir seu dicionário para uma base ampla baseada em JMdict/KANJIDIC2, sem:

- carregar um JSON monolítico na abertura;
- consultar o Firestore a cada tecla;
- duplicar autenticação entre desktop e iframe;
- quebrar funcionamento local/offline;
- acoplar a UI à fonte dos dados;
- introduzir obrigatoriamente Vite ou outro bundler no host.

A arquitetura deve continuar **local-first**, mas com sincronização remota dos dados pessoais.

---

## 2. Decisão arquitetural final

### 2.1 Um Firebase compartilhado

Usar **um projeto Firebase por ambiente**, compartilhado pelo desktop e pelos aplicativos integrados.

```text
Ambiente de desenvolvimento
└── mathicx-file-dev

Ambiente de produção
└── mathicx-file-prod
```

Na primeira entrega, um único projeto de produção é suficiente caso o projeto ainda seja pessoal. A separação `dev/prod` pode ser criada antes de abrir o acesso a outros usuários.

### 2.2 Responsabilidade de cada camada

```text
GitHub Pages
├── Mathicx-File
├── Japanese Study via iframe
└── pacotes públicos e versionados do dicionário

Firebase Authentication
└── identidade central do usuário

Cloud Firestore
├── perfil
├── preferências do desktop
├── progresso de estudo
├── favoritos
├── SRS
├── histórico sincronizável
├── listas pessoais
└── metadados opcionais da versão do dicionário

IndexedDB no navegador
├── cache dos chunks do dicionário
├── índices carregados
├── pacote essencial
├── progresso local/fila offline temporária
└── metadados de cache e versão
```

### 2.3 Regra principal do dicionário

```text
O catálogo público é distribuído como arquivos estáticos fragmentados.
A pesquisa ocorre localmente.
O Firebase sincroniza identidade e dados pessoais.
```

O Firestore **não deve** ser chamado diretamente por eventos `input`, `keyup` ou por cada consulta lexical.

---

## 3. Situação atual considerada

### 3.1 Mathicx-File

- Runtime zero-build.
- Entrada por `index.html` e `src/main.js`.
- Kernel em `src/core/kernel.js`.
- ES Modules nativos.
- Autenticação local com Web Crypto e IndexedDB.
- Preferências em LocalStorage/IndexedDB.
- Aplicações internas carregadas por `import()`.
- Aplicações externas em `Applications/<app-id>` via iframe.
- Publicação estática compatível com GitHub Pages.

### 3.2 Japanese Study

- Aplicação standalone e integrada por iframe.
- `data/dictionary.json` como base inicial.
- Busca por escrita japonesa, romaji, definição e categoria.
- Favoritos, histórico, progresso, SRS e backup locais.
- Kanji N5 inicial e KanjiVG.
- Estrutura preparada para `DictionaryProvider`, `KanjiProvider`, repositories e `HostBridge`.
- UI não deve saber se o dado veio de JSON, IndexedDB ou Firebase.

### 3.3 Consequência para Firebase em iframe

Desktop e Japanese Study usam:

- o mesmo projeto Firebase;
- a mesma configuração pública;
- a mesma origem no GitHub Pages;
- a mesma persistência de autenticação da origem.

Porém, cada iframe possui seu próprio contexto JavaScript. Portanto:

- o desktop inicializa seu próprio `FirebaseApp`;
- o iframe inicializa outro `FirebaseApp` com a mesma configuração;
- ambos usam `onAuthStateChanged()`;
- não se envia senha, credencial, ID token ou API key por `postMessage`;
- `postMessage` permanece para tema, navegação e status do estudo.

---

## 4. Itens que não fazem parte da primeira entrega

Não implementar inicialmente:

- migração das senhas PBKDF2 locais para Firebase Auth;
- Firestore como mecanismo de busca textual do dicionário;
- um documento Firestore por palavra acessado pela busca do usuário;
- listeners `onSnapshot()` globais em desktop, taskbar e todos os iframes;
- painel administrativo com permissão baseada apenas em campo editável pelo cliente;
- Cloud Storage obrigatório;
- tradução automática irrestrita de todo o JMdict;
- Service Worker/PWA como pré-requisito;
- Vite ou bundler como pré-requisito do host.

Scripts Node.js de desenvolvimento e GitHub Actions são permitidos para gerar os dados. Isso não altera o fato de o runtime permanecer zero-build.

---

## 5. Estrutura Firebase proposta

### 5.1 Dados pessoais

```text
users/{uid}
  displayName
  email
  photoURL
  createdAt
  updatedAt
  lastLoginAt
  schemaVersion

users/{uid}/desktop/settings/main
users/{uid}/desktop/pinned/{appId}
users/{uid}/desktop/favorites/{appId}
users/{uid}/desktop/shortcuts/{shortcutId}

users/{uid}/apps/japanese/settings/main
users/{uid}/apps/japanese/kanaProgress/{kanaId}
users/{uid}/apps/japanese/kanjiProgress/{kanjiId}
users/{uid}/apps/japanese/favorites/{entryId}
users/{uid}/apps/japanese/history/{eventId}
users/{uid}/apps/japanese/reviews/{reviewId}
users/{uid}/apps/japanese/customLists/{listId}
users/{uid}/apps/japanese/customLists/{listId}/items/{entryId}

users/{uid}/migrations/{migrationId}
```

### 5.2 Dados públicos pequenos

Opcionalmente:

```text
publicData/dictionary
  currentVersion
  schemaVersion
  manifestUrl
  generatedAt
  minimumAppVersion

publicAppCatalog/{appId}
publicAppConfig/{configId}
```

O documento `publicData/dictionary` é pequeno e serve apenas para informar qual release está ativa. Os arquivos grandes continuam no GitHub Pages inicialmente.

---

## 6. Regras de segurança iniciais

Criar regras fechadas por padrão.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return signedIn() && request.auth.uid == userId;
    }

    function isAdmin() {
      return signedIn() && request.auth.token.admin == true;
    }

    match /users/{userId} {
      allow create: if isOwner(userId);
      allow read, update, delete: if isOwner(userId);

      match /{document=**} {
        allow read, write: if isOwner(userId);
      }
    }

    match /publicData/{documentId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /publicAppCatalog/{appId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /publicAppConfig/{configId} {
      allow read: if signedIn();
      allow write: if isAdmin();
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

Depois que os schemas estiverem estáveis, adicionar validação de campos, tipos, tamanhos, timestamps e campos imutáveis.

Nunca usar em produção:

```javascript
allow read, write: if true;
```

---

## 7. Configuração Firebase no projeto zero-build

### 7.1 Estrutura do host

```text
src/firebase/
├── firebase-config.example.js
├── firebase-config.local.js
├── firebase-config.prod.js       # gerado no deploy ou versionado
├── firebase-client.js
├── firebase-emulators.js
├── firebase-auth-provider.js
├── firestore-paths.js
└── feature-flags.js
```

### 7.2 Estrutura no iframe

```text
Applications/japanese-study/js/firebase/
├── firebase-client.js
├── firebase-auth-session.js
└── firebase-config.js
```

Evitar duplicar manualmente valores em múltiplos arquivos. Preferir:

- um arquivo compartilhável por URL relativa; ou
- geração dos dois arquivos no workflow; ou
- um módulo comum acessível pelo host e pelo iframe.

### 7.3 SDK por browser modules

Enquanto o projeto continuar zero-build, usar imports ESM do CDN oficial do Firebase e **fixar uma versão exata testada**.

Não usar caminhos sem versão nem `latest`.

Exemplo conceitual:

```javascript
import { initializeApp, getApp, getApps }
  from 'https://www.gstatic.com/firebasejs/<VERSAO>/firebase-app.js';

import { getAuth }
  from 'https://www.gstatic.com/firebasejs/<VERSAO>/firebase-auth.js';

import { getFirestore }
  from 'https://www.gstatic.com/firebasejs/<VERSAO>/firebase-firestore.js';
```

Se futuramente o projeto adotar bundler, trocar para pacotes npm sem alterar os contratos dos providers.

---

## 8. Migração da autenticação

### 8.1 Fonte de verdade

Quando `authMode === 'firebase'`:

```text
Firebase Auth define a identidade.
Firestore guarda os dados vinculados ao uid.
IndexedDB não decide quem está autenticado.
```

### 8.2 Facade do host

Manter uma interface estável:

```javascript
authProvider.ready()
authProvider.restoreSession()
authProvider.login(email, password)
authProvider.register({ displayName, email, password })
authProvider.logout()
authProvider.getCurrentUser()
authProvider.onAuthChange(callback)
authProvider.isAdmin()
```

Implementações:

```text
src/auth/provider.js
src/auth/local-auth-provider.js
src/auth/firebase-auth-provider.js
```

### 8.3 Usuários locais existentes

Não migrar hashes de senha.

Fluxo permitido:

1. usuário cria ou acessa conta Firebase;
2. app detecta dados locais antigos;
3. usuário escolhe importar os dados;
4. dados de produto são copiados para `users/{uid}`;
5. marcador de migração é criado;
6. dados locais ficam temporariamente como backup.

### 8.4 Administração

Na primeira fase:

- gerenciamento de usuários pelo Firebase Console;
- painel administrativo local não concede permissão remota;
- nenhuma tela cliente pode atribuir `admin: true` a si mesma.

Para admin real, usar custom claims definidas por script/Cloud Function em ambiente confiável.

---

## 9. Arquitetura correta do dicionário

## 9.1 Princípio

Adotar a ideia de **lazy loading por chunks + cache em IndexedDB**, com correções para suportar diferentes tipos de busca.

Não criar um índice único que mapeie todas as palavras para arquivos, pois esse índice se tornaria outro dicionário grande.

Não dividir apenas por uma única sílaba sem controlar o tamanho, pois alguns chunks ficariam muito maiores que outros.

### 9.2 Componentes

```text
DictionaryProvider
├── DictionaryNormalizer
├── DictionaryRouter
├── DictionaryCacheRepository
├── DictionaryStaticSource
├── DictionarySearchEngine
└── DictionaryVersionManager
```

Contrato mínimo:

```javascript
await dictionaryProvider.init();
await dictionaryProvider.search(query, options);
await dictionaryProvider.getById(entryId);
await dictionaryProvider.installPack(packId);
await dictionaryProvider.checkForUpdates();
await dictionaryProvider.getCacheStatus();
await dictionaryProvider.clearCache(options);
```

A UI deve consumir somente esse contrato.

---

## 10. Fonte e modelo dos dados

### 10.1 Fontes previstas

- JMdict: vocabulário, leituras, sentidos e classes gramaticais.
- KANJIDIC2: metadados individuais dos kanji.
- KanjiVG: SVG e ordem de traços.
- Traduções pt-BR: camada própria e revisada pelo projeto.
- Tatoeba ou outra fonte compatível: frases futuras, com licença preservada.

### 10.2 Atenção ao português

Não presumir que o pacote usado de JMdict possui português pronto.

Manter dados originais e tradução do projeto separados logicamente:

```json
{
  "id": "jmdict-1358280",
  "writtenForms": ["食べる"],
  "readings": ["たべる"],
  "senses": [
    {
      "partOfSpeech": ["v1"],
      "glosses": {
        "en": ["to eat"],
        "pt-BR": ["comer", "alimentar-se"]
      }
    }
  ],
  "metadata": {
    "common": true,
    "jlpt": ["N5"],
    "source": "JMdict",
    "ptBRSource": "mathicx-japanese-study"
  }
}
```

Atualizações do JMdict não podem apagar traduções pt-BR próprias.

### 10.3 IDs estáveis

- preservar ID estável da fonte quando disponível;
- não usar palavra japonesa como ID de documento ou chave primária;
- não gerar ID dependente da posição no array;
- manter alias para formas escritas e leituras.

---

## 11. Layout dos arquivos do dicionário

```text
Applications/japanese-study/data/dictionary/
├── manifest.json
├── licenses.json
├── packs/
│   ├── bootstrap-n5.json
│   ├── common-core.json
│   ├── jlpt-n5.json
│   └── jlpt-n4.json                 # futuro
├── routes/
│   ├── reading-routes.json
│   ├── written-routes.json
│   ├── romaji-routes.json
│   └── pt-routes.json
├── indexes/
│   ├── reading/
│   │   ├── a.json
│   │   ├── ka-0.json
│   │   ├── ka-1.json
│   │   └── other.json
│   ├── written/
│   │   ├── 00.json
│   │   ├── 01.json
│   │   └── ff.json
│   ├── romaji/
│   │   ├── aa.json
│   │   ├── ab.json
│   │   └── other.json
│   └── pt/
│       ├── co.json
│       ├── ca.json
│       └── other.json
└── entries/
    ├── 00.json
    ├── 01.json
    ├── 02.json
    └── ff.json
```

### 11.1 Pacote essencial

`bootstrap-n5.json` deve conter:

- palavras atuais do projeto;
- vocabulário dos kanji N5 implementados;
- palavras necessárias para quizzes e exercícios;
- traduções pt-BR revisadas;
- dados necessários para a primeira renderização.

Esse arquivo é pequeno e pode ser carregado ao abrir o app.

### 11.2 Shards de entradas

As entradas completas ficam em shards estáveis, por exemplo `00` até `ff`, calculados a partir de hash do ID.

```javascript
const shard = stableHash(entryId).slice(0, 2);
```

Os índices retornam IDs. O provider baixa somente os shards das entradas necessárias para preencher o limite de resultados.

### 11.3 Índices de busca

#### Leitura kana

Organizado por primeira mora/prefixo e dividido novamente quando ultrapassar o tamanho-alvo.

```json
{
  "たべる": ["jmdict-1358280"],
  "たべもの": ["jmdict-1609560"]
}
```

#### Forma escrita

Shards roteados por hash ou faixa Unicode da primeira forma normalizada.

```json
{
  "食べる": ["jmdict-1358280"],
  "食物": ["jmdict-1609560"]
}
```

#### Romaji

Gerado pelo pipeline com uma romanização definida e versionada.

```json
{
  "taberu": ["jmdict-1358280"]
}
```

#### Português

Índice invertido de tokens normalizados. Não duplicar a entrada completa.

```json
{
  "comer": ["jmdict-1358280", "jmdict-..."],
  "alimento": ["jmdict-1609560"]
}
```

Para prefixos, o pipeline pode armazenar tokens completos e o cliente filtrar as chaves do shard apropriado.

---

## 12. Manifesto e versionamento

Exemplo:

```json
{
  "format": "mathicx-japanese-dictionary",
  "schemaVersion": 2,
  "dictionaryVersion": "2026.07.02.1",
  "generatedAt": "2026-07-02T18:00:00.000Z",
  "minimumAppVersion": "2.2.0",
  "sources": {
    "jmdict": "2026-07-01",
    "kanjidic2": "2026-07-01",
    "ptBRRevision": "1"
  },
  "defaultPack": "bootstrap-n5",
  "routes": {
    "reading": "routes/reading-routes.json",
    "written": "routes/written-routes.json",
    "romaji": "routes/romaji-routes.json",
    "pt": "routes/pt-routes.json"
  },
  "packs": {
    "bootstrap-n5": {
      "path": "packs/bootstrap-n5.json",
      "size": 123456,
      "sha256": "..."
    }
  }
}
```

Cada arquivo gerado deve registrar:

- tamanho;
- hash;
- versão do schema;
- versão da fonte;
- caminho relativo.

### 12.1 Atualização segura

1. baixar novo manifesto;
2. validar formato e versão mínima;
3. baixar pacote essencial da nova versão;
4. validar hash;
5. gravar em namespace temporário no IndexedDB;
6. trocar `activeDictionaryVersion` apenas após sucesso;
7. manter a versão anterior para rollback;
8. limpar versões antigas gradualmente.

Nunca apagar o cache ativo antes de validar o novo pacote.

---

## 13. Pipeline de geração

Criar scripts Node.js fora do runtime:

```text
scripts/dictionary/
├── download-sources.mjs
├── normalize-jmdict.mjs
├── merge-ptbr-overrides.mjs
├── generate-packs.mjs
├── generate-indexes.mjs
├── generate-entry-shards.mjs
├── generate-manifest.mjs
├── validate-dictionary.mjs
└── report-dictionary.mjs
```

### 13.1 Fluxo

```text
JMdict/KANJIDIC2
  -> normalização
  -> IDs estáveis
  -> merge das traduções pt-BR
  -> seleção do bootstrap/N5/common
  -> geração de índices
  -> geração dos shards
  -> hashes e manifesto
  -> validações
  -> publicação no GitHub Pages
```

### 13.2 Validações obrigatórias

- UTF-8 e mojibake;
- IDs duplicados;
- referências para IDs inexistentes;
- chunks vazios indevidos;
- chunks acima do limite;
- hashes do manifesto;
- schema incompatível;
- licenças e atribuições presentes;
- ausência de HTML inseguro nas definições;
- traduções pt-BR não sobrescritas por atualização automática.

### 13.3 Tamanho dos chunks

Usar orçamento configurável, não uma quantidade fixa de arquivos.

Meta inicial sugerida:

- ideal comprimido: 50 KB a 250 KB;
- máximo comprimido: 500 KB;
- chunks maiores devem ser subdivididos;
- evitar milhares de arquivos minúsculos.

Os limites são critérios de engenharia e podem ser ajustados após medições reais.

---

## 14. Cache IndexedDB

### 14.1 Stores

Adicionar à base existente ou criar uma base específica:

```text
dictionary_meta
  key: name

dictionary_chunks
  key: [version, path]
  indexes: version, lastAccessedAt, kind

dictionary_entries
  key: [version, entryId]
  indexes: version, shard

dictionary_packs
  key: [version, packId]

dictionary_failures
  key: [version, path]
```

Não misturar cache público descartável com dados pessoais sem uma separação clara.

### 14.2 Política de cache

- cache-first para chunks válidos da versão ativa;
- network fallback quando ausente;
- stale-while-revalidate somente para manifesto;
- LRU para chunks opcionais;
- pacote essencial protegido da limpeza automática;
- botão de limpeza manual;
- exibição do espaço aproximado;
- tratamento de `QuotaExceededError`;
- solicitar persistência com `navigator.storage.persist()` quando suportado;
- nunca depender do cache para preservar favoritos/SRS.

### 14.3 Offline

Sem Service Worker, o app funciona offline apenas com arquivos já disponíveis no cache do navegador/IndexedDB.

Adicionar posteriormente:

- “Baixar pacote N5”;
- “Baixar palavras comuns”;
- “Baixar dicionário completo”;
- progresso e cancelamento;
- estimativa de espaço;
- remoção por pacote;
- Service Worker/PWA como fase separada.

---

## 15. Fluxo de pesquisa

### 15.1 Inicialização

```text
abrir Japanese Study
  -> carregar bootstrap-n5 da memória/IndexedDB
  -> renderizar UI útil
  -> carregar manifesto em segundo plano
  -> aguardar Firebase Auth
  -> carregar progresso local
  -> carregar progresso remoto
  -> mesclar por updatedAt/schemaVersion
```

O dicionário não deve esperar a autenticação para mostrar conteúdo público já local.

### 15.2 Classificação da consulta

```javascript
classifyQuery(query)
// kana | kanji-or-mixed | romaji | portuguese | empty
```

Normalizações:

- Unicode NFKC;
- espaços repetidos;
- lowercase para romaji/português;
- remoção opcional de acentos apenas para índice auxiliar;
- katakana para hiragana no roteamento de leitura;
- romaji para kana quando aplicável;
- preservar a consulta original para exibição.

### 15.3 Busca

```text
query
  -> debounce
  -> cancelar pesquisa anterior
  -> classificar
  -> consultar bootstrap/memória
  -> localizar 1 a 3 index chunks relevantes
  -> obter IDs
  -> ordenar e limitar
  -> carregar somente entry shards necessários
  -> armazenar no IndexedDB
  -> renderizar resultados
```

Não impor a regra absoluta “um chunk por busca”. O correto é carregar **somente os chunks necessários**, com:

- concorrência máxima configurável, inicialmente 3;
- limite de resultados, inicialmente 20 ou 30;
- geração/ID da pesquisa para ignorar respostas antigas;
- `AbortController` para fetch quando possível;
- debounce entre 150 e 300 ms;
- busca remota ampliada somente após query mínima ou ação explícita.

### 15.4 Consultas curtas

Para consultas de um único caractere:

- retornar resultados do bootstrap imediatamente;
- permitir busca exata por kana/kanji;
- não baixar grande quantidade de índices por português com uma letra;
- exigir pelo menos dois caracteres para busca ampliada por português/romaji, salvo `Enter`.

### 15.5 Filtros JLPT e categoria

Não abrir todos os chunks para filtrar.

Gerar listas de IDs/packs específicos:

```text
packs/jlpt-n5.json
packs/jlpt-n4.json
indexes/meta/common.json
indexes/meta/pos-v1.json
```

`getByJlpt('N5')` instala ou consulta o pack correspondente.

---

## 16. Sincronização de dados do Japanese Study

### 16.1 Repositories

```text
Applications/japanese-study/js/data/
├── progress-repository.js
├── local-progress-repository.js
├── firestore-progress-repository.js
├── hybrid-progress-repository.js
├── settings-repository.js
└── migration-runner.js
```

O `DictionaryProvider` é separado dos repositories de progresso.

### 16.2 Fluxo de merge

```text
abrir app
  -> progresso local imediato
  -> auth ready
  -> progresso remoto
  -> normalizar schemas
  -> merge determinístico
  -> salvar estado convergido
```

Regras iniciais:

- `updatedAt` do servidor para documentos remotos;
- `schemaVersion` em registros;
- SRS mesclado por item, não por snapshot global;
- favoritos como documentos ou mapa pequeno, conforme volume medido;
- histórico com retenção/limite;
- escrita com debounce;
- listener em tempo real somente se houver uma necessidade concreta.

---

## 17. Feature flags

```javascript
export const featureFlags = {
  authMode: 'local', // local | firebase
  firebaseEnabled: false,

  firestoreDesktopReadEnabled: false,
  firestoreDesktopWriteEnabled: false,

  firestoreJapaneseReadEnabled: false,
  firestoreJapaneseWriteEnabled: false,

  dictionaryProviderV2Enabled: false,
  dictionaryRemoteManifestEnabled: false,
  dictionaryChunkLoadingEnabled: false,
  dictionaryOfflinePacksEnabled: false,

  localMigrationEnabled: false,
  localFallbackEnabled: true,
};
```

Cada fase deve ativar uma flag por vez.

---

## 18. Fases de implementação

## Fase 0: Auditoria e baseline

**Responsável principal:** Codex

Entregáveis:

```text
docs/firebase-migration/FIREBASE_AUDIT.md
docs/firebase-migration/DICTIONARY_AUDIT.md
```

Mapear:

- todos os usos de LocalStorage/IndexedDB;
- stores e schemas existentes;
- gate de autenticação do kernel;
- comportamento do admin local;
- integração do iframe;
- `dictionary.js`, `search.js` e chamadas da UI;
- tamanho e formato dos JSON atuais;
- testes existentes;
- métricas atuais de abertura e busca.

Critério de aceite:

- nenhum código de produção alterado;
- mapa claro das dependências;
- baseline registrado.

## Fase 1: Infraestrutura Firebase zero-build

**Responsáveis:** Codex + intervenção do proprietário

Codex:

- criar módulos Firebase;
- criar config example/local/prod;
- criar feature flags;
- criar `firebase.json`, `firestore.rules`, `firestore.indexes.json`;
- preparar emuladores.

Proprietário:

- criar projeto Firebase;
- registrar Web App;
- fornecer config;
- criar Firestore;
- ativar Authentication.

Critério de aceite:

- Firebase inicializa com flag desligada sem quebrar o desktop;
- emuladores podem ser usados localmente.

## Fase 2: Firebase Auth em paralelo

**Responsável principal:** Codex

- implementar provider Firebase;
- cadastro, login, logout e restore;
- `onAuthStateChanged`;
- manter provider local atrás da flag;
- testes de troca de conta e logout.

Critério de aceite:

- fluxo Firebase funciona sem decidir ainda o gate principal.

## Fase 3: Troca da fonte de identidade

**Responsáveis:** Codex + validação do proprietário

- `authMode: 'firebase'` passa a usar somente Firebase Auth;
- não restaurar sessão local;
- limpar memória ao trocar usuário;
- fechar/bloquear apps protegidos no logout;
- criar/mesclar `users/{uid}`.

Critério de aceite:

- nenhum estado do usuário anterior aparece após troca de conta.

## Fase 4: Rules, emuladores e deploy

**Responsáveis:** Codex + proprietário

- testes owner/other/anonymous/admin;
- paths desconhecidos negados;
- regras versionadas;
- publicação manual/CLI pelo proprietário.

Critério de aceite:

- usuário A não lê/escreve dados de B;
- não autenticado não acessa dados pessoais.

## Fase 5: Dados leves do desktop

**Responsável principal:** Codex

Migrar primeiro:

- tema;
- fixados;
- favoritos;
- configurações estáveis.

Não migrar o explorer inteiro nesta fase.

## Fase 6: Firebase dentro do Japanese Study

**Responsável principal:** Codex

- inicialização Firebase própria no iframe;
- observar Auth;
- repositories local/Firestore/híbrido;
- progresso, favoritos e configurações;
- migração local após login;
- manter app funcional sem rede.

## Fase 7: Abstração do dicionário

**Responsável principal:** Codex

Antes de trocar os dados:

- criar `DictionaryProvider`;
- encapsular `dictionary.json` atual como `LegacyDictionarySource`;
- adaptar UI e busca para consumir provider;
- preservar todos os recursos existentes.

Critério de aceite:

- comportamento visual idêntico usando a nova facade.

## Fase 8: Pipeline e pacote essencial

**Responsáveis:** Codex + revisão do proprietário

- importar fonte escolhida;
- normalizar entradas;
- preservar licenças;
- aplicar traduções pt-BR próprias;
- gerar `bootstrap-n5`;
- validar dados;
- comparar com o dicionário atual.

Proprietário revisa:

- traduções N5;
- categorias;
- atribuição/licença;
- conteúdo exibido.

## Fase 9: Índices, shards e cache

**Responsável principal:** Codex

- gerar entry shards;
- gerar índices por leitura/escrita/romaji/pt;
- gerar routes e manifesto;
- implementar cache IndexedDB;
- lazy loading;
- cancelamento/concorrência;
- métricas e tratamento de falhas.

## Fase 10: Publicação no GitHub Pages

**Responsáveis:** Codex + proprietário

- workflow gera/valida dicionário;
- workflow gera config Firebase de produção ou usa arquivo versionado;
- upload do artifact estático;
- deploy Pages;
- validação da URL pública;
- domínio autorizado no Firebase Auth.

## Fase 11: Manifesto remoto e atualização

**Responsável principal:** Codex

- ler `publicData/dictionary` opcionalmente;
- comparar versões;
- atualização transacional;
- rollback;
- limpeza gradual.

## Fase 12: Pacotes offline e PWA

**Responsável principal:** Codex

- instalar/remover packs;
- indicador de tamanho;
- persistência de armazenamento;
- Service Worker opcional;
- testes offline.

## Fase 13: Evoluções opcionais

Somente quando necessário:

- Cloud Storage para releases;
- painel editorial;
- Firestore como fonte administrativa + bundles;
- Algolia/Meilisearch para fuzzy search amplo;
- App Check com enforcement gradual;
- custom claims/admin script;
- projeto dev separado;
- bundler.

---

## 19. GitHub Actions

O runtime continua estático, mas o workflow pode executar validações e geração.

Pipeline recomendado:

```text
checkout
  -> setup Node
  -> check mojibake
  -> testes
  -> gerar dicionário
  -> validar manifesto/hashes
  -> gerar firebase-config.prod.js, se aplicável
  -> preparar artifact
  -> upload Pages artifact
  -> deploy Pages
```

Não incluir no artifact:

- fontes brutas gigantes não usadas em runtime;
- scripts administrativos com credenciais;
- service account;
- arquivos `.env` locais;
- backups pessoais;
- relatórios temporários.

---

## 20. Metas de performance

Medir em conexão normal e com throttling.

Metas iniciais, sujeitas a ajuste:

- interface útil sem esperar o Firebase;
- busca no bootstrap em menos de 100 ms em máquina comum;
- busca em chunk já cacheado em menos de 150 ms;
- primeira busca que baixa chunk com feedback visual imediato;
- no máximo 3 downloads de chunks simultâneos;
- nenhum request Firestore por tecla;
- nenhum download monolítico do dicionário completo na inicialização;
- pacote essencial pequeno o bastante para não bloquear a abertura;
- memória liberada quando chunks deixam de ser usados;
- falha de rede não apaga resultados/cache anterior.

Registrar métricas reais em:

```text
docs/DICTIONARY_PERFORMANCE_REPORT.md
```

---

## 21. Testes obrigatórios

### 21.1 Autenticação

- cadastro;
- login/logout;
- restore;
- troca de conta;
- reload do desktop;
- reload do iframe;
- logout com iframe aberto;
- sessão expirada.

### 21.2 Firestore Rules

- owner permitido;
- outro uid negado;
- anônimo negado;
- admin claim permitido apenas no path previsto;
- tentativa de autopromoção negada;
- path não declarado negado.

### 21.3 Dicionário

- kana;
- katakana;
- romaji;
- kanji;
- forma mista;
- português com e sem acento;
- prefixo;
- palavra exata;
- JLPT;
- favoritos/histórico;
- chunk cacheado;
- chunk ausente;
- 404;
- hash inválido;
- manifesto inválido;
- versão incompatível;
- quota IndexedDB;
- offline;
- atualização e rollback;
- caracteres japoneses sem mojibake.

### 21.4 Regressão

- SRS;
- quiz;
- escrita;
- backup/importação;
- dashboard;
- widget futuro;
- deep links;
- comunicação host/iframe.

---

## 22. Estratégia de rollback

- flags desligam Auth/Firestore/dicionário V2 separadamente;
- `LegacyDictionarySource` permanece por uma versão estável;
- versão anterior do dicionário permanece no IndexedDB;
- deploy anterior do GitHub Pages pode ser restaurado;
- regras Firestore ficam versionadas;
- migrações usam marcadores idempotentes;
- nenhuma migração apaga dados locais imediatamente.

---

## 23. Critérios de conclusão

A implementação é considerada pronta quando:

- Firebase Auth é a única identidade no modo Firebase;
- desktop e iframe reconhecem o mesmo usuário;
- regras impedem vazamento entre usuários;
- dados pessoais sincronizam sem bloquear abertura;
- dicionário abre com pacote essencial local;
- busca não consulta Firestore por tecla;
- chunks são baixados sob demanda e cacheados;
- busca funciona por kana, romaji, escrita e português;
- filtros JLPT usam packs/índices próprios;
- atualização do manifesto é segura e reversível;
- falha de rede preserva o que já está local;
- licenças e atribuições aparecem na aplicação;
- GitHub Pages publica a estrutura sem quebrar caminhos de iframe;
- existe documentação das ações manuais do proprietário.

---

## 24. Instrução final para o Codex

Antes de implementar cada fase:

1. ler este documento;
2. ler `docs/firebase-migration/firebase-migration.md`;
3. ler o README do Mathicx-File;
4. ler a documentação do Japanese Study;
5. auditar o código real, sem presumir nomes de funções;
6. implementar apenas a fase solicitada;
7. preservar compatibilidade e feature flags;
8. adicionar testes e documentação;
9. listar claramente qualquer ação manual necessária;
10. não avançar silenciosamente para Cloud Storage, App Check, custom claims ou bundler.

A implementação deve privilegiar simplicidade mensurável. O objetivo não é construir uma catedral de serviços, mas uma biblioteca rápida, modular e fácil de atualizar.

---

## 25. Referências oficiais

Consultadas em 2026-07-02:

- Firebase Web Setup: https://firebase.google.com/docs/web/setup
- Firebase Authentication Web: https://firebase.google.com/docs/auth/web/start
- Firebase Auth persistence: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Firestore Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Firebase API keys: https://firebase.google.com/docs/projects/api-keys
- Firebase Emulator Suite: https://firebase.google.com/docs/emulator-suite/install_and_configure
- Firebase App Check Web: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- GitHub Pages custom workflows: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
