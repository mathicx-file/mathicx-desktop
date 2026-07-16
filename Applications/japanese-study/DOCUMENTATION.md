# Japanese Study App

> Estado consolidado em 2026-07-16: integrado ao Mathicx Desktop, sincronizado
> por UID no Firebase, participante do backup unificado e compativel com modo
> visitante estritamente local. O dicionario ampliado usa pacotes estaticos
> `essential`, `core` e `full`, cache offline, PWA, atualizacao e rollback.
>
> As secoes de versoes abaixo preservam a evolucao historica. Para o estado
> operacional vigente, prevalecem o `README.md` deste aplicativo e o roteiro
> oficial em `../../docs/firebase-migration/FIREBASE_ROADMAP_OFICIAL.md`.

Aplicação web standalone para estudo de hiragana e katakana, criada para ser carregada pelo ecossistema Mathicx-File como uma aplicação externa via iframe.

O projeto usa apenas HTML5, CSS3 e JavaScript vanilla com ES Modules. Não há etapa de build, bundler ou dependência de framework.

```text
Versão atual: 2.3
Última atualização da documentação: 2026-07-08
Proxima versao: ainda nao definida; integracao e sincronizacao foram concluidas
```

## Objetivo

O app ajuda no aprendizado inicial da escrita japonesa, com foco em:

- reconhecimento visual de hiragana e katakana;
- leitura por romaji;
- consulta de exemplos de palavras;
- favoritos;
- acompanhamento local de progresso;
- dashboard de aprendizado;
- gamificação local-first com XP, níveis, metas, missões, conquistas e caderno de erros;
- dicionário local;
- repetição espaçada;
- quiz e flashcards;
- digitação guiada de frases curtas em hiragana;
- reprodução animada de traços quando há SVG disponível;
- prática de escrita em canvas;
- exportação A4 de tabelas e folhas de prática de kana para impressão/PDF.

Kanji está previsto no roadmap, mas deve entrar primeiro como uma fatia vertical pequena e completa antes da expansão para JLPT N5/N4.

## Estrutura do Projeto

```text
Applications/japanese-study/
├── index.html
├── manifest.js
├── view.js
├── css/
│   └── styles.css
├── js/
│   ├── app.js
│   ├── storage.js
│   ├── ui.js
│   ├── stroke-player.js
│   ├── search.js
│   ├── dictionary.js
│   ├── gamification-engine.js
│   ├── kana-print-export.js
│   ├── quiz.js
│   ├── practice.js
│   ├── typing-content-provider.js
│   ├── typing-evaluator.js
│   └── typing-session.js
├── scripts/
│   └── mojibake-check.mjs
├── docs/
│   └── GAMIFICATION_RESTRUCTURE_FIREBASE.md
├── tests/
│   └── mojibake-check.test.mjs
├── data/
│   ├── hiragana.json
│   ├── katakana.json
│   ├── dictionary.json
│   └── typing-exercises.json
└── assets/
```

## Arquitetura

O projeto é dividido por responsabilidade:

- `index.html`: estrutura principal da tela.
- `css/styles.css`: estilos, temas, cards, modal, filtros, canvas e responsividade.
- `js/app.js`: inicialização, carregamento dos dados e integração entre módulos.
- `js/ui.js`: renderização da interface, grid, filtros, modal, favoritos e prática.
- `js/search.js`: busca instantânea com debounce e aplicação de filtros.
- `js/storage.js`: favoritos via LocalStorage e progresso via IndexedDB.
- `js/stroke-player.js`: carregamento e animação de SVGs do KanjiVG.
- `js/practice.js`: desenho em canvas e avaliação simples da escrita.
- `js/quiz.js`: geração de perguntas, validação de respostas e pontuação do quiz.
- `js/dictionary.js`: carregamento, busca, histórico e favoritos do dicionário.
- `js/gamification-engine.js`: regras de XP, níveis, dimensões de progresso, metas, missões, conquistas e caderno de erros.
- `js/kana-print-export.js`: gera documentos A4 de hiragana/katakana para imprimir ou salvar como PDF.
- `js/typing-content-provider.js`: carregamento, normalização e filtro dos exercícios locais de digitação guiada.
- `js/typing-evaluator.js`: normalização, comparação de respostas e identificação do primeiro erro.
- `js/typing-session.js`: controle da sessão, resumo, precisão e velocidade em kana por minuto.
- `docs/GAMIFICATION_RESTRUCTURE_FIREBASE.md`: contrato local-first da gamificação e plano de migração futura para Firestore por usuário.
- `data/hiragana.json`: base de caracteres hiragana.
- `data/katakana.json`: base de caracteres katakana.
- `data/dictionary.json`: base local inicial de palavras.
- `data/typing-exercises.json`: base local inicial de exercícios revisados para digitação guiada.
- `scripts/mojibake-check.mjs`: varredura e correção opcional de mojibakes comuns em arquivos de texto.
- `tests/mojibake-check.test.mjs`: garante que a verificação de mojibake rode junto da suíte automatizada.
- `manifest.js`: metadados para integração com o Mathicx-File.
- `view.js`: adaptador de iframe para montagem dentro do host.

## Fluxo de Funcionamento

1. O host ou navegador carrega `index.html`.
2. `js/app.js` inicializa a UI e carrega `data/hiragana.json`, `data/katakana.json`, `data/kanji.json`, `data/dictionary.json` e `data/typing-exercises.json`.
3. Os caracteres recebem o campo `script`, com valores `hiragana` ou `katakana`.
4. A tela inicial exibe a lista filtrada por hiragana.
5. A busca e os filtros atualizam a grade sem recarregar a página.
6. Ao clicar em um card, o modal de estudo é aberto.
7. O modal registra progresso no IndexedDB e tenta carregar SVG de traços.
8. O usuário pode navegar entre caracteres, favoritar ou praticar escrita no canvas.
9. A aba de digitação guiada monta sessões locais com frases curtas em hiragana, converte romaji para kana e salva o resumo no IndexedDB.
10. Quiz, SRS e digitação geram eventos `gamification_event`, usados para calcular XP, nível, missões, conquistas e caderno de erros.

## Dados

Cada item dos arquivos JSON segue o formato:

```json
{
  "romaji": "ka",
  "char": "か",
  "unicode": "304B",
  "category": "gojuuon",
  "strokes": 3,
  "examples": [
    {
      "word": "かさ",
      "romaji": "kasa",
      "meaning": "umbrella"
    }
  ]
}
```

Categorias usadas:

- `gojuuon`: caracteres básicos;
- `dakuon`: caracteres com dakuten;
- `handakuon`: caracteres com handakuten;
- `youon`: combinações contraídas.

## Persistência

O app usa dois mecanismos locais:

- `LocalStorage`: guarda favoritos na chave `japanese_favorites`.
- `IndexedDB`: guarda histórico e progresso no banco `JapaneseStudyDB`, object store `japanese_progress`.

Registros de progresso usam este formato geral:

```json
{
  "id": "view_a_あ_123456789",
  "charId": "a_あ",
  "type": "view",
  "value": 1,
  "timestamp": 123456789
}
```

Tipos adicionais da versão 2.1:

- `typing_session`: resumo de uma sessão de digitação guiada, com precisão, duração e kana por minuto.
- `typing_step`: resposta correta em um exercício de digitação guiada.
- `typing_error`: resposta incorreta em um exercício de digitação guiada.

Tipos adicionais da versão 2.3:

- `gamification_event`: evento auditável de XP gerado por quiz, SRS ou digitação.

Settings adicionais da versão 2.3:

- `gamificationGoals`: metas locais configuráveis para revisões, quiz, streak e digitação.
- `gamificationAchievements`: conquistas desbloqueadas e preservadas em backup/importação.

## Integração com Mathicx-File

O app foi preparado para rodar em:

```text
Applications/japanese-study/
```

E ser integrado pelo padrão:

```text
src/apps/japanese-study/
```

Arquivos de integração:

- `manifest.js`: registra nome, id, versão, permissões e capacidades.
- `view.js`: cria um iframe, carrega `index.html` e repassa mensagens do host.

Mensagens Host -> App:

- `theme`;
- `refresh`;
- `focus`.

Mensagens App -> Host:

- `study-progress`;
- `favorite-added`;
- `favorite-removed`.

## Estado dos Recursos

Esta tabela substitui a leitura antiga de conformidade por uma visão centralizada do produto. Ela deve ser atualizada sempre que uma versão for concluída.

| Recurso | Estado | Versão | Observações |
|---|---|---|---|
| Hiragana e katakana | Concluído | 1.0 | Fundação principal com grid, filtros, favoritos e modal |
| Integração base com Mathicx-File | Concluído | 1.0 | `manifest.js`, `view.js`, iframe e mensagens básicas |
| Dashboard de aprendizado | Concluído | 1.1 | Métricas, progresso, atividade e últimos caracteres |
| Dicionário local | Concluído | 1.2 | JSON local, busca, histórico e favoritos próprios |
| Sistema SRS | Concluído | 1.3 | Estados, próxima revisão, intervalo, facilidade e filtro de revisão |
| Quiz e flashcards | Concluído | 1.4 | Reconhecimento, romaji, múltipla escolha, digitação e fila de erros |
| Prática de escrita | Concluído | 1.5 | Canvas, guia de traços e avaliação baseada em desenho |
| Consolidação e backup | Concluído | 1.6 | Exportação/importação, versionamento, migrações, SVG local e testes |
| Aprendizagem adaptativa | Concluído | 1.7 | Estudar agora, níveis, recomendações, diagnóstico, mapa de dificuldades e quiz configurável |
| Kanji N5 inicial | Concluído | 2.0 | Primeira fatia vertical com 10 kanji integrada a busca, dicionário, SRS, quiz, escrita, backup e dashboard |
| Digitação guiada | Concluído | 2.1 | MVP local-first com hiragana, cópia guiada, JSON local, conversão romaji para kana, feedback e persistência |
| Exportação A4 de kana | Concluído | 2.2 | Tabela de consulta, folha de prática com traços, folha em branco, orientação retrato/paisagem, linhas extras e agrupamentos por linha fonética |
| Gamificação local-first | Concluído | 2.3 | Ledger de XP, níveis, dimensões hábito/domínio/prática, metas configuráveis, missões, conquistas e caderno de erros |
| Integração profunda | Concluído | 2.4 | Iframe, launcher, deep links, tema, Central de Sincronização e contrato de backup |
| Expansão da digitação guiada | Planejado | 2.5 | Katakana, tradução guiada, dicas, textos médios e caderno de erros frasal |
| Assistente de estudo diário | Em andamento | 1.7+ / 3.0 | Recomendações explicáveis, evidências, sessão sugerida, resumo pós-quiz e uso do contexto de gamificação |
| Sincronização Firebase por usuário | Concluído | 4.0 | Dados pessoais isolados em `users/{uid}/apps/japanese-study` |

## Riscos e Pontos Técnicos

- Dependência externa: kana possui SVGs locais em `assets/strokes/kana/`; quando algum SVG local faltar, o app tenta GitHub raw como fallback. Sem asset local e sem rede, a ordem real dos traços não aparece.
- Encoding: os arquivos devem permanecer em UTF-8. Alguns terminais podem exibir caracteres japoneses e ícones de forma corrompida se o console não estiver em UTF-8; antes de editar manualmente, confirmar com `npm run check:mojibake`.
- Segurança de HTML: a UI monta alguns trechos com `innerHTML`. Como os dados vêm de JSON local controlado, o risco é baixo, mas isso deve ser revisto se houver importação de dados externos no futuro.
- Escalabilidade: a grade de caracteres já usa event delegation, mas filtros e controles internos ainda podem ser simplificados no futuro.
- Backup: o app já guarda dados de estudo importantes no navegador. Antes de aumentar o escopo com kanji, é recomendável exportar e importar progresso, favoritos, histórico, SRS e preferências.
- Versionamento de dados: a evolução para kanji, metas e sessões adaptativas deve incluir `schemaVersion`, normalização de registros e migrações explícitas do IndexedDB.
- Validação do host: mensagens recebidas por `postMessage` devem validar origem e formato antes de executar ações internas.
- Testes automatizados: SRS, fila de erros do quiz, cálculo de streak, filtros combinados, backup/importação e avaliação de escrita são pontos com risco de erro silencioso.
- Tratamento de falhas: IndexedDB indisponível, backup inválido, JSON corrompido, SVG ausente e falha de comunicação com o host devem gerar mensagens compreensíveis para o usuário.

## Manutenção de Encoding

O projeto possui conteúdo em português e japonês, então qualquer arquivo salvo no encoding errado pode gerar mojibake em áreas visíveis como Quiz, Dicionário e Digitação Guiada.

Comandos disponíveis:

```bash
npm run check:mojibake
npm run fix:mojibake
```

Uso recomendado:

- rodar `npm run check:mojibake` antes de fechar alterações que mexam em textos, JSON, HTML ou documentação;
- usar `npm run fix:mojibake` somente quando a checagem apontar corrupção real;
- revisar `git diff` depois da correção automática;
- manter o teste `tests/mojibake-check.test.mjs` na suíte para impedir que letras acentuadas quebradas, setas corrompidas, marcadores indevidos e controles invisíveis passem despercebidos.

Observação: o PowerShell pode renderizar UTF-8 como mojibake mesmo quando o arquivo está correto. A fonte de verdade para manutenção deve ser a leitura em UTF-8 pelo Node e a checagem automatizada.

## Diretrizes de Arquitetura

A aplicação deve continuar local-first e sem framework enquanto essa abordagem permanecer simples o suficiente. Para evitar acoplamento conforme o conteúdo crescer, novas funcionalidades devem preferir módulos com responsabilidade clara:

- `CharacterProvider`: carrega hiragana e katakana.
- `DictionaryProvider`: carrega e consulta palavras.
- `KanjiProvider`: carrega kanji, leituras, radicais e vocabulário.
- `ProgressRepository`: centraliza progresso, histórico, SRS e métricas.
- `SettingsRepository`: guarda preferências, metas e opções de estudo.
- `StrokeProvider`: resolve SVGs locais ou remotos e controla fallback.
- `BackupService`: exporta, valida, importa e migra dados.
- `HostBridge`: centraliza integração com Mathicx-File e valida mensagens.
- `StudyEngine`: monta sessões de revisão, quiz e escrita.
- `RecommendationEngine`: gera recomendações a partir de erros, SRS e dificuldade.
- `GamificationEngine`: calcula XP, níveis, metas, missões, conquistas e caderno de erros a partir de eventos locais.
- `TypingContentProvider`, `TypingEvaluator` e `TypingSession`: mantêm conteúdo, avaliação e estado de digitação guiada separados da UI.

A interface não deve precisar saber se os dados vieram de JSON local, IndexedDB, cache, SVG local, serviço remoto ou Firebase.

## Roadmap

### Versão 1.0 - Fundação

Caracteres:

- Hiragana completo;
- Katakana completo;
- busca instantânea;
- favoritos;
- modal de estudo;
- exemplos de palavras.

Escrita:

- reprodução da ordem dos traços;
- SVGs do KanjiVG;
- controle de animação.

Persistência:

- LocalStorage;
- IndexedDB;
- histórico de estudo.

Integração:

- compatibilidade com Mathicx-File;
- comunicação Host <-> Iframe;
- sincronização de tema.

Status atual: majoritariamente implementado. As pendências restantes da fundação são melhorias incrementais, como favoritos avançados e preparação mais ampla para Kanji.

### Versão 1.1 - Dashboard de Aprendizado

Adicionar estatísticas:

- total de caracteres estudados;
- tempo total de estudo;
- dias consecutivos;
- taxa de conclusão de hiragana;
- taxa de conclusão de katakana.

Adicionar visualizações:

- barra de progresso;
- calendário de atividade;
- últimos caracteres estudados.

Persistência:

- manter dados via IndexedDB.

Status atual: implementado. O dashboard exibe métricas de caracteres estudados, tempo total registrado, dias consecutivos, favoritos, taxa de conclusão por hiragana/katakana, calendário simples de atividade e últimos caracteres estudados. O tempo é salvo em blocos de sessão a cada minuto e ao ocultar/sair da página.

### Versão 1.2 - Dicionário Japonês

Implementar uma área de dicionário inicial, focada apenas em palavras escritas com hiragana e katakana.

Dados de cada palavra:

- palavra em japonês;
- romaji;
- definição;
- tipo de escrita principal, `hiragana` ou `katakana`;
- categoria opcional;
- exemplos opcionais de uso.

Busca:

- localizar palavras pela escrita japonesa;
- localizar palavras pelo romaji;
- localizar palavras pela definição;
- integrar os resultados do dicionário à pesquisa principal do app;
- atualizar resultados sem recarregar a página.

Navegação:

- criar uma aba ou seção dedicada ao dicionário;
- separar visualmente palavras em hiragana e katakana;
- permitir alternar entre lista geral, histórico e favoritos.

Histórico:

- registrar palavras abertas/consultadas;
- armazenar histórico em IndexedDB;
- exibir últimas palavras consultadas.

Favoritos:

- permitir favoritar e remover palavras do dicionário;
- manter favoritos separados dos favoritos de caracteres;
- criar uma aba de palavras favoritas;
- separar favoritos por hiragana e katakana.

Persistência sugerida:

- histórico salvo no IndexedDB como registros `dictionary_view`;
- favoritos salvos separadamente na chave `japanese_dictionary_favorites`;
- manter compatibilidade com a estrutura atual de progresso.

Kanji:

- não implementar kanji no dicionário nesta versão;
- preparar o modelo para receber palavras com kanji futuramente;
- integrar entradas com kanji na versão 2.0, junto ao roadmap de Kanji.

Status atual: implementado. O app possui uma aba de dicionário com palavras em hiragana e katakana, busca por palavra/romaji/definição/categoria, filtros por escrita, histórico de consultas e favoritos de palavras separados dos favoritos de caracteres. Os pacotes ampliados derivam o romaji de todas as leituras com WanaKana 5.3.1, seguindo a mesma convenção Hepburn dos índices de pesquisa. A listagem sem consulta usa páginas compactas ordenadas globalmente por romaji, inclusive com filtros de escrita, sem carregar o catálogo completo em memória. Controles sincronizados antes e depois da lista permitem navegar sem atravessar toda a página de resultados.

Nota de evolução: manter a lógica do dicionário atrás de um módulo/provider para permitir trocar a fonte de dados futuramente. A versão atual usa JSON local, mas o roadmap prevê migração para uma base remota quando o dicionário crescer.

### Versão 1.3 - Sistema SRS

Implementar repetição espaçada inspirada em Anki e SM-2.

Estados:

- novo;
- aprendendo;
- revisão;
- dominado.

Modelo sugerido:

```json
{
  "nextReview": "2026-06-25",
  "interval": 7,
  "easeFactor": 2.5,
  "repetitions": 4
}
```

Objetivo:

- revisar somente quando necessário.

Status atual: implementado. Cada caractere possui estado SRS local (`new`, `learning`, `review`, `mastered`), próxima revisão, intervalo, fator de facilidade e repetições. O modal permite avaliar o caractere como difícil, bom ou fácil; a grade possui filtro "Revisar hoje"; e o dashboard exibe revisões pendentes e caracteres dominados.

Correção aplicada: revisões repetidas no mesmo dia agora substituem a avaliação diária em vez de multiplicar o intervalo a cada clique. Os registros SRS também são normalizados ao serem lidos, com limite máximo de 90 dias para evitar intervalos corrompidos ou excessivos.

### Versão 1.4 - Quiz

Modos:

- reconhecimento;
- romaji para japonês;
- múltipla escolha;
- digitação;
- flashcards.

Exemplo de reconhecimento:

```text
Mostrar: あ
Respostas: a, e, i, o
```

Exemplo de romaji para japonês:

```text
Mostrar: ka
Resposta: か
```

Status atual: implementado. O app possui uma aba de Quiz com modos de reconhecimento, romaji para japonês, produção ativa, múltipla escolha, digitação e flashcards. O modo de produção ativa converte romaji digitado no teclado físico para hiragana ou katakana em tempo real, sem depender do IME do sistema. O quiz permite escolher hiragana, katakana ou ambos, mantém pontuação local durante a sessão e exibe feedback imediato. Cada sessão pode ter 10, 15 ou 20 perguntas; respostas erradas podem entrar em uma fila de revisão e reaparecer na mesma sessão, com indicação visual de "Revisão", depois de 2 a 4 perguntas. A versão 1.7 adicionou uma flag para ligar ou desligar essas revisões de erros. A seleção do quiz também pode ser refinada por nível, permitindo combinar Gojuuon, Dakuon, Handakuon e Youon com a escrita escolhida.

### Versão 1.5 - Modo de Escrita

Aprimorar o canvas interativo.

Adicionar:

- comparação de traços;
- direção do movimento;
- precisão da escrita.

Avaliações:

- excelente;
- bom;
- regular;
- praticar mais.

Status atual: implementado. O modo de escrita usa o modelo de traços carregado pelo KanjiVG quando disponível, exibe guia no canvas e avalia contagem de traços, direção, precisão e distribuição do desenho. Quando o SVG não está disponível, o app usa guia textual e avaliação limitada. O canvas vazio e rabiscos aleatórios não são mais classificados como bom ou excelente.

### Versão 1.6 - Consolidação, Backup e Robustez

Antes de expandir para Kanji, a prioridade é proteger os dados do estudante e estabilizar as bases técnicas.

Adicionar:

- exportação de dados em JSON;
- importação com validação;
- opções de importação: substituir, mesclar ou pré-visualizar;
- `schemaVersion` no backup e nos principais registros persistidos;
- migrações explícitas do IndexedDB;
- normalização de registros antigos;
- testes automatizados para SRS, quiz, filtros, streak, escrita e backup;
- tratamento visível de falhas de IndexedDB, JSON, SVG e comunicação com o host;
- validação de origem e contrato das mensagens recebidas via `postMessage`;
- armazenamento local dos SVGs essenciais do KanjiVG para kana e primeiro conjunto de kanji.

Backup sugerido:

```json
{
  "format": "japanese-study-backup",
  "schemaVersion": 1,
  "exportedAt": "2026-06-29T00:00:00.000Z",
  "data": {
    "favorites": [],
    "dictionaryFavorites": [],
    "progress": [],
    "srs": [],
    "settings": {}
  }
}
```

Critérios de conclusão:

- o usuário consegue exportar todos os dados importantes;
- backups inválidos são recusados com uma mensagem compreensível;
- importações permitem substituir ou mesclar dados;
- migrações não apagam progresso existente;
- o SRS possui testes para intervalos, revisões no mesmo dia e datas futuras;
- o conteúdo básico funciona sem internet;
- mensagens de origem desconhecida são ignoradas.

Status atual: implementado. A versão 1.6 adiciona aba de dados para exportar e importar backup JSON, validação de formato, modos de importação por mescla ou substituição, versionamento básico dos registros, migração do IndexedDB para versão 2, testes automatizados com `node --test`, validação de mensagens recebidas do host e suporte a SVGs locais antes do fallback remoto do KanjiVG.

### Versão 1.7 - Aprendizagem Adaptativa

Transformar o histórico do estudante em recomendações práticas sem depender inicialmente de IA conversacional. Esta versão deve fazer o app responder melhor à pergunta mais importante para o usuário: "o que eu devo estudar agora?".

Adicionar:

- diagnóstico inicial para identificar o nível do estudante em hiragana e katakana;
- botão principal "Estudar agora";
- sessão diária inteligente;
- trilhas guiadas;
- mapa de dificuldades por caractere;
- laboratório de caracteres parecidos;
- caderno de erros;
- sessões rápidas de estudo;
- treino de produção ativa;
- metas configuráveis;
- baralhos personalizados;
- anotações e mnemônicos pessoais;
- áudio de pronúncia como recurso complementar;
- navegação por teclado.

Diagnóstico inicial:

- aplicar um quiz curto na primeira execução ou quando o usuário solicitar;
- abrir como uma sessão especial dentro da aba Quiz, com aviso próprio de diagnóstico e revisões de erro desativadas;
- estimar domínio por escrita, categoria e caracteres individuais;
- sugerir uma trilha inicial sem bloquear exploração livre;
- permitir pular o diagnóstico.

Botão "Estudar agora":

- montar automaticamente uma sessão com base no estado atual;
- priorizar revisões vencidas;
- incluir erros recentes;
- adicionar poucos caracteres novos quando houver espaço;
- alternar reconhecimento, romaji, flashcard e escrita;
- encerrar com um resumo simples do que melhorou e do que merece atenção.

Sessão diária inteligente sugerida:

```text
60% revisões vencidas
20% erros recentes
10% caracteres parecidos
10% conteúdo novo
```

Essa proporção pode variar de acordo com tempo disponível, dificuldade do usuário e metas configuradas.

Trilhas guiadas sugeridas:

- Hiragana em 7 dias;
- Katakana em 7 dias;
- Katakana para palavras estrangeiras;
- Revisão de caracteres parecidos;
- Escrita básica sem guia;
- Pré-Kanji: vocabulário e radicais iniciais.

Caracteres parecidos sugeridos:

- Hiragana: `さ`/`き`, `ぬ`/`め`, `れ`/`ね`/`わ`.
- Katakana: `シ`/`ツ`, `ソ`/`ン`, `ク`/`ケ`, `ウ`/`ワ`/`フ`.

Sessões rápidas sugeridas:

- revisão de 5 minutos;
- 10 caracteres novos;
- somente erros recentes;
- revisões vencidas;
- treino de escrita;
- katakana de palavras estrangeiras;
- revisão antes de encerrar o dia.

Treino de produção ativa:

- mostrar romaji e pedir o kana correspondente;
- tocar áudio e pedir romaji ou caractere;
- mostrar palavra incompleta e pedir o caractere ausente;
- pedir escrita no canvas sem guia;
- comparar caracteres parecidos em rodadas curtas.

Assistente determinístico inicial:

- recomendar treino comparativo quando detectar confusão recorrente;
- sugerir revisão SRS quando houver itens vencidos;
- sugerir escrita guiada quando a precisão do canvas cair;
- explicar a recomendação com uma frase curta;
- evitar tom punitivo ao lidar com metas perdidas.

Status atual: implementado. A versão 1.7 adiciona flag para incluir ou ignorar revisões de erros no quiz, botão "Estudar agora", sessão recomendada pelo `StudyEngine`, níveis de aprendizado em estilo RPG, recomendações determinísticas, ementa inicial, diagnóstico curto, registro de respostas/erros do quiz e mapa simples de dificuldades no dashboard. O refinamento adicional da 1.7 adiciona trilhas guiadas, sessões rápidas, mnemônicos pessoais salvos localmente e treino de produção ativa.

### Versão 2.0 - Kanji N5 Inicial

Não começar adicionando todo o JLPT N5 e N4 de uma vez. A primeira entrega de Kanji deve ser uma fatia vertical com aproximadamente 10 a 20 kanji, integrada a todos os sistemas já existentes.

Adicionar:

- modelo de dados para kanji;
- conjunto inicial pequeno de kanji N5;
- leituras onyomi;
- leituras kunyomi;
- significados;
- radical principal;
- componentes;
- número de traços;
- exemplos de vocabulário;
- suporte a entradas de dicionário com kanji;
- busca por significado, leitura, radical e nível;
- integração com SRS;
- integração com quiz;
- integração com prática de escrita;
- dashboard com progresso multidimensional.

Modelo sugerido:

```json
{
  "id": "kanji-day",
  "char": "日",
  "unicode": "65E5",
  "level": "N5",
  "strokes": 4,
  "meanings": ["dia", "sol"],
  "onyomi": ["ニチ", "ジツ"],
  "kunyomi": ["ひ", "か"],
  "radical": "日",
  "components": ["日"],
  "examples": [
    {
      "word": "日本",
      "reading": "にほん",
      "romaji": "nihon",
      "meaning": "Japão"
    }
  ],
  "tags": ["tempo", "natureza"]
}
```

Progresso multidimensional sugerido:

```json
{
  "recognition": 0.8,
  "meaning": 0.7,
  "onyomi": 0.4,
  "kunyomi": 0.5,
  "writing": 0.3,
  "vocabulary": 0.6
}
```

O estudante pode reconhecer um kanji sem dominar escrita, leituras e vocabulário. Por isso, Kanji não deve usar apenas `mastered: true` ou `false`.

Status atual: implementado como fatia vertical inicial com 10 kanji N5 em `data/kanji.json`, entradas de dicionário com kanji, busca por significado/leitura/radical/tag/vocabulário, integração com SRS, modos de quiz de kanji, prática de escrita, backup e métricas no dashboard. A expansão do conjunto N5 deve continuar em blocos pequenos, com validação de dados e sem trocar a fonte local nesta etapa.

### Versão 2.1 - Digitação Guiada

Adicionar uma nova área de estudo para praticar digitação em japonês a partir de conteúdo local revisado.

Objetivos:

- criar uma aba própria de digitação guiada, separada do Quiz;
- usar exercícios locais em `data/typing-exercises.json`;
- começar com frases e palavras pequenas em hiragana;
- exibir significado ou instrução em português;
- exibir referência japonesa no modo de cópia guiada;
- permitir que o usuário digite em romaji e veja a conversão progressiva para kana;
- reutilizar `js/kana-input.js`, sem duplicar a tabela de conversão;
- comparar a resposta convertida com a resposta japonesa esperada;
- aceitar pontuação opcional cadastrada em `acceptedAnswers`;
- mostrar feedback simples sobre erro, acerto e primeiro ponto divergente;
- concluir com resumo de frases, precisão, erros e kana por minuto;
- salvar sessões e erros no IndexedDB para backup e métricas futuras.

Módulos adicionados:

- `js/typing-content-provider.js`: normaliza, filtra e seleciona exercícios.
- `js/typing-evaluator.js`: normaliza respostas, compara alternativas e localiza o primeiro erro.
- `js/typing-session.js`: controla progresso, respostas, resumo, precisão e velocidade.

Persistência:

- `typing_session`: resumo da sessão concluída.
- `typing_step`: exercício respondido corretamente.
- `typing_error`: exercício respondido incorretamente.

Status atual: implementado como MVP local-first. A primeira versão cobre hiragana, conteúdo pequeno, modo de cópia guiada, conversão romaji para kana, feedback simples, resumo e persistência local. Katakana, tradução guiada, textos médios, ditado e adaptação por dificuldade ficam para versões posteriores.

### Versão 2.3 - Gamificação Local-First

Reestruturar a progressão do estudante para equilibrar hábito de estudo e domínio real do conteúdo.

Adicionar:

- ledger local de eventos de XP em IndexedDB;
- níveis calculados por hábito, domínio e prática;
- metas configuráveis pelo usuário;
- missões ativas no Dashboard;
- conquistas persistidas em settings;
- caderno visual de erros derivado do mapa de dificuldades;
- documentação de migração futura para Firebase por usuário.

Eventos de gamificação:

```json
{
  "type": "gamification_event",
  "entityType": "gamification-event",
  "eventType": "quiz.correct",
  "source": "quiz",
  "xp": 9,
  "skill": "recognition",
  "itemId": "a_あ",
  "syncStatus": "local",
  "schemaVersion": 1
}
```

Status atual: implementado. O Dashboard exibe XP total, nível, progresso até o próximo nível, dimensões de hábito/domínio/prática, missões, metas configuráveis, conquistas e caderno de erros com treino focado. Os eventos continuam local-first e entram no backup/importação. A integração remota deve ocorrer apenas depois que o app for migrado para o Mathicx-File.

Documento complementar:

- `docs/GAMIFICATION_RESTRUCTURE_FIREBASE.md`

### Versão 2.4 - Integração Profunda com Mathicx-File

Integrar o app de forma mais profunda ao Mathicx-File, incluindo iframe instalado em `Applications/japanese-study`, widgets, launcher, notificações, deep links, comunicação de status de estudo e preparação da sincronização Firebase por usuário aprovado.

Escopo recomendado para a primeira fase:

- copiar/integrar o app em `Applications/japanese-study` dentro do Mathicx-File;
- registrar o wrapper em `src/apps/japanese-study`;
- validar funcionamento standalone dentro do iframe;
- manter dados locais funcionando sem Firebase;
- adicionar bridge de status de estudo por `postMessage`;
- preparar o repositório Firebase do Japanese Study somente depois do iframe validado.

Status atual: planejado. Esta deve ser a próxima prioridade por causa da intenção de migração em curto prazo.

### Versão 2.5 - Expansão da Digitação Guiada

Evoluir a base de digitação sem quebrar o MVP local-first.

Adicionar:

- katakana;
- tradução guiada com respostas previamente revisadas;
- dicas opcionais de romaji e vocabulário;
- textos médios divididos em frases;
- revisão focada nos exercícios com erro;
- integração leve com dicionário e mapa de dificuldades;
- filtros por categoria e dificuldade mais granulares;
- melhores estatísticas de ritmo e correções.

Regras de evolução:

- manter conteúdo local revisado como fonte principal;
- não converter texto em português para kana;
- não depender de serviços externos;
- continuar usando `js/kana-input.js`;
- adicionar testes para cada novo caso de conversão e normalização.

### Versão 2.6 - Recursos Avançados de Integração com Mathicx-File

Integrar o app de forma mais profunda ao Mathicx-File, incluindo widgets, launcher, notificações e comunicação de status de estudo.

Widget de revisão diária:

```text
🇯🇵 Revisão de Japonês
```

Exibir:

- caracteres pendentes hoje;
- sequência de dias estudados;
- tempo estudado hoje;
- próxima revisão.

Mensagem para o host:

```json
{
  "type": "study-status",
  "payload": {
    "reviewsDue": 12,
    "streak": 8,
    "studiedToday": 18
  }
}
```

Atalho:

- clique no widget abre diretamente o Japanese Study App.

Widget expandido:

- revisões pendentes;
- kanji aprendidos;
- tempo semanal.

Launcher:

- integrar resultados na busca global.

Exemplo:

```text
Pesquisar: ka
Retornar: か, カ
```

Deep links internos:

```text
japanese-study://review
japanese-study://quiz?script=katakana
japanese-study://character/ぬ
japanese-study://dictionary?query=neko
japanese-study://writing/あ
```

Mensagem de navegação sugerida:

```json
{
  "type": "navigate",
  "payload": {
    "route": "review",
    "filters": {
      "dueOnly": true
    }
  }
}
```

Notificações:

- toast automático para revisões pendentes;
- aviso de meta semanal próxima de conclusão;
- novo recorde de sequência;
- recomendação de revisão para caracteres confundidos.

Exemplo:

```text
Você possui 8 caracteres para revisar hoje.
```

### Versão 3.0 - Assistente de Estudos

Evoluir o assistente determinístico iniciado na versão 1.7 para uma camada mais completa de planejamento, explicação e acompanhamento. Esta versão não deve substituir o SRS nem as sessões inteligentes; deve orquestrar esses recursos com mais contexto.

Status atual: iniciado antes da 2.1 como Assistente de Estudo Diário v2. O motor de recomendação agora retorna um contrato versionado com motivo, evidências, ação sugerida, sessão e próximo passo. O dashboard exibe essas informações e o quiz mostra um resumo pós-sessão com orientação para o próximo estudo. A implementação continua local-first, mas preserva IDs estáveis, `schemaVersion` e módulos centralizados para facilitar uma fonte futura como Firebase ou outro banco.

Adicionar:

- plano de estudos;
- recomendações automáticas mais ricas;
- revisão inteligente entre kana, dicionário e kanji;
- priorização de erros recorrentes;
- sugestão de sessões curtas;
- explicações simples sobre por que uma revisão foi recomendada.
- adaptação por objetivo, como viagem, prova, leitura ou escrita;
- análise semanal de progresso;
- ajuste automático de metas quando o ritmo real do estudante mudar.

Exemplos:

```text
Muitos erros em シ e ツ
-> recomendar comparação visual

Revisões vencidas há três dias
-> priorizar sessão SRS

Baixa precisão na escrita de ぬ
-> recomendar prática guiada
```

Uma IA conversacional pode ser avaliada depois, quando regras, eventos e dados de progresso estiverem estáveis.

### Versão 4.0 - Sincronização Firebase por Usuário

Adicionar:

- sincronização em `users/{uid}/japaneseStudy`;
- eventos de gamificação em `events/{eventId}`;
- resumo de progressão em `profile/progression`;
- SRS por item em `srs/{itemId}`;
- settings e metas em `settings/main`;
- favoritos, histórico e preferências pessoais;
- resolução simples de conflitos;
- cache local/offline mantendo IndexedDB como base.

Pré-requisito:

- app já integrado e validado como iframe no Mathicx-File;
- Firebase Auth e Firestore ativos no host;
- usuário com `accessStatus: "approved"`;
- rules protegendo `users/{uid}/japaneseStudy`.

Status atual: planejado. Não deve ser implementado no app standalone antes da integração com o Mathicx-File.

### Versão 4.1 - Firebase para Dicionário Remoto

Migrar o dicionário para Firebase quando a base de palavras crescer além do uso confortável em JSON local.

Objetivos:

- armazenar o dicionário em uma base remota;
- permitir atualização de palavras sem publicar nova versão do app;
- sincronizar favoritos e histórico entre dispositivos;
- manter cache local em IndexedDB para uso offline e carregamento rápido;
- carregar o dicionário por páginas, filtros ou prefixos em vez de baixar tudo de uma vez.

Arquitetura sugerida:

- criar um `DictionaryProvider` com métodos como `search`, `getById`, `getFavorites` e `getHistory`;
- manter a UI independente da fonte de dados;
- usar Firebase para armazenamento/sincronização;
- avaliar serviço de busca dedicado, como Algolia ou Meilisearch, caso a busca textual do dicionário fique grande ou precise de fuzzy search.

Observação:

- Progresso pessoal deve ser sincronizado na versão 4.0. O dicionário remoto deve entrar só quando houver necessidade real de atualização dinâmica da base ou busca mais robusta. Para a fase atual, JSON local e IndexedDB continuam mais simples e rápidos.

## Visão Final

O Japanese Study App deve evoluir de um visualizador de hiragana e katakana para um sistema completo de aprendizado japonês integrado ao Mathicx-File, aproveitando widgets, launcher, notificações, IndexedDB e comunicação via mensagens para criar uma experiência de estudo contínua dentro do desktop.

## Próximos Passos Recomendados

1. Integrar o Japanese Study ao Mathicx-File como iframe, mantendo o modo standalone funcional.
2. Implementar sincronização Firebase por usuário aprovado para eventos de gamificação, progresso, SRS, favoritos e settings.
3. Aprofundar a integração com widget, launcher, deep links, notificações úteis e status de estudo.
4. Expandir a Digitação Guiada com katakana, tradução guiada, dicas e textos médios.
5. Expandir Kanji N5 em blocos pequenos, mantendo validação de dados e compatibilidade com backup/sincronização.
