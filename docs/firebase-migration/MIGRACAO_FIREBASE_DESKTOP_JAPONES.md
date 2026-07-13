# Plano de Migração para Firebase

> Status documental: referencia historica e tecnica.
>
> A numeracao oficial atual esta em [FIREBASE_ROADMAP_OFICIAL.md](FIREBASE_ROADMAP_OFICIAL.md).

## Desktop virtual com aplicação de estudos de japonês

**Versão:** 1.0  
**Data:** 02 de julho de 2026  
**Público-alvo:** Codex e desenvolvedores responsáveis pelo projeto  
**Status:** Especificação de implementação

---

## 1. Objetivo

Migrar gradualmente o desktop virtual e a aplicação de estudos de japonês para uma arquitetura baseada em Firebase, mantendo o projeto compatível com hospedagem no GitHub Pages.

A migração deve introduzir:

- autenticação centralizada no desktop virtual;
- uma única sessão para acessar a aplicação de japonês e os demais aplicativos internos;
- armazenamento remoto dos dados pessoais e do progresso de cada usuário;
- sincronização entre dispositivos;
- regras de segurança que impeçam um usuário de acessar os dados de outro;
- compatibilidade temporária com o armazenamento local atual, identificado no projeto como `StorageDB`;
- possibilidade de expansão futura para novos aplicativos dentro do desktop;
- implantação estática no GitHub Pages.

A implementação deve ocorrer em fases pequenas, testáveis e reversíveis.

---

## 2. Decisão arquitetural principal

### 2.1 Não criar um Firebase “dentro” de outro

O desktop virtual e a aplicação de estudos de japonês devem utilizar o mesmo projeto Firebase em cada ambiente.

Estrutura recomendada:

```text
GitHub Pages
└── Desktop virtual
    ├── autenticação
    ├── gerenciador de sessão
    ├── menu de aplicativos
    ├── aplicação de japonês
    └── outros aplicativos
             │
             ▼
Projeto Firebase compartilhado
├── Authentication
├── Cloud Firestore
├── Security Rules
├── App Check, em fase posterior
└── Storage, somente se necessário
```

Não criar um projeto Firebase separado para cada aplicativo interno sem uma necessidade real de isolamento administrativo, financeiro ou legal.

### 2.2 Um projeto por ambiente

Utilizar projetos distintos para desenvolvimento e produção:

```text
virtual-desktop-dev
└── desenvolvimento, testes e emuladores

virtual-desktop-prod
└── versão publicada no GitHub Pages
```

O desktop e a aplicação de japonês compartilham o Firebase do ambiente ativo.

### 2.3 Autenticação pertence ao desktop

A autenticação deve ser inicializada pelo núcleo do desktop virtual. Os aplicativos internos não devem possuir telas de login independentes, salvo quando executados isoladamente em modo de desenvolvimento.

A aplicação de japonês deve receber ou consultar o estado autenticado por meio do módulo central de sessão.

---

## 3. Arquitetura de dados recomendada

### 3.1 Dados que devem ir para o Firestore

Armazenar no Firestore dados pequenos, dinâmicos e vinculados ao usuário:

- perfil do usuário;
- preferências do desktop;
- aplicativos habilitados ou instalados;
- progresso em hiragana e katakana;
- progresso em kanji;
- favoritos;
- histórico de estudo;
- configurações da aplicação de japonês;
- dados de repetição espaçada, caso implementada;
- listas personalizadas;
- metadados de migração.

### 3.2 Dados que não devem ser migrados inicialmente para o Firestore

Não utilizar o Firestore como primeira opção para distribuir o dicionário completo, JMdict, KANJIDIC2 ou arquivos KanjiVG.

Esses dados são grandes, majoritariamente públicos e pouco alterados por usuário. A estratégia preferencial é:

```text
Dicionário e dados linguísticos
├── JSON versionado e compactado
├── arquivos estáticos publicados no GitHub Pages ou CDN
├── cache em IndexedDB
└── atualização controlada por versão

Firestore
├── progresso do usuário
├── favoritos
├── listas pessoais
├── estatísticas
└── correções ou extensões próprias do projeto
```

O `StorageDB` atual pode continuar sendo utilizado como cache ou camada local durante a migração.

---

## 4. Estrutura sugerida do Firestore

```text
users/{uid}
├── displayName
├── email
├── photoURL
├── createdAt
├── updatedAt
├── schemaVersion
└── lastLoginAt

users/{uid}/desktop/settings
users/{uid}/desktop/installedApps/{appId}

users/{uid}/japanese/settings/main
users/{uid}/japanese/kanaProgress/{kanaId}
users/{uid}/japanese/kanjiProgress/{kanjiId}
users/{uid}/japanese/favorites/{entryId}
users/{uid}/japanese/reviews/{reviewId}
users/{uid}/japanese/customLists/{listId}
users/{uid}/japanese/customLists/{listId}/items/{entryId}
users/{uid}/migrations/{migrationId}

appCatalog/{appId}
appConfig/japanese
```

### 4.1 Regras para os identificadores

- Utilizar o `uid` fornecido pelo Firebase Authentication como identificador do usuário.
- Utilizar IDs determinísticos para progresso e favoritos sempre que possível.
- Não utilizar e-mail como chave de documento.
- Não salvar senhas, tokens ou credenciais no Firestore.
- Incluir `schemaVersion` em documentos que possam sofrer migrações futuras.
- Utilizar timestamps do servidor para `createdAt` e `updatedAt`.

### 4.2 Exemplos de IDs determinísticos

```text
Kana: hiragana-a
Kana: katakana-ka
Kanji: U+65E5 ou o próprio caractere normalizado
Palavra: identificador original do JMdict
Aplicativo: japanese-study
```

---

## 5. Organização sugerida do código

O Codex deve adaptar os caminhos à estrutura já existente e não deve migrar o projeto para outro framework sem solicitação explícita.

```text
src/
├── core/
│   ├── firebase/
│   │   ├── firebase-config.js
│   │   ├── firebase-client.js
│   │   ├── firebase-emulators.js
│   │   └── index.js
│   ├── auth/
│   │   ├── auth-service.js
│   │   ├── auth-store.js
│   │   ├── auth-guard.js
│   │   └── index.js
│   ├── data/
│   │   ├── repositories/
│   │   ├── migrations/
│   │   └── schema/
│   └── apps/
│       └── app-registry.js
│
├── apps/
│   └── japanese-study/
│       ├── data/
│       │   ├── japanese-repository.js
│       │   ├── local-japanese-repository.js
│       │   ├── firestore-japanese-repository.js
│       │   └── dictionary-repository.js
│       ├── services/
│       └── ui/
│
├── data/
│   ├── dictionary/
│   ├── kanji/
│   └── versions.json
│
└── main.js

firestore.rules
firestore.indexes.json
firebase.json
.firebaserc
.env.example
```

Caso o projeto não utilize uma pasta `src`, preservar a organização atual e aplicar apenas a separação lógica equivalente.

---

## 6. Contrato de execução para o Codex

Antes de alterar o código, o Codex deve:

1. Ler o `README.md` e toda a documentação técnica existente.
2. Identificar a stack, o processo de build e o método atual de publicação.
3. Localizar todas as referências a `StorageDB`, `localStorage`, `IndexedDB` e serviços equivalentes.
4. Identificar como a aplicação de japonês é carregada pelo desktop.
5. Verificar se o aplicativo interno é um módulo, uma rota, uma janela simulada ou um `iframe`.
6. Executar os testes e o build existentes antes da primeira alteração.
7. Registrar o estado inicial em um relatório de auditoria.

Regras permanentes de implementação:

- não remover o `StorageDB` na primeira fase;
- não reescrever todo o projeto;
- não introduzir um novo framework sem necessidade;
- não adicionar chaves administrativas ao frontend;
- não adicionar arquivos de conta de serviço ao repositório;
- não confiar no frontend para autorização;
- implementar regras do Firestore antes de habilitar escrita em produção;
- concluir uma fase antes de iniciar a próxima;
- produzir commits pequenos e descritivos;
- manter um caminho de rollback.

---

# Fases da migração

## Fase 0: Auditoria e linha de base

### Objetivo

Compreender o projeto atual sem alterar seu comportamento.

### Instruções para o Codex

1. Mapear a estrutura do repositório.
2. Identificar a tecnologia usada para build, caso exista.
3. Identificar o ponto de entrada do desktop.
4. Identificar o ponto de entrada da aplicação de japonês.
5. Documentar como o desktop abre aplicativos internos.
6. Localizar o código responsável pelo usuário atual, caso já exista.
7. Inventariar todas as chaves, stores e tabelas utilizadas pelo `StorageDB`.
8. Criar exemplos anônimos do formato atual dos dados.
9. Executar build, lint e testes.
10. Criar o arquivo `docs/firebase-migration-audit.md`.

### Entregáveis

- mapa dos módulos afetados;
- inventário do armazenamento local;
- modelo atual dos dados;
- comandos de build e teste;
- riscos encontrados;
- lista de arquivos que serão alterados nas próximas fases.

### Critérios de aceite

- o comportamento da aplicação não foi alterado;
- o projeto continua compilando e executando;
- todas as utilizações do armazenamento local estão documentadas;
- está claro se o aplicativo de japonês roda no mesmo contexto da página ou em `iframe`.

---

## Fase 1: Preparação dos ambientes Firebase

### Objetivo

Preparar desenvolvimento e produção sem ainda substituir o armazenamento atual.

### Tarefas manuais no console Firebase

1. Criar o projeto `virtual-desktop-dev`.
2. Criar posteriormente o projeto `virtual-desktop-prod`.
3. Registrar uma aplicação Web em cada projeto.
4. Habilitar Firebase Authentication.
5. Habilitar inicialmente Email/Senha ou Google, conforme decisão do projeto.
6. Criar o banco Cloud Firestore.
7. Não utilizar regras abertas em produção.
8. Adicionar o domínio do GitHub Pages aos domínios autorizados do Authentication.
9. Adicionar também o domínio personalizado, caso exista.

Exemplo de domínio:

```text
seu-usuario.github.io
```

### Instruções para o Codex

1. Adicionar o SDK modular do Firebase à stack atual.
2. Criar `.env.example` somente com nomes de variáveis.
3. Criar configuração separada para desenvolvimento e produção.
4. Não adicionar valores secretos ou contas de serviço.
5. Documentar que o objeto de configuração Web do Firebase é público e não substitui Security Rules.
6. Preparar `.firebaserc`, `firebase.json`, `firestore.rules` e `firestore.indexes.json`.

### Variáveis sugeridas

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_USE_FIREBASE_EMULATORS=false
```

Se o projeto não utiliza Vite, substituir o prefixo e o carregamento conforme a ferramenta existente.

### Critérios de aceite

- o SDK é carregado sem duplicar instâncias;
- as configurações de desenvolvimento e produção são independentes;
- nenhum segredo administrativo está versionado;
- o aplicativo ainda funciona com o armazenamento local.

---

## Fase 2: Cliente Firebase centralizado

### Objetivo

Criar uma única inicialização do Firebase utilizada pelo desktop e por todos os aplicativos internos.

### Exemplo de implementação

```javascript
// src/core/firebase/firebase-client.js
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

function validateFirebaseConfig(config) {
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(`Configuração Firebase incompleta: ${missing.join(", ")}`);
  }
}

validateFirebaseConfig(firebaseConfig);

export const firebaseApp = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
```

### Instruções para o Codex

1. Criar um único módulo de inicialização.
2. Proibir inicializações duplicadas em aplicativos internos.
3. Exportar apenas os serviços necessários.
4. Adicionar tratamento de configuração ausente.
5. Conectar aos emuladores apenas em desenvolvimento.
6. Não importar Firebase diretamente em componentes de UI quando puder ser usado um serviço ou repositório.

### Critérios de aceite

- existe apenas uma instância Firebase por página;
- desktop e aplicação de japonês usam o mesmo `auth` e o mesmo `db`;
- o build falha de maneira compreensível quando a configuração está incompleta;
- a aplicação não acessa produção quando o modo de emulador está habilitado.

---

## Fase 3: Autenticação central do desktop

### Objetivo

Fazer o login no desktop virtual e manter uma única sessão para os aplicativos internos.

### Funcionalidades mínimas

- cadastro;
- login;
- logout;
- observação do estado de autenticação;
- estado de carregamento inicial;
- tratamento de erros;
- recuperação de senha, se Email/Senha for usado;
- persistência de sessão;
- criação ou atualização do documento de perfil no primeiro login.

### Estado de autenticação sugerido

```javascript
{
  status: "loading" | "authenticated" | "unauthenticated" | "error",
  user: null | {
    uid: "...",
    displayName: "...",
    email: "...",
    photoURL: "..."
  },
  error: null | Error
}
```

### Instruções para o Codex

1. Criar `auth-service` desacoplado da interface.
2. Criar `auth-store` ou mecanismo equivalente compatível com a stack atual.
3. Utilizar `onAuthStateChanged` como fonte principal da sessão.
4. Não considerar a sessão pronta antes da primeira resposta do observador.
5. Criar uma tela de carregamento para evitar piscar o desktop antes da validação.
6. Redirecionar usuários não autenticados para a tela de login.
7. Criar o documento `users/{uid}` com `merge`, sem sobrescrever dados existentes.
8. Sanitizar mensagens de erro exibidas ao usuário.
9. Não registrar tokens em console.

### GitHub Pages e provedores OAuth

Para a primeira versão, priorizar:

- Email/Senha; ou
- Google com `signInWithPopup`.

Caso seja utilizado `signInWithRedirect` em hospedagem diferente do Firebase Hosting, seguir as recomendações oficiais para navegadores que restringem armazenamento entre origens.

### Critérios de aceite

- usuário não autenticado não acessa o desktop;
- login permanece após recarregar a página, conforme política escolhida;
- logout encerra a sessão e fecha aplicativos protegidos;
- a aplicação de japonês reconhece o mesmo `uid` do desktop;
- erros de autenticação não quebram a interface.

---

## Fase 4: Controle de acesso aos aplicativos internos

### Objetivo

Garantir que a aplicação de japonês só seja aberta após a autenticação.

### Instruções para o Codex

1. Criar um `authGuard` reutilizável.
2. Integrar o guard ao registro ou launcher de aplicativos.
3. Fechar ou bloquear aplicativos protegidos quando ocorrer logout.
4. Definir no catálogo quais aplicativos exigem autenticação.
5. Evitar duplicar a lógica de autenticação dentro de cada aplicativo.

Exemplo de catálogo:

```javascript
export const appCatalog = [
  {
    id: "japanese-study",
    name: "Estudo de Japonês",
    requiresAuth: true,
    loader: () => import("../../apps/japanese-study/index.js")
  }
];
```

### Aplicativo carregado como módulo

Esta é a opção preferencial. O aplicativo importa ou recebe os serviços centrais.

### Aplicativo carregado em `iframe` no mesmo domínio

- utilizar a mesma configuração Firebase;
- observar a sessão no contexto do `iframe`;
- não transmitir senha;
- não enviar tokens por parâmetros de URL;
- preferir caminhos sob o mesmo domínio e protocolo.

### Aplicativo carregado em outro domínio

Não assumir compartilhamento automático da sessão. Origens diferentes possuem isolamento de armazenamento. Nesse cenário, realizar uma análise específica antes de implementar comunicação por `postMessage` ou autenticação separada.

### Critérios de aceite

- o aplicativo protegido não abre durante o estado `loading`;
- usuário autenticado abre o aplicativo sem novo login;
- logout invalida o acesso do aplicativo;
- nenhum token é incluído em URL.

---

## Fase 5: Modelo do Firestore e Security Rules

### Objetivo

Criar uma base segura para dados pessoais antes de habilitar sincronização.

### Regras iniciais sugeridas

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

    match /users/{userId} {
      allow create: if isOwner(userId);
      allow read, update, delete: if isOwner(userId);

      match /{document=**} {
        allow read, write: if isOwner(userId);
      }
    }

    match /appCatalog/{appId} {
      allow read: if signedIn();
      allow write: if false;
    }

    match /appConfig/{document=**} {
      allow read: if signedIn();
      allow write: if false;
    }

    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

### Instruções para o Codex

1. Começar com negação total como regra padrão.
2. Permitir que cada usuário leia e escreva apenas em `users/{uid}`.
3. Criar testes que tentem acessar outro `uid`.
4. Não usar regras do tipo `allow read, write: if true`.
5. Adicionar validações de campos e tipos conforme o modelo estabilizar.
6. Criar índices somente quando uma consulta real exigir.
7. Versionar `firestore.rules` e `firestore.indexes.json`.

### Casos de teste obrigatórios

- usuário autenticado lê o próprio perfil;
- usuário autenticado altera o próprio progresso;
- usuário A não lê dados do usuário B;
- usuário A não grava dados do usuário B;
- usuário não autenticado não lê dados pessoais;
- cliente não escreve em `appCatalog`;
- caminhos desconhecidos são negados.

### Critérios de aceite

- todos os testes de regras passam no emulador;
- não existe coleção pessoal acessível publicamente;
- a UI trata `permission-denied` sem travar;
- escrita em produção permanece desabilitada até a aprovação dos testes.

---

## Fase 6: Camada de repositório e compatibilidade com StorageDB

### Objetivo

Desacoplar a aplicação de japonês da tecnologia de armazenamento.

A interface da aplicação não deve chamar diretamente `StorageDB` ou Firestore.

### Contrato sugerido

```javascript
export class JapaneseStudyRepository {
  async getSettings() {
    throw new Error("Not implemented");
  }

  async saveSettings(settings) {
    throw new Error("Not implemented");
  }

  async listKanaProgress() {
    throw new Error("Not implemented");
  }

  async saveKanaProgress(kanaId, progress) {
    throw new Error("Not implemented");
  }

  async listKanjiProgress() {
    throw new Error("Not implemented");
  }

  async saveKanjiProgress(kanjiId, progress) {
    throw new Error("Not implemented");
  }

  async listFavorites() {
    throw new Error("Not implemented");
  }

  async setFavorite(entryId, favorite) {
    throw new Error("Not implemented");
  }
}
```

### Implementações previstas

```text
LocalJapaneseRepository
└── adapta o StorageDB atual

FirestoreJapaneseRepository
└── usa users/{uid}/japanese/*

HybridJapaneseRepository
└── coordena leitura local, sincronização e fallback
```

### Instruções para o Codex

1. Criar primeiro o adaptador local sem modificar o comportamento atual.
2. Substituir chamadas diretas ao `StorageDB` pelo contrato de repositório.
3. Confirmar que a aplicação continua funcionando somente localmente.
4. Implementar o repositório Firestore em seguida.
5. Injetar o repositório no aplicativo.
6. Não usar singleton global oculto quando a stack permitir injeção explícita.
7. Criar testes de contrato executados contra as implementações local e remota.

### Critérios de aceite

- a UI não conhece Firestore;
- a UI não conhece detalhes do `StorageDB`;
- o modo local continua funcional;
- trocar o repositório não exige reescrever componentes visuais.

---

## Fase 7: Migração dos dados locais do usuário

### Objetivo

Copiar os dados pessoais existentes do `StorageDB` para o Firestore de maneira idempotente e recuperável.

### Princípios

- não apagar os dados locais imediatamente;
- nunca migrar dados sem usuário autenticado;
- validar e normalizar os dados antes da escrita;
- permitir executar novamente sem criar duplicatas;
- registrar a versão da migração;
- interromper com segurança em caso de erro;
- fornecer resumo do resultado.

### Fluxo sugerido

```text
Usuário realiza login
        ↓
Verificar users/{uid}/migrations/storage-db-v1
        ↓
Migração já concluída?
   ├── sim: carregar dados remotos
   └── não: detectar dados locais
                   ↓
             validar e transformar
                   ↓
             gravar no Firestore
                   ↓
             conferir contagens
                   ↓
             gravar marcador de sucesso
                   ↓
             manter backup local
```

### Documento de migração

```javascript
{
  id: "storage-db-v1",
  status: "completed",
  source: "StorageDB",
  schemaVersion: 1,
  migratedAt: serverTimestamp(),
  counts: {
    kanaProgress: 92,
    kanjiProgress: 80,
    favorites: 15
  }
}
```

### Instruções para o Codex

1. Criar uma função de exportação do formato local atual.
2. Criar transformadores puros para cada tipo de dado.
3. Validar IDs e remover valores indefinidos.
4. Utilizar IDs determinísticos.
5. Dividir operações grandes em grupos seguros.
6. Registrar erros por categoria, sem incluir dados sensíveis.
7. Comparar a quantidade lida com a quantidade gravada.
8. Marcar a migração como concluída somente após validação.
9. Não excluir o armazenamento local automaticamente.
10. Adicionar uma ação manual “Restaurar dados locais” durante o período de transição.

### Estratégia de conflito inicial

Para a primeira migração:

- se o documento remoto não existe, copiar o local;
- se ambos existem, escolher o registro com `updatedAt` mais recente;
- se o dado local não possui data, não sobrescrever automaticamente um registro remoto existente;
- registrar conflitos para revisão.

### Critérios de aceite

- executar a migração duas vezes não duplica documentos;
- falha parcial não marca a migração como concluída;
- dados locais permanecem disponíveis após a migração;
- contagens locais e remotas são conferidas;
- usuário recebe uma mensagem clara de sucesso ou erro.

---

## Fase 8: Sincronização da aplicação de japonês

### Objetivo

Utilizar Firestore como fonte sincronizada dos dados do usuário, preservando funcionamento local e resiliência.

### Estratégia recomendada

1. Ler inicialmente do cache local para abertura rápida.
2. Consultar o Firestore após a sessão estar pronta.
3. Mesclar os dados conforme regras definidas.
4. Atualizar a interface.
5. Persistir localmente a última versão válida.
6. Gravar alterações no Firestore.
7. Manter fila local quando estiver offline, conforme a abordagem escolhida.

### Instruções para o Codex

1. Não bloquear o carregamento do dicionário aguardando progresso remoto.
2. Separar claramente “conteúdo do dicionário” de “estado do usuário”.
3. Implementar estados `loading`, `ready`, `offline` e `error`.
4. Evitar listeners em tempo real onde uma leitura simples é suficiente.
5. Cancelar listeners quando a janela do aplicativo for fechada.
6. Evitar uma escrita a cada evento de digitação.
7. Aplicar debounce em preferências e progresso quando adequado.
8. Garantir que logout descarte dados em memória do usuário anterior.

### Critérios de aceite

- progresso salvo em um navegador aparece em outro após login;
- a aplicação abre mesmo quando o Firestore está temporariamente indisponível, desde que exista cache local;
- logout remove dados pessoais da interface;
- o dicionário continua funcionando independentemente da sincronização do usuário.

---

## Fase 9: Estratégia do dicionário e KanjiVG

### Objetivo

Preparar o projeto para um dicionário maior sem transformar o Firestore em um distribuidor de arquivos estáticos.

### Estrutura sugerida

```text
public/data/japanese/
├── manifest.json
├── dictionary/
│   ├── common-01.json.gz
│   ├── common-02.json.gz
│   └── n5.json.gz
├── kanji/
│   ├── n5.json.gz
│   └── metadata.json.gz
└── kanjivg/
    └── ...
```

### Manifesto sugerido

```json
{
  "schemaVersion": 1,
  "dictionaryVersion": "2026-07-02",
  "kanjiVersion": "2026-07-02",
  "kanjiVgVersion": "2026-07-02",
  "chunks": [
    {
      "id": "n5",
      "url": "./dictionary/n5.json.gz",
      "sha256": "SUBSTITUIR_DURANTE_BUILD"
    }
  ]
}
```

### Instruções para o Codex

1. Manter o KanjiVG como ativo estático ou dado cacheável.
2. Criar `DictionaryRepository` separado do repositório de progresso.
3. Ler o manifesto antes de baixar novos pacotes.
4. Armazenar pacotes processados em IndexedDB.
5. Atualizar somente quando a versão mudar.
6. Preservar as informações de licença e atribuição.
7. Preparar scripts de geração de dados, mas não executar importação completa sem revisão do tamanho final.
8. Não enviar todo o dicionário em um único arquivo se isso prejudicar carregamento e memória.

### Critérios de aceite

- o aplicativo pode atualizar dados linguísticos sem alterar o Firestore;
- o cache possui controle de versão;
- o usuário não baixa novamente arquivos inalterados;
- a origem e a licença de cada base estão documentadas.

---

## Fase 10: Firebase Local Emulator Suite e testes

### Objetivo

Testar autenticação, Firestore e regras sem utilizar dados de produção.

### Configuração sugerida

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "auth": {
      "port": 9099
    },
    "firestore": {
      "port": 8080
    },
    "ui": {
      "enabled": true,
      "port": 4000
    },
    "singleProjectMode": true
  }
}
```

### Conexão em desenvolvimento

```javascript
import { connectAuthEmulator } from "firebase/auth";
import { connectFirestoreEmulator } from "firebase/firestore";
import { auth, db } from "./firebase-client.js";

let connected = false;

export function connectFirebaseEmulators() {
  if (connected || !import.meta.env.DEV) return;
  if (import.meta.env.VITE_USE_FIREBASE_EMULATORS !== "true") return;

  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true
  });

  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connected = true;
}
```

### Testes obrigatórios

#### Autenticação

- cadastro válido;
- login válido;
- senha incorreta;
- logout;
- restauração da sessão;
- bloqueio do desktop durante estado inicial.

#### Firestore

- CRUD do próprio progresso;
- tentativa de acesso a outro usuário;
- migração idempotente;
- conflito entre dado local e remoto;
- comportamento offline;
- limpeza de estado após logout.

#### Aplicação de japonês

- carregamento local sem Firebase;
- carregamento autenticado;
- favoritos sincronizados;
- progresso sincronizado;
- dicionário independente do Firestore;
- troca entre dois usuários no mesmo navegador.

### Critérios de aceite

- testes não dependem do projeto de produção;
- regras são verificadas automaticamente;
- o ambiente local pode ser iniciado por um único comando documentado;
- o Codex inclui instruções de teste no `README.md`.

---

## Fase 11: Implantação no GitHub Pages

### Objetivo

Publicar o frontend estático no GitHub Pages e conectá-lo ao Firebase de produção.

### Requisitos

- o projeto final deve gerar HTML, CSS, JavaScript e ativos estáticos;
- qualquer processamento de Node.js ocorre durante o build, não no servidor do GitHub Pages;
- o caminho base do repositório deve ser considerado;
- rotas devem ser compatíveis com hospedagem estática;
- o domínio deve estar autorizado no Firebase Authentication.

### Cuidados com caminho base

Para um site de projeto:

```text
https://usuario.github.io/nome-do-repositorio/
```

Os ativos não podem assumir que o site está hospedado na raiz `/`.

Se a aplicação for SPA, preferir uma destas opções:

1. roteamento por hash, por exemplo `#/apps/japanese`;
2. fallback `404.html` documentado;
3. navegação interna sem depender de rotas reais do servidor.

### Workflow de referência

O Codex deve adaptar o comando de build e a pasta de saída.

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build
        env:
          VITE_FIREBASE_API_KEY: ${{ secrets.VITE_FIREBASE_API_KEY }}
          VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.VITE_FIREBASE_AUTH_DOMAIN }}
          VITE_FIREBASE_PROJECT_ID: ${{ secrets.VITE_FIREBASE_PROJECT_ID }}
          VITE_FIREBASE_STORAGE_BUCKET: ${{ secrets.VITE_FIREBASE_STORAGE_BUCKET }}
          VITE_FIREBASE_MESSAGING_SENDER_ID: ${{ secrets.VITE_FIREBASE_MESSAGING_SENDER_ID }}
          VITE_FIREBASE_APP_ID: ${{ secrets.VITE_FIREBASE_APP_ID }}

      - name: Setup Pages
        uses: actions/configure-pages@v5

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: ./dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

### Observação sobre Firebase Web Config

As variáveis Web do Firebase são incluídas no bundle e podem ser vistas pelo navegador. Guardá-las em GitHub Secrets evita exposição no histórico do repositório, mas não as transforma em segredo no frontend.

A segurança depende de:

- Firebase Authentication;
- Security Rules;
- validação dos dados;
- App Check como camada adicional;
- ausência de credenciais administrativas no cliente.

### Nunca publicar

```text
serviceAccountKey.json
*.pem
*.p12
chaves privadas
refresh tokens
Firebase Admin SDK credentials
senhas
segredos de provedores OAuth
```

### Critérios de aceite

- o site abre pelo endereço final do GitHub Pages;
- ativos carregam corretamente no subdiretório;
- login funciona no domínio publicado;
- recarregar a página não causa 404;
- Firestore aplica as regras de produção;
- não existem credenciais administrativas no bundle ou repositório.

---

## Fase 12: Proteção adicional com App Check

### Objetivo

Reduzir abuso automatizado dos recursos Firebase após a aplicação estar estável.

### Instruções para o Codex

1. Implementar App Check inicialmente em modo de observação.
2. Utilizar um provedor Web suportado pelo Firebase.
3. Configurar token de depuração somente para desenvolvimento e CI.
4. Validar requisições legítimas antes de habilitar enforcement.
5. Habilitar enforcement gradualmente por produto.
6. Documentar recuperação caso usuários legítimos sejam bloqueados.

### Importante

App Check complementa, mas não substitui:

- Authentication;
- Security Rules;
- validação de campos;
- limites de uso;
- monitoramento.

### Critérios de aceite

- desenvolvimento local funciona com token de debug controlado;
- o token de debug não está no repositório;
- produção envia tokens válidos;
- enforcement só é ativado após observação.

---

## Fase 13: Rollout, monitoramento e remoção gradual do legado

### Objetivo

Ativar o Firebase sem perder dados e remover o legado somente após estabilidade comprovada.

### Etapas de rollout

1. Publicar a autenticação com o aplicativo ainda usando dados locais.
2. Publicar leitura remota em modo experimental.
3. Habilitar migração para usuários de teste.
4. Comparar contagens e comportamento.
5. Habilitar escrita remota para um grupo pequeno.
6. Ativar sincronização para todos.
7. Manter fallback local durante um período definido.
8. Remover chamadas diretas ao `StorageDB`.
9. Manter o adaptador de importação por mais uma versão.
10. Remover o legado somente após confirmação.

### Feature flags sugeridas

```javascript
{
  firebaseAuthEnabled: true,
  firestoreReadEnabled: false,
  firestoreWriteEnabled: false,
  localMigrationEnabled: false,
  localFallbackEnabled: true
}
```

### Rollback

Se ocorrer falha grave:

1. desabilitar escrita remota pela feature flag;
2. voltar a utilizar `LocalJapaneseRepository`;
3. manter os dados remotos sem apagá-los;
4. exportar logs técnicos sem dados sensíveis;
5. corrigir a causa;
6. repetir testes no emulador;
7. reativar gradualmente.

### Critérios para remover o StorageDB como fonte principal

- migração testada com diferentes perfis;
- ausência de perda de progresso;
- regras aprovadas;
- sincronização entre dispositivos validada;
- fallback testado;
- pelo menos uma versão estável publicada;
- mecanismo de exportação dos dados do usuário disponível.

---

# 14. Exemplos de documentos

## 14.1 Perfil

```json
{
  "displayName": "Usuário",
  "email": "usuario@example.com",
  "photoURL": null,
  "schemaVersion": 1,
  "createdAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "lastLoginAt": "serverTimestamp"
}
```

## 14.2 Progresso de kana

```json
{
  "kanaId": "hiragana-a",
  "status": "learning",
  "correctAnswers": 12,
  "incorrectAnswers": 3,
  "mastery": 0.8,
  "lastStudiedAt": "serverTimestamp",
  "updatedAt": "serverTimestamp",
  "schemaVersion": 1
}
```

## 14.3 Progresso de kanji

```json
{
  "kanjiId": "U+65E5",
  "character": "日",
  "jlptLevel": "N5",
  "status": "review",
  "correctAnswers": 8,
  "incorrectAnswers": 2,
  "nextReviewAt": "timestamp",
  "updatedAt": "serverTimestamp",
  "schemaVersion": 1
}
```

## 14.4 Favorito

```json
{
  "entryId": "jmdict-EXAMPLE",
  "addedAt": "serverTimestamp",
  "source": "JMdict",
  "schemaVersion": 1
}
```

Não duplicar toda a entrada do dicionário dentro do favorito. Armazenar apenas o identificador e metadados pessoais necessários.

---

# 15. Tratamento de erros

Criar erros de domínio ou resultados normalizados para evitar que a interface dependa diretamente dos códigos do Firebase.

```javascript
{
  code: "AUTH_INVALID_CREDENTIALS",
  message: "Não foi possível entrar com essas credenciais.",
  retryable: false,
  cause: originalError
}
```

Categorias mínimas:

```text
AUTH_REQUIRED
AUTH_INVALID_CREDENTIALS
AUTH_NETWORK_ERROR
DATA_PERMISSION_DENIED
DATA_NOT_FOUND
DATA_VALIDATION_ERROR
DATA_NETWORK_ERROR
MIGRATION_CONFLICT
MIGRATION_PARTIAL_FAILURE
DICTIONARY_LOAD_ERROR
```

Não exibir stack trace, tokens ou configuração interna ao usuário final.

---

# 16. Requisitos de privacidade e segurança

- coletar somente dados necessários;
- permitir exclusão ou exportação dos dados pessoais;
- não armazenar senha fora do Firebase Authentication;
- não armazenar token de autenticação manualmente;
- não registrar conteúdo sensível em logs;
- não confiar no `uid` enviado pela interface quando ele puder ser obtido da sessão;
- validar tamanho e tipo dos campos;
- limitar campos livres;
- revisar regras antes de cada publicação;
- testar troca de conta no mesmo navegador;
- limpar estado em memória após logout;
- não apagar cache compartilhado do dicionário ao trocar de usuário;
- apagar ou separar cache pessoal quando necessário.

---

# 17. Requisitos de desempenho

- carregar o SDK Firebase de forma modular;
- evitar importar produtos não utilizados;
- carregar a aplicação de japonês sob demanda;
- não carregar todo o dicionário na inicialização do desktop;
- não criar listeners permanentes desnecessários;
- agrupar escritas de progresso quando adequado;
- cachear dados linguísticos em IndexedDB;
- paginar listas grandes;
- medir tamanho do bundle antes e depois da migração;
- evitar documentos excessivamente grandes;
- não duplicar entradas completas do dicionário em cada usuário.

---

# 18. Checklist final de conclusão

## Arquitetura

- [ ] Um projeto Firebase por ambiente.
- [ ] Desktop e aplicativo de japonês compartilham Authentication.
- [ ] Firebase inicializado uma única vez.
- [ ] Aplicativos internos não possuem Firebase independente sem justificativa.

## Autenticação

- [ ] Cadastro e login funcionando.
- [ ] Sessão restaurada corretamente.
- [ ] Logout limpa o estado pessoal.
- [ ] Domínio do GitHub Pages autorizado.
- [ ] Aplicativos protegidos exigem autenticação.

## Firestore

- [ ] Estrutura por `users/{uid}` implementada.
- [ ] Regras negam acesso entre usuários.
- [ ] Testes das regras passam no emulador.
- [ ] Índices versionados.
- [ ] Nenhuma coleção pessoal pública.

## Migração

- [ ] StorageDB inventariado.
- [ ] Adaptador local implementado.
- [ ] Repositório Firestore implementado.
- [ ] Migração idempotente.
- [ ] Dados locais mantidos como backup temporário.
- [ ] Conflitos tratados.
- [ ] Marcador de migração registrado.

## Aplicação de japonês

- [ ] Progresso sincronizado.
- [ ] Favoritos sincronizados.
- [ ] Dicionário desacoplado do Firestore.
- [ ] KanjiVG continua funcionando.
- [ ] Cache local versionado.
- [ ] Troca de usuário validada.

## GitHub Pages

- [ ] Build estático gerado.
- [ ] Caminho base configurado.
- [ ] Rotas não causam 404.
- [ ] Workflow de deploy funcionando.
- [ ] Login funcionando no domínio publicado.
- [ ] Nenhuma credencial administrativa publicada.

## Operação

- [ ] Feature flags disponíveis.
- [ ] Rollback documentado.
- [ ] App Check avaliado.
- [ ] README atualizado.
- [ ] Fontes e licenças do dicionário documentadas.

---

# 19. Definição de pronto

A migração será considerada concluída quando:

1. um usuário puder criar conta e entrar no desktop;
2. a sessão permitir abrir a aplicação de japonês sem novo login;
3. o progresso puder ser salvo e carregado em dispositivos diferentes;
4. um usuário não puder acessar os dados de outro;
5. a aplicação continuar funcional no GitHub Pages;
6. os dados linguísticos permanecerem independentes dos dados pessoais;
7. a migração do StorageDB puder ser repetida sem duplicação;
8. o fallback local estiver testado;
9. regras e fluxos críticos tiverem testes automatizados;
10. não houver credenciais administrativas no repositório ou bundle.

---

# 20. Ordem recomendada de Pull Requests

```text
PR 01: auditoria e documentação
PR 02: configuração Firebase e emuladores
PR 03: cliente Firebase centralizado
PR 04: autenticação e sessão do desktop
PR 05: auth guard e integração do launcher
PR 06: modelo Firestore, regras e testes
PR 07: camada de repositório local
PR 08: repositório Firestore
PR 09: migração StorageDB v1
PR 10: sincronização do aplicativo de japonês
PR 11: manifesto e cache do dicionário
PR 12: deploy GitHub Pages
PR 13: App Check e endurecimento
PR 14: remoção gradual do legado
```

Cada Pull Request deve conter:

- objetivo;
- arquivos alterados;
- decisões tomadas;
- como testar;
- riscos;
- evidências de build e testes;
- instruções de rollback.

---

# 21. Prompt mestre para execução pelo Codex

Copiar o bloco abaixo para iniciar o trabalho no repositório:

```text
Implemente a migração para Firebase seguindo estritamente o documento
MIGRACAO_FIREBASE_DESKTOP_JAPONES.md.

Regras de execução:
1. Comece somente pela Fase 0.
2. Leia o README e toda a documentação técnica existente.
3. Não altere o framework, a identidade visual ou a arquitetura geral sem necessidade.
4. Não remova o StorageDB.
5. Não avance para uma fase posterior enquanto os critérios de aceite da fase atual não forem atendidos.
6. Antes de editar, apresente um resumo da arquitetura encontrada e os arquivos que serão afetados.
7. Depois das alterações, execute os testes, lint e build disponíveis.
8. Documente comandos executados, resultados, limitações e riscos.
9. Não adicione credenciais reais, contas de serviço ou segredos ao repositório.
10. Prefira mudanças pequenas, reversíveis e compatíveis com o GitHub Pages.

Ao finalizar a fase, entregue:
- resumo das mudanças;
- lista de arquivos alterados;
- testes executados;
- critérios de aceite verificados;
- pendências para a próxima fase;
- instruções de rollback.
```

Para executar uma fase específica:

```text
Continue a migração descrita em MIGRACAO_FIREBASE_DESKTOP_JAPONES.md.
Implemente somente a Fase X.

Primeiro, confirme no código que as fases anteriores estão concluídas.
Não refatore áreas não relacionadas.
Preserve compatibilidade com o armazenamento local até que o documento autorize sua remoção.
Execute e registre os testes e o build ao final.
```

---

# 22. Referências oficiais

- Firebase Web Setup: https://firebase.google.com/docs/web/setup
- Firebase Authentication para Web: https://firebase.google.com/docs/auth/web/start
- Persistência do estado de autenticação: https://firebase.google.com/docs/auth/web/auth-state-persistence
- Google Sign-in para Web: https://firebase.google.com/docs/auth/web/google-signin
- Boas práticas para `signInWithRedirect`: https://firebase.google.com/docs/auth/web/redirect-best-practices
- Cloud Firestore: https://firebase.google.com/docs/firestore
- Security Rules: https://firebase.google.com/docs/firestore/security/get-started
- Persistência offline do Firestore: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- Firebase Local Emulator Suite: https://firebase.google.com/docs/emulator-suite
- Conectar ao emulador do Firestore: https://firebase.google.com/docs/emulator-suite/connect_firestore
- Conectar ao emulador de Authentication: https://firebase.google.com/docs/emulator-suite/connect_auth
- Boas práticas para ambientes Firebase: https://firebase.google.com/docs/projects/dev-workflows/general-best-practices
- App Check para aplicações Web: https://firebase.google.com/docs/app-check/web/recaptcha-provider
- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Publicação com workflow personalizado: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- Configuração da fonte de publicação: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site

---

## Nota final para implementação

Esta documentação define uma arquitetura de referência. O Codex deve adaptar nomes, caminhos, módulos e comandos à stack real encontrada no repositório. Onde a API do `StorageDB` não estiver documentada, o comportamento existente no código deve ser tratado como fonte de verdade e envolvido por um adaptador antes de qualquer substituição.
