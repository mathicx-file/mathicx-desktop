# Japanese Study

Aplicacao web local-first para estudar hiragana, katakana e Kanji N5, com pratica diaria, consulta rapida, repeticao espacada, quiz, digitacao guiada, escrita, backup e recomendacoes adaptativas.

O projeto usa HTML, CSS e JavaScript vanilla com ES Modules. Nao ha framework, etapa de build ou servidor de aplicacao obrigatorio: os dados-base ficam em JSON e o progresso do estudante fica salvo no navegador. Quando roda dentro do Mathicx-File com Firebase ativo, os dados pessoais tambem sao sincronizados por usuario aprovado.

## Sumario

- [Recursos](#recursos)
- [Stack tecnica](#stack-tecnica)
- [Requisitos](#requisitos)
- [Como rodar localmente](#como-rodar-localmente)
- [Testes](#testes)
- [Arquitetura](#arquitetura)
- [Dados e persistencia](#dados-e-persistencia)
- [Backup e importacao](#backup-e-importacao)
- [Integracao com Mathicx-File](#integracao-com-mathicx-file)
- [Roadmap](#roadmap)
- [Troubleshooting](#troubleshooting)

## Recursos

- Estudo de hiragana, katakana e uma fatia inicial de Kanji N5.
- Busca por romaji, kana, kanji, leitura, significado, radical, tag e vocabulario.
- Dicionario local com palavras em kana e kanji.
- Dashboard com progresso, atividade recente, tempo de estudo, SRS, Kanji N5 e ultimos caracteres vistos.
- Gamificacao local-first com XP, niveis, missoes, conquistas persistidas, metas configuraveis e caderno de erros.
- Assistente de Estudo Diario v2 com recomendacao explicavel, motivo, evidencias, acao sugerida e proximo passo.
- Quiz com reconhecimento, romaji para japones, digitacao, producao ativa, flashcards e modos especificos de kanji.
- Digitacao guiada v2.1 com frases curtas em hiragana, copia guiada, conversao romaji para kana, feedback simples e resumo da sessao.
- Revisao de erros dentro da sessao de quiz.
- Sistema SRS local com estados `new`, `learning`, `review` e `mastered`.
- Favoritos de caracteres e favoritos separados para palavras do dicionario.
- Historico local de estudo e historico de consultas do dicionario.
- Pratica de escrita em canvas com avaliacao baseada em tracos quando ha modelo comparavel.
- Mnemotecnicos pessoais salvos localmente por caractere.
- Exportacao A4 de kana para tabela de consulta, folha de pratica com tracos, folha em branco, orientacao retrato/paisagem e linhas extras.
- Exportacao, validacao, mescla, substituicao e exclusao de dados locais.
- Integracao por iframe com o ecossistema Mathicx-File via `manifest.js` e `view.js`.
- Sincronizacao Firebase local-first por UID quando executado dentro do Mathicx-File.

## Stack tecnica

| Area | Tecnologia |
| --- | --- |
| Linguagem | JavaScript moderno com ES Modules |
| UI | HTML5, CSS3 e DOM APIs |
| Build | Nenhum build obrigatorio |
| Dados-base | Arquivos JSON em `data/` |
| Persistencia local | LocalStorage e IndexedDB, com escopo por UID quando ha usuario Firebase |
| Sincronizacao opcional | Firestore via Mathicx-File |
| Testes | `node --test` |
| Integracao host | `postMessage`, `manifest.js` e `view.js` |

## Requisitos

Para usar o app:

- Um navegador moderno com suporte a ES Modules, `fetch`, LocalStorage e IndexedDB.
- Um servidor estatico local, porque o app carrega JSON por `fetch`.

Para desenvolver e testar:

- Node.js recomendado para rodar a suite de testes.
- Python 3 ou `npx http-server` para servir os arquivos localmente.

Nao ha dependencias npm obrigatorias de runtime.

## Como rodar localmente

### 1. Clone o repositorio

```bash
git clone https://github.com/mathicx-file/Japanese_study.git
cd Japanese_study
```

Se voce estiver usando este workspace local, o diretorio atual esperado e:

```text
D:\AI\Japonese\Applications\japanese-study
```

### 2. Suba um servidor estatico

Opcao com Python:

```bash
python -m http.server 8080
```

Opcao com Node via `npx`:

```bash
npx http-server . -p 8080
```

Depois abra:

```text
http://localhost:8080
```

Evite abrir `index.html` diretamente no navegador. Alguns navegadores bloqueiam `fetch` de arquivos JSON quando a pagina roda via `file://`.

## Testes

Execute todos os testes:

```bash
npm test
```

No PowerShell do Windows, se `npm` for bloqueado pela politica de execucao:

```powershell
npm.cmd test
```

A suite atual cobre:

- Motor adaptativo, recomendacoes e assistente diario.
- SRS e normalizacao de registros.
- Conversao romaji para kana.
- Digitacao guiada, avaliacao de respostas e persistencia de sessoes.
- Varredura contra mojibakes conhecidos nos arquivos-fonte.
- Quiz, fila de revisao de erros e modos de Kanji N5.
- Busca de kanji por significado, leitura, radical, tag e vocabulario.
- Validacao de backup e limpeza de dados locais.
- Isolamento de dados locais por usuario Firebase.
- Gamificacao local-first, eventos de XP, metas configuraveis e caderno de erros.

## Scripts disponiveis

| Comando | Descricao |
| --- | --- |
| `npm test` | Roda a suite com `node --test`. |
| `npm.cmd test` | Alternativa para PowerShell no Windows. |
| `npm run check:mojibake` | Verifica se arquivos-fonte contem padroes conhecidos de mojibake. |
| `npm run fix:mojibake` | Tenta corrigir mojibakes UTF-8 interpretados como Windows-1252/Latin-1. Revise o diff depois. |
| `npm run download:kana-strokes` | Baixa/atualiza os SVGs locais de hiragana e katakana usados na sequencia de tracos. |
| `node scripts/mojibake-check.mjs` | Executa diretamente a mesma verificacao de encoding. |
| `node scripts/mojibake-check.mjs --fix` | Executa diretamente a correcao automatica de mojibake. |
| `python -m http.server 8080` | Sobe servidor estatico local. |
| `npx http-server . -p 8080` | Alternativa de servidor estatico via Node. |

### Checagem de mojibake

O script `scripts/mojibake-check.mjs` protege arquivos de texto contra corrupcoes comuns de UTF-8 exibidas como letras acentuadas quebradas, setas corrompidas, controles invisiveis e sequencias semelhantes. Ele e executado pela suite de testes por meio de `tests/mojibake-check.test.mjs`, entao um texto corrompido deve quebrar `npm test` antes de chegar ao uso normal.

Use a checagem sem alterar arquivos:

```bash
npm run check:mojibake
```

Se houver corrupcao real em arquivos-fonte, aplique a correcao automatica e revise o diff:

```bash
npm run fix:mojibake
git diff
```

Observacao para Windows: o PowerShell pode exibir UTF-8 corretamente salvo como mojibake quando o console nao esta em UTF-8. Antes de editar manualmente, prefira confirmar com `npm run check:mojibake` ou com leitura via Node.

## Arquitetura

O app e um SPA simples sem roteador formal. A navegacao principal acontece por abas na tela, e os modulos ES ficam separados por responsabilidade.

```text
.
|-- assets/
|   `-- strokes/
|       |-- kana/
|       |-- kanji/
|       `-- README.md
|-- css/
|   `-- styles.css
|-- data/
|   |-- dictionary.json
|   |-- hiragana.json
|   |-- kanji.json
|   |-- katakana.json
|   `-- typing-exercises.json
|-- js/
|   |-- app.js
|   |-- dictionary.js
|   |-- kana-input.js
|   |-- kana-print-export.js
|   |-- gamification-engine.js
|   |-- learning-levels.js
|   |-- practice.js
|   |-- quiz.js
|   |-- recommendation-engine.js
|   |-- search.js
|   |-- srs-engine.js
|   |-- storage.js
|   |-- stroke-player.js
|   |-- study-engine.js
|   |-- typing-content-provider.js
|   |-- typing-evaluator.js
|   |-- typing-session.js
|   `-- ui.js
|-- tests/
|-- DOCUMENTATION.md
|-- index.html
|-- manifest.js
|-- package.json
|-- README.md
`-- view.js
```

### Fluxo de inicializacao

1. `index.html` carrega `js/app.js`.
2. `app.js` inicializa a UI e carrega os JSONs de hiragana, katakana, kanji, dicionario e exercicios de digitacao.
3. Os dados sao normalizados com `script` e `category`.
4. `JapaneseSearch`, `JapaneseDictionary`, `JapaneseQuiz`, `JapaneseTypingContentProvider` e `JapaneseUI` recebem os dados.
5. Quando ha Firebase disponivel pelo Mathicx-File, o sync define o escopo local pelo UID aprovado antes de ler preferencias e progresso.
6. O dashboard e renderizado com estatisticas de `JapaneseStorage`.
7. A busca, filtros, quiz, digitacao guiada, dicionario, backup e modal passam a responder aos eventos da UI.

### Modulos principais

| Modulo | Responsabilidade |
| --- | --- |
| `js/app.js` | Orquestra carregamento, eventos, filtros, backup, estatisticas e sessoes. |
| `js/ui.js` | Renderiza dashboard, grid, dicionario, quiz, modal, SRS, escrita e estados visuais. |
| `js/storage.js` | Centraliza LocalStorage, IndexedDB, progresso, favoritos, SRS, settings, backup e importacao. |
| `js/search.js` | Busca em kana e kanji, incluindo campos de significado, leitura, radical, tags e vocabulario. |
| `js/dictionary.js` | Mantem e filtra palavras do dicionario local. |
| `js/kana-print-export.js` | Gera documentos A4 de hiragana/katakana para imprimir ou salvar como PDF. |
| `js/quiz.js` | Gera perguntas, valida respostas, controla placar e revisao de erros. |
| `js/srs-engine.js` | Calcula agenda de repeticao espacada, intervalos, facilidade, streak e normalizacao. |
| `js/study-engine.js` | Converte recomendacoes em sessoes de estudo executaveis. |
| `js/recommendation-engine.js` | Produz recomendacoes explicaveis com `schemaVersion`, motivo, evidencias, acao e proximo passo. |
| `js/gamification-engine.js` | Calcula XP, niveis, dimensoes de habito/dominio/pratica, missoes, conquistas e caderno de erros. |
| `js/learning-levels.js` | Ponte publica para o motor de gamificacao usado pelo Dashboard. |
| `js/practice.js` | Controla canvas e comparacao de escrita. |
| `js/stroke-player.js` | Carrega SVG local ou remoto e anima tracos. |
| `js/kana-input.js` | Converte romaji digitado para hiragana ou katakana. |
| `js/typing-content-provider.js` | Carrega, normaliza e filtra exercicios locais de digitacao guiada. |
| `js/typing-evaluator.js` | Normaliza respostas, compara com alternativas aceitas e identifica o primeiro erro. |
| `js/typing-session.js` | Controla a sessao de digitacao, progresso, resumo, precisao e velocidade. |

### Assistente de Estudo Diario

O assistente atual e deterministico e local. Ele nao chama IA externa.

O contrato retornado pelo motor de recomendacao inclui:

```js
{
  schemaVersion: 1,
  type: 'review',
  title: 'Revisar pendentes',
  description: '...',
  reason: '...',
  evidence: ['...'],
  action: 'study-now',
  actionLabel: 'Revisar agora',
  nextStep: '...',
  session: {
    reason: 'review-due',
    script: 'all',
    categories: ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'],
    mode: 'multiple-choice',
    limit: 10
  }
}
```

Prioridade atual:

1. Revisoes SRS vencidas.
2. Erros recorrentes recentes.
3. Proximo bloco da ementa.
4. Kanji N5 quando hiragana e katakana ja estao fortes.

## Dados e persistencia

O app e local-first. No modo standalone, dados do usuario nao sao enviados para servidor. Dentro do Mathicx-File com Firebase ativo, o app mantem o cache local e sincroniza dados pessoais no Firestore do usuario aprovado.

### Dados-base

| Arquivo | Conteudo |
| --- | --- |
| `data/hiragana.json` | Caracteres hiragana, categoria, tracos e exemplos. |
| `data/katakana.json` | Caracteres katakana, categoria, tracos e exemplos. |
| `data/kanji.json` | Fatia inicial de Kanji N5 com leituras, significados, radical, componentes, exemplos e tags. |
| `data/dictionary.json` | Palavras locais em kana e kanji, com leitura, romaji e definicao. |
| `data/typing-exercises.json` | Exercicios revisados de digitacao guiada, com prompt em portugues, resposta japonesa, romaji de apoio e tokens. |

### LocalStorage

| Chave | Conteudo |
| --- | --- |
| `japanese_favorites` | IDs de caracteres favoritos. |
| `japanese_dictionary_favorites` | IDs de palavras favoritas. |
| `japanese_srs` | Mapa de registros SRS por caractere. |
| `japanese_settings` | Preferencias, quiz, diagnostico, mnemonicos, metas de gamificacao e conquistas persistidas. |

Quando ha usuario Firebase aprovado, essas chaves recebem escopo por UID para evitar compartilhamento entre contas no mesmo navegador:

```text
japanese_favorites_{uid}
japanese_dictionary_favorites_{uid}
japanese_srs_{uid}
japanese_settings_{uid}
```

### IndexedDB

| Campo | Valor |
| --- | --- |
| Banco | `JapaneseStudyDB` |
| Versao | `2` |
| Object store | `japanese_progress` |
| Indices | `timestamp`, `type`, `charId`, `schemaVersion` |

Quando ha usuario Firebase aprovado, o banco local tambem recebe escopo por UID:

```text
JapaneseStudyDB_{uid}
```

Tipos comuns de registro:

- `view`: caractere aberto no modal.
- `study_time`: minutos de sessao registrados.
- `dictionary_view`: palavra consultada no dicionario.
- `quiz_answer`: resposta correta de quiz.
- `quiz_error`: resposta incorreta de quiz.
- `typing_session`: resumo de uma sessao de digitacao guiada.
- `typing_step`: resposta correta em um exercicio de digitacao guiada.
- `typing_error`: resposta incorreta em um exercicio de digitacao guiada.
- `gamification_event`: evento auditavel de XP gerado por quiz, SRS ou digitacao.

Os registros persistidos usam `schemaVersion` e `entityType` para facilitar normalizacao e futura migracao para uma fonte remota.

## Backup e importacao

A aba "Dados" permite:

- Exportar um backup JSON.
- Validar um arquivo de backup antes de importar.
- Mesclar backup com os dados atuais.
- Substituir dados locais pelo backup.
- Excluir dados locais com confirmacao visual na propria interface.

Formato geral:

```json
{
  "format": "japanese-study-backup",
  "schemaVersion": 1,
  "appVersion": "2.0.0",
  "exportedAt": "2026-06-30T00:00:00.000Z",
  "data": {
    "favorites": [],
    "dictionaryFavorites": [],
    "progress": [],
    "srs": {},
    "settings": {}
  }
}
```

Backups com `schemaVersion` maior que a versao suportada sao recusados para evitar perda ou interpretacao incorreta de dados.

## Integracao com Mathicx-File

O projeto possui dois arquivos para integracao com o host:

- `manifest.js`: metadados, permissoes e capacidades.
- `view.js`: adaptador que monta o app em iframe.

Manifest atual:

- `id`: `japanese-study`
- `version`: `2.0.0`
- `permissions`: `storage`, `indexeddb`, `downloads`
- `capabilities.themes`: `true`
- `capabilities.postMessage`: `true`
- `capabilities.widgets`: `false`

Mensagens aceitas pelo app:

| Tipo | Efeito |
| --- | --- |
| `theme` | Sincroniza tema recebido do host. |
| `refresh` | Recarrega a aplicacao. |
| `focus` | Solicita foco da janela/iframe. |

### Firebase no Mathicx-File

Quando executado dentro do Mathicx-File:

- a identidade vem do Firebase Auth do host;
- apenas usuarios com perfil aprovado acessam o desktop e iniciam o sync;
- dados pessoais usam o namespace `users/{uid}/apps/japanese-study/...`;
- LocalStorage e IndexedDB usam o UID como escopo local;
- dicionario, kana, kanji, exercicios e assets continuam locais/estaticos;
- o tema recebido do host e aplicado como `dark` ou `light`.

Paths pessoais atualmente planejados/usados:

```text
users/{uid}/apps/japanese-study/settings/main
users/{uid}/apps/japanese-study/profile/progression
users/{uid}/apps/japanese-study/stats/summary
users/{uid}/apps/japanese-study/events/{eventId}
users/{uid}/apps/japanese-study/achievements/{achievementId}
users/{uid}/apps/japanese-study/srs/{itemId}
users/{uid}/apps/japanese-study/favorites/{entryId}
users/{uid}/apps/japanese-study/dictionaryFavorites/{entryId}
```

Mensagens enviadas ao host:

| Tipo | Quando |
| --- | --- |
| `study-progress` | Ao abrir/estudar um caractere. |
| `favorite-added` | Ao favoritar caractere. |
| `favorite-removed` | Ao remover favorito. |

O `view.js` cria o iframe com sandbox:

```text
allow-scripts allow-same-origin allow-storage-access-by-user-activation
```

## Roadmap

Estado atual:

- Hiragana e katakana: concluido.
- Dicionario local: concluido.
- SRS, quiz, flashcards e escrita: concluido.
- Backup e importacao: concluido.
- Aprendizagem adaptativa: concluido.
- Kanji N5 inicial: concluido como fatia vertical com 10 kanji.
- Digitacao guiada v2.1: concluido como MVP local-first com hiragana, copia guiada, JSON local, feedback e persistencia.
- Gamificacao local-first: concluido com ledger de XP, niveis, metas configuraveis, missoes, conquistas e caderno de erros.
- Assistente de Estudo Diario v2: iniciado com recomendacoes explicaveis e resumo pos-quiz.
- Integracao Mathicx-File por iframe: concluida.
- Sincronizacao Firebase por usuario aprovado: concluida como camada local-first inicial.

Proximos passos recomendados:

1. Adicionar UI de status da sincronizacao Firebase.
2. Registrar marcador de migracao em `users/{uid}/migrations`.
3. Melhorar reconciliacao de conflitos entre dispositivos.
4. Aprofundar a integracao Mathicx-File com widget, launcher, deep links, notificacoes e status de estudo.
5. Expandir a digitacao guiada com katakana, traducao guiada, dicas e textos medios.
6. Expandir Kanji N5 em blocos pequenos, mantendo validacao de dados e compatibilidade com backup/sync.

## Futuro banco de dados

O app deve continuar funcionando localmente nesta fase. Ainda assim, a arquitetura ja evita espalhar acesso a dados pela UI:

- `JapaneseStorage` centraliza progresso, settings, SRS, favoritos e backup.
- `JapaneseDictionary` isola consulta ao dicionario.
- `JapaneseSearch` isola busca sobre caracteres e kanji.
- O assistente usa contratos versionados com `schemaVersion`.
- IDs de kana, kanji, palavras e eventos sao estaveis o suficiente para sincronizacao futura.

Firebase e o caminho atual para sincronizacao pessoal quando o app roda dentro do Mathicx-File, mas nao e dependencia do app standalone. Outras alternativas tambem podem fazer sentido dependendo do objetivo:

- Firebase/Firestore para progresso por usuario, eventos de gamificacao, SRS, favoritos e settings.
- Supabase/Postgres se o projeto precisar de consultas relacionais mais fortes.
- Meilisearch/Algolia se o dicionario crescer e precisar de busca textual/fuzzy dedicada.

## Troubleshooting

### A pagina abre, mas os dados nao carregam

Provavelmente o app foi aberto via `file://`.

Use um servidor estatico:

```bash
python -m http.server 8080
```

Depois acesse:

```text
http://localhost:8080
```

### `npm` nao roda no PowerShell

Use:

```powershell
npm.cmd test
```

### Perdi progresso local

O progresso fica no navegador. Se voce limpar dados do site, LocalStorage ou IndexedDB, o historico local pode ser removido. Use a aba "Dados" para exportar backup antes de limpar ou trocar de navegador.

### SVG de tracos nao aparece

O app tenta carregar SVG local em `assets/strokes/` antes de recorrer ao fallback remoto do KanjiVG. A folha de pratica de escrita usa os arquivos em `assets/strokes/kana/`; se aparecer apenas "modelo", atualize esses assets com `npm run download:kana-strokes` e recarregue o app.

### Backup nao importa

Verifique se o JSON possui:

- `format: "japanese-study-backup"`
- `schemaVersion` suportado pelo app
- objeto `data`

Backups de versoes futuras podem ser recusados de proposito.

## Documentacao complementar

Para detalhes de roadmap, arquitetura e decisoes de produto, veja:

- `DOCUMENTATION.md`
- `docs/GAMIFICATION_RESTRUCTURE_FIREBASE.md`
- `assets/strokes/README.md`
