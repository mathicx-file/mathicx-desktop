# Roteiro Oficial: Firebase, Japanese Study e Apps Integrados

> Criado em: 2026-07-10
>
> Status: fonte oficial de planejamento e execucao
>
> Fase atual: Fase 17.3 em andamento; pronta para deploy e observacao

## 1. Autoridade Deste Documento

Este arquivo e a fonte oficial para numeracao, escopo, status e ordem das fases da migracao Firebase e da evolucao integrada do Japanese Study no Mathicx-File.

Os documentos abaixo continuam validos como referencias tecnicas e historicas, mas nao controlam mais a numeracao:

- `firebase-migration.md`;
- `MIGRACAO_FIREBASE_DESKTOP_JAPONES.md`;
- `FIREBASE_MIGRATION_DICTIONARY_REVISED.md`;
- documentos individuais `FIREBASE_PHASE_*.md`.

Em caso de divergencia, este roteiro prevalece. Uma decisao futura que altere a ordem ou o escopo deve atualizar primeiro este arquivo.

## 2. Regra de Numeracao

- Fases inteiras representam marcos principais do roteiro.
- Trabalhos descobertos durante uma fase entram como subfase: `10.1`, `10.2`, `10.3`.
- Uma subfase deve registrar motivo, escopo, criterio de aceite e impacto na fase principal.
- Subfases nao deslocam a numeracao dos marcos seguintes.
- Melhorias transversais devem pertencer a fase que primeiro depende delas.
- Uma ideia nova nao recebe numero de fase independente antes de ser comparada com este roteiro.
- Nenhuma fase e considerada concluida somente porque o codigo foi escrito: testes e documentacao tambem devem estar completos.

Exemplo:

```text
Fase 10   Abstracao do dicionario
Fase 10.1 Contrato assincrono do provider
Fase 10.2 Adaptacao da busca do launcher
Fase 10.3 Metricas de equivalencia com o JSON legado
```

## 3. Legenda de Status

| Status | Significado |
| --- | --- |
| Concluida | Implementada, testada e documentada. |
| Em andamento | Fase iniciada, com proxima subfase definida. |
| Parcial | Parte do resultado existe, mas faltam criterios essenciais. |
| Planejada | Escopo definido e ainda nao iniciado. |
| Opcional | Executar somente quando houver necessidade comprovada. |
| Bloqueada | Depende de decisao ou intervencao externa. |

## 4. Visao Geral

| Fase | Titulo | Status | Origem |
| --- | --- | --- | --- |
| 0 | Auditoria e baseline | Concluida | Plano revisado original |
| 1 | Infraestrutura Firebase zero-build | Concluida | Plano revisado original |
| 2 | Firebase Auth em paralelo | Concluida | Plano revisado original |
| 3 | Firebase Auth como identidade principal | Concluida | Plano revisado original |
| 4 | Rules, emuladores e isolamento | Concluida | Plano revisado original |
| 5 | Dados leves do desktop | Concluida | Plano revisado original |
| 6 | Firebase no Japanese Study | Concluida | Plano revisado original |
| 7 | Observabilidade e controle do sync | Concluida | Desvio incorporado |
| 8 | Experiencia integrada do Japanese Study | Concluida | Desvio incorporado |
| 9 | Padrao multi-app e integracao do Finances | Concluida | Desvio incorporado |
| 10 | Abstracao do dicionario | Concluida | Antiga Fase 7 revisada |
| 11 | Pipeline e pacote essencial | Concluida | Antiga Fase 8 revisada |
| 12 | Indices, shards e cache | Concluida | Antiga Fase 9 revisada |
| 13 | Pipeline do dicionario no GitHub Pages | Concluida | Antiga Fase 10 revisada |
| 14 | Manifesto remoto, atualizacao e rollback | Concluida | Antiga Fase 11 revisada |
| 15 | Dicionario ampliado, pacotes offline e PWA | Concluida | Antiga Fase 12 revisada |
| 16 | Confiabilidade, backup e recuperacao | Concluida | Melhoria incorporada |
| 17 | Seguranca, rollout e remocao do legado | Em andamento | Planos anteriores 12/13 |
| 18 | Evolucoes opcionais | Opcional | Antiga Fase 13 revisada |

## 5. Fases Concluidas

### Fase 0: Auditoria e Baseline

Status: **Concluida**.

Entregas principais:

- auditoria do Firebase e do armazenamento local;
- auditoria do dicionario e da integracao por iframe;
- inventario de dados pessoais, publicos, derivados e caches;
- baseline da arquitetura zero-build.

Evidencias:

- `FIREBASE_AUDIT.md`;
- `DICTIONARY_AUDIT.md`.

### Fase 1: Infraestrutura Firebase Zero-Build

Status: **Concluida**.

Entregas principais:

- cliente e configuracao Firebase;
- feature flags;
- `firebase.json`, rules e indexes;
- configuracao de emuladores;
- projeto Firebase e Web App criados pelo proprietario.

Observacao: um unico projeto Firebase continua adequado enquanto o projeto for pessoal. Separar desenvolvimento e producao antes de ampliar o acesso.

### Fase 2: Firebase Auth em Paralelo

Status: **Concluida**.

Entregas principais:

- cadastro, login, logout e restauracao Firebase;
- provider Firebase separado;
- whitelist baseada em `accessStatus`;
- estados pendente, aprovado e rejeitado.

### Fase 3: Firebase Auth Como Identidade Principal

Status: **Concluida**.

Entregas principais:

- Firebase Auth como gate do desktop;
- conta pendente bloqueada ate aprovacao;
- troca e logout sem reaproveitar a sessao local antiga;
- opcao `Lembre de mim` sem salvar senha.

### Fase 4: Rules, Emuladores e Isolamento

Status: **Concluida**.

Entregas principais:

- regras fechadas por padrao;
- isolamento por UID;
- testes de owner, outro usuario, anonimo, pendente e admin;
- paths desconhecidos negados;
- suite executada no Firestore Emulator.

Melhoria futura associada: ampliar testes do Auth Emulator e cenarios completos de interface na Fase 17.

### Fase 5: Dados Leves do Desktop

Status: **Concluida**.

Entregas principais:

- tema, widgets, layout, atalhos, favoritos e fixados sincronizados;
- preferencias isoladas por usuario;
- activity, recents e usage locais isolados por UID.

Fora do escopo mantido: migrar todo o Explorer para o Firebase.

### Fase 6: Firebase no Japanese Study

Status: **Concluida**.

Entregas principais:

- Japanese Study integrado por iframe e ainda funcional standalone;
- Firebase inicializado no proprio contexto do iframe;
- progresso, SRS, eventos, favoritos e configuracoes por UID;
- cache local em LocalStorage/IndexedDB;
- tema claro/escuro integrado;
- exclusao, backup e isolamento entre usuarios;
- funcionamento local-first quando a rede falha.

### Fase 7: Observabilidade e Controle do Sync

Status: **Concluida**.

Classificacao: **desvio util incorporado ao roteiro**.

Esta fase ocupou a numeracao originalmente reservada a abstracao do dicionario. Ela foi mantida porque aumentou a seguranca operacional antes de ampliar a base de dados.

Subfases executadas:

- `7.1`: painel e estados da sincronizacao do Japanese Study;
- `7.2`: marcador de migracao por UID;
- `7.3`: botao de sincronizacao manual;
- `7.4`: detalhes da ultima sincronizacao.

### Fase 8: Experiencia Integrada do Japanese Study

Status: **Concluida**.

Classificacao: **desvio util incorporado ao roteiro**.

Subfases executadas:

- `8.1`: deep links e reuso da janela aberta;
- `8.2`: acoes do Japanese Study no launcher;
- `8.3`: widget de progresso por usuario;
- `8.4`: configuracao de widgets do desktop;
- `8.5`: descoberta de palavras do dicionario pelo launcher.

Observacao: a busca do launcher usa o pequeno JSON atual apenas para descoberta. A pesquisa especializada continua dentro do Japanese Study.

### Fase 9: Padrao Multi-App e Integracao do Finances

Status: **Concluida** no commit `c342463`.

Classificacao: **expansao de escopo incorporada ao roteiro**.

Subfases executadas:

- `9.1`: helper compartilhado `mountIframeApp`;
- `9.2`: contrato de responsabilidade entre host e iframe;
- `9.3`: isolamento local do Finances por UID;
- `9.4`: snapshot Firestore do Finances;
- `9.5`: revisao transacional e resolucao visivel de conflitos;
- `9.6`: retomada de alteracoes locais entre sessoes;
- `9.7`: ID canonico `finances` com alias legado `finanças`;
- `9.8`: testes funcionais, de sync, regras e migracao de IDs.

Decisao mantida: nao granularizar o Finances enquanto snapshot, volume e padrao de acesso continuarem adequados.

## 6. Fases Planejadas

### Fase 10: Abstracao do Dicionario

Status: **Concluida**.

Origem: antiga Fase 7 de `FIREBASE_MIGRATION_DICTIONARY_REVISED.md`.

Objetivo: desacoplar a interface e a busca da fonte atual sem alterar o comportamento visual.

Implementacao recomendada:

- criar contrato `DictionaryProvider`;
- encapsular `data/dictionary.json` em `LegacyDictionarySource`;
- adaptar o Japanese Study para consumir o provider;
- adaptar a busca do launcher sem duplicar regras lexicais;
- manter as 42 entradas atuais como baseline de equivalencia;
- ativar por `dictionaryProviderV2Enabled` com rollback simples;
- preparar APIs assincronas para fontes futuras.

Subfases previstas:

- `10.1`: contrato e tipos normalizados - implementado;
- `10.2`: fonte legada sobre o JSON atual - implementado;
- `10.3`: adaptacao da UI do Japanese Study - implementado;
- `10.4`: adaptacao da busca do launcher - implementado;
- `10.5`: testes de equivalencia, rollback e ativacao - implementado.

Criterios de aceite:

- buscas atuais retornam resultados equivalentes;
- favoritos e deep links continuam funcionando;
- UI nao conhece URL, JSON, shard ou IndexedDB;
- nenhuma dependencia de rede adicional e criada;
- flag desligada restaura o caminho legado.

Intervencao do proprietario: apenas validacao visual e funcional.

### Fase 11: Pipeline e Pacote Essencial

Status: **Concluida**.

Origem: antiga Fase 8 revisada.

Objetivo: criar um pipeline reproduzivel para gerar um pacote inicial de vocabulario e kanji, preservando licencas e qualidade pt-BR.

Implementacao recomendada:

- definir fontes permitidas, inicialmente JMdict, KANJIDIC2 e KanjiVG;
- registrar versao, origem e licenca de cada fonte;
- criar schema normalizado e IDs estaveis;
- gerar um pacote `bootstrap-n5` pequeno;
- preservar o JSON atual ate a comparacao ser aprovada;
- validar duplicatas, referencias, mojibake, tamanho e cobertura;
- manter traducoes pt-BR revisaveis, sem traducao automatica irrestrita.

Subfases previstas:

- `11.1`: decisao de fontes e matriz de licencas - **Concluida**;
- `11.2`: schema normalizado - **Concluida**;
- `11.3`: scripts de importacao e validacao - **Concluida**;
- `11.4`: geracao do `bootstrap-n5` - **Concluida**;
- `11.5`: revisao de conteudo e atribuicoes - **Concluida**.

Decisoes registradas em 2026-07-13:

- JMdict_e, KANJIDIC2, KanjiVG e camada propria pt-BR aprovados;
- dados gerados e traducoes pt-BR sob CC BY-SA 4.0;
- ativos KanjiVG permanecem sob CC BY-SA 3.0;
- bootstrap inicial limitado as 42 palavras, 10 kanji e quizzes atuais;
- glosses pt-BR exigem revisao humana antes da publicacao;
- schema do pipeline separado do schema de runtime da Fase 10.
- snapshots locais aceitam XML/gzip, versao fixada e SHA-256;
- importadores preservam IDs das fontes e geram aliases para o legado;
- fontes ausentes, UTF-8 invalido, mojibake e hashes incorretos bloqueiam o fluxo.
- pacote `2026.07.13-1` gerado com 94 palavras, 10 kanji e 10 SVGs;
- pacote possui 156.020 bytes e permanece bloqueado para revisao editorial;
- 16 ambiguidades e 36 traducoes em rascunho foram registradas explicitamente.
- modelo hibrido aprovado: pt-BR opcional, ingles como fallback;
- 26 palavras unicas e 10 kanji aceitos como baseline;
- revisao das 16 ambiguidades sera feita em blocos e registrada em arquivo editorial.
- pacote `2026.07.13-2` promovido com 54 traducoes revisadas e zero rascunhos;
- atribuicoes exibidas no Japanese Study e publicacao marcada como pronta;
- testes do pipeline, Japanese Study, equivalencia e launcher aprovados.

Evidencia: `FIREBASE_PHASE_11_DICTIONARY_PIPELINE.md`.

Criterios de aceite:

- pipeline e deterministico e repetivel;
- licencas acompanham o pacote;
- pacote N5 e menor que a base completa;
- dados atuais podem ser comparados ou revertidos;
- conteudo pt-BR e revisado antes da publicacao.

Intervencao do proprietario: escolher/revisar fontes, traducoes, categorias e atribuicoes.

### Fase 12: Indices, Shards e Cache

Status: **Concluida**.

Origem: antiga Fase 9 revisada.

Objetivo: permitir crescimento do dicionario sem carregar um JSON monolitico nem consultar o Firestore por palavra.

Implementacao recomendada:

- gerar shards estaveis por ID;
- gerar indices de escrita, leitura, romaji e portugues;
- criar routes e manifesto com hashes;
- baixar apenas shards necessarios para o limite de resultados;
- armazenar manifesto, indices e shards em IndexedDB separado dos dados pessoais;
- implementar cache-first para pacotes validos;
- suportar cancelamento de pesquisas concorrentes;
- manter o pacote essencial disponivel durante falhas.

Subfases previstas:

- `12.1`: shards e IDs estaveis - **Concluida**;
- `12.2`: indices de busca - **Concluida**;
- `12.3`: manifesto, routes e hashes - **Concluida**;
- `12.4`: cache IndexedDB versionado - **Concluida**;
- `12.5`: lazy loading, cancelamento e metricas - **Concluida**;
- `12.6`: testes de falha, cache e desempenho - **Concluida**.

Criterios de aceite:

- nenhum download integral e exigido na abertura;
- chunk inalterado nao e baixado novamente;
- cache ativo nao e removido antes da validacao do novo;
- busca em cache atende a meta registrada no plano revisado;
- falha de rede nao apaga o pacote anterior.

Intervencao do proprietario: validar experiencia e tamanho dos downloads.

### Fase 13: Pipeline do Dicionario no GitHub Pages

Status: **Concluida**.

Origem: antiga Fase 10 revisada.

Ja existe:

- workflow de deploy estatico;
- site publicado em subdiretorio do GitHub Pages;
- Firebase de producao carregado no frontend;
- login e apps integrados validados na URL publica.

Entregue localmente:

- workflow separado em jobs de build e deploy;
- Node.js 22 e dependencias instaladas de forma reproduzivel;
- schemas, hashes, licencas, mojibake e configuracao Firebase validados;
- `_site` criado por lista positiva, sem dependencias ou fontes internas;
- pacote, licencas, manifesto, rotas, indices e shards versionados;
- testes de adulteracao de hash e inclusao de arquivo sensivel;
- rollback por commit ou tag no acionamento manual do workflow.

Validacao publica:

- commit `ef6fce1` publicado pelo workflow `Deploy GitHub Pages #16`;
- jobs `build` e `deploy` concluidos com sucesso;
- app principal, Japanese Study e modulos de boot responderam HTTP 200;
- release `2026.07.13-2`, manifesto, routes, shard e indice acessiveis;
- descritores remotos conferidos por tamanho e SHA-256.

Subfases previstas:

- `13.1`: job de geracao e validacao - concluida;
- `13.2`: configuracao Firebase de producao validada - concluida;
- `13.3`: artifact estatico versionado - concluida;
- `13.4`: smoke test da URL publica - concluida;
- `13.5`: rollback documentado - concluida.

Criterio de conclusao: o app e o pacote versionado do dicionario sao gerados, validados e publicados pelo mesmo fluxo controlado.

Intervencao do proprietario: validar Pages, dominio autorizado e release publicada.

### Fase 14: Manifesto Remoto, Atualizacao e Rollback

Status: **Concluida**.

Origem: antiga Fase 11 revisada.

Objetivo: atualizar dados linguisticos sem republicar o codigo do app e sem invalidar um cache funcional.

Implementacao recomendada:

- ler opcionalmente `publicData/dictionary`;
- comparar versoes e `minimumAppVersion`;
- baixar manifesto e pacotes em area temporaria;
- validar hashes antes de ativar;
- trocar a versao ativa de forma transacional;
- manter a versao anterior para rollback;
- limpar versoes antigas somente apos ativacao confirmada.

Subfases registradas:

- `14.1`: contrato remoto e compatibilidade - concluida;
- `14.2`: deteccao sem promocao automatica - concluida;
- `14.3`: download candidato retomavel - concluida;
- `14.4`: ativacao transacional e selecao no runtime - concluida;
- `14.5`: rollback, limpeza gradual e testes - concluida.

Validacao do proprietario concluida em 2026-07-13 no servidor local. A primeira
promocao entre releases reais sera exercitada pela Fase 15, sem criar uma versao
artificial apenas para teste.

Criterios de aceite:

- manifesto invalido nao substitui dados validos;
- atualizacao interrompida pode ser retomada;
- rollback nao depende de apagar dados pessoais;
- Firestore guarda apenas metadados pequenos, nao o catalogo inteiro.

Intervencao do proprietario: painel validado; a primeira promocao entre
releases reais foi incorporada ao criterio da Fase 15.6.

### Fase 15: Dicionario Ampliado, Pacotes Offline e PWA

Status: **Concluida e aprovada em 2026-07-14**.

Origem: antiga Fase 12 revisada.

Objetivo: ampliar o catalogo linguistico e permitir controle explicito sobre
conteudo offline sem tornar Service Worker requisito da aplicacao.

Implementacao recomendada:

- instalar/remover pacotes por nivel ou categoria;
- mostrar tamanho antes do download;
- solicitar persistencia de armazenamento quando suportada;
- informar uso e limpeza de cache;
- avaliar Service Worker somente depois dos pacotes IndexedDB;
- testar primeira abertura online e reabertura offline.

Subfases previstas:

- `15.1`: escopo e geracao do dicionario ampliado - **concluida**;
- `15.2`: gerenciador de pacotes - **concluida**;
- `15.3`: quota, tamanho e persistencia - **concluida**;
- `15.4`: experiencia offline e recuperacao - **concluida**;
- `15.5`: Service Worker opcional - **concluida**;
- `15.6`: validacao e primeira promocao real - **concluida**;
- `15.7`: navegacao pelos pacotes instalados - **concluida e aprovada**;
- `15.8`: romaji completo na exibicao - **concluida e aprovada**;
- `15.9`: indice global ordenado por romaji - **concluida e aprovada**.

Criterios de aceite:

- usuario sabe o que esta instalado e quanto ocupa;
- remocao de cache nao remove progresso pessoal;
- pacote essencial continua funcional offline;
- PWA nao bloqueia o runtime zero-build.

Intervencao do proprietario: controles offline e promocao de `core/full`
aprovados. Um manifest para instalacao standalone permanece opcional e fora
deste recorte.

### Fase 16: Confiabilidade, Backup e Recuperacao

Status: **Concluida tecnicamente em 2026-07-14**.

Origem: melhoria descoberta apos as integracoes das Fases 7-9.

Objetivo: oferecer uma visao central do sync e recuperacao segura dos dados pessoais dos apps integrados.

Implementacao recomendada:

- contrato compartilhado de `sync-status`, `sync-now`, `backup-export` e `backup-import`;
- Central de Sincronizacao nas Configuracoes do desktop;
- backup unificado de desktop, Japanese Study e Finances;
- validacao de schema e checksum;
- restauracao seletiva por app;
- backup automatico local antes de restaurar;
- rollback quando uma etapa falhar;
- criptografia por senha para pacotes com dados financeiros.

Subfases previstas:

- `16.1`: contratos compartilhados entre host e iframes - **concluida tecnicamente**;
- `16.2`: Central de Sincronizacao - **concluida e aprovada**;
- `16.3`: exportacao unificada - **concluida e aprovada**;
- `16.4`: criptografia do pacote - **concluida e aprovada**;
- `16.5`: restauracao seletiva e rollback - **concluida e aprovada**;
- `16.6`: testes integrados de recuperacao - **concluida tecnicamente**.

Criterios de aceite:

- nenhum restore sobrescreve dados silenciosamente;
- usuario pode exportar e restaurar apps separadamente;
- falha de rede nao remove alteracoes locais;
- dados financeiros recebem protecao adequada no arquivo exportado.

Intervencao do proprietario: politica hibrida aprovada. Backups sem dados
financeiros poderao ser exportados sem senha; pacotes que incluam o Finances
exigirao criptografia por senha a partir da Fase 16.4.

### Fase 17: Seguranca, Rollout e Remocao do Legado

Status: **Em andamento**.

Origem: App Check e rollout dos planos anteriores.

Ja existe:

- Auth e rules em producao;
- whitelist por status;
- feature flags separadas;
- fallback local;
- validacao com mais de um usuario;
- deploy estavel no GitHub Pages.

Ainda falta:

- publicar o cliente instrumentado e observar as metricas do App Check;
- token de debug fora do repositorio;
- enforcement gradual;
- avaliar custom claims ou script administrativo para papeis;
- checklist de monitoramento e rollback;
- definir periodo minimo antes de remover aliases ou caminhos legados;
- remover legado somente com backup e versao estavel comprovada.

Subfases previstas:

- `17.1`: matriz de ameacas e limites - **concluida tecnicamente**;
- `17.2`: testes Auth/Firestore integrados - **concluida tecnicamente**;
- `17.3`: App Check em observacao - **em andamento**;
- `17.4`: papeis administrativos confiaveis;
- `17.5`: rollout e monitoramento;
- `17.6`: inventario e remocao gradual do legado.

A Fase 17 possui **6 subfases** no total.

Intervencao do proprietario: registrar o Web App com reCAPTCHA Enterprise sem
enforcement e, somente depois da janela de observacao, aprovar enforcement.

### Fase 18: Evolucoes Opcionais

Status: **Opcional**.

Executar somente mediante necessidade comprovada:

- projeto Firebase separado para desenvolvimento;
- Cloud Storage para releases maiores;
- painel editorial do dicionario;
- Firestore como fonte administrativa com bundles estaticos;
- Algolia ou Meilisearch para busca ampla;
- bundler para o host;
- colaboracao entre usuarios;
- granularizacao do Finances;
- sincronizacao em tempo real seletiva.

Cada item aprovado deve virar subfase `18.x`, com motivacao, custo, risco e criterio de aceite.

## 7. Direcao Atual

O projeto concluiu e teve aprovada a **Fase 15: Dicionario Ampliado, Pacotes
Offline e PWA** em 2026-07-14.
A `15.1` definiu e mediu as camadas `essential/core/full`. A `15.2` implementou
o catalogo e o ciclo seguro de instalacao/remocao. A `15.3` acrescentou medicao
de uso, preflight de quota e solicitacao de persistencia, com interface aprovada
pelo proprietario inclusive no fluxo de recusa do navegador. A `15.4` tornou o
estado offline explicito, adicionou preparacao e retomada do pacote essencial,
cacheou o catalogo e foi aprovada pelo proprietario. A `15.5` acrescentou um
Service Worker opt-in e reversivel para o shell, sem interceptar o
catalogo do dicionario, e validou recarga integral sem rede em desktop e celular.
A release comprimida da `15.6` foi promovida com 885 artefatos reproduziveis:
3.248.999 bytes para `core` e 22.121.202 bytes para `full`. A instalacao real,
busca online/offline, remocao isolada, hashes e mojibake passaram. O Pages final
possui 1.319 arquivos e 27.108.873 bytes; `core/full` estao disponiveis e a base
essencial ativa e `2026.07.13-3`.

A extensao `15.7` integrou o conteudo instalado a aba **Dicionario**: o usuario
escolhe `essential`, `core` ou `full`, navega em paginas de 50 verbetes e limita
a busca ao pacote selecionado. O runtime percorre os shards sob demanda e mantem
apenas quatro buckets decodificados em memoria. O Service Worker foi atualizado
para `v3`, com modulos versionados, para impedir a mistura de arquivos de
releases diferentes depois de um deploy. A implementacao automatizada passou em
desktop e celular, e o artefato final validado possui 1.319 arquivos e
27.120.050 bytes. A subfase foi aprovada pelo proprietario.

A `15.8` corrige os verbetes sem romaji visivel. O shell passa a incluir o
WanaKana `5.3.1` como modulo ESM e deriva a romanizacao Hepburn de todas as
leituras quando cada shard e aberto. Os indices de pesquisa e os 885 artefatos
opcionais permanecem inalterados. O Service Worker foi promovido para `v4`.
A validacao real confirmou 50 de 50 romajis na primeira pagina do pacote `full`,
online e depois de uma recarga sem rede. O Pages final possui 1.321 arquivos e
27.183.551 bytes.

A `15.9` adicionou paginas compactas ordenadas por romaji para a navegacao
global. O pacote `core` possui 31 paginas e 4.091.232 bytes; o `full` possui 218
paginas e 29.507.478 bytes. A revisao de distribuicao `2` permite atualizar uma
instalacao existente reaproveitando os shards inalterados. O runtime carrega no
maximo quatro paginas de navegacao em memoria e preserva compatibilidade com
manifestos antigos. A lista possui controles de pagina sincronizados no topo e
no rodape. A validacao em Chromium cobriu paginas consecutivas, filtro
de kanji, pagina 21 sem rede e viewport de 390 px. O Pages final possui 1.572
arquivos e 35.419.550 bytes.

Validacao final:

```text
Fase 15.6 concluida
  -> core + full publicados e validados
  -> release essencial 2026.07.13-3 promovida
  -> busca offline e remocao isolada validadas
  -> rollback real para 2026.07.13-2 concluido
Fase 15.7 implementada
  -> seletor e paginacao por pacote instalado
  -> busca limitada ao pacote selecionado
  -> atualizacao consistente do shell validada
Fase 15.8 implementada
  -> romaji Hepburn derivado de todas as leituras
  -> pacotes existentes preservados
Fase 15.9 implementada
  -> navegacao global ordenada por romaji
  -> core com 31 paginas e full com 218 paginas
  -> atualizacao incremental por revisao de distribuicao
```

Nenhuma intervencao no Console Firebase e necessaria. A promocao modifica apenas
os artefatos estaticos, o catalogo publico e a release do GitHub Pages.

Marco atual: **Fase 16 - Confiabilidade, Backup e Recuperacao**.

A `16.1` estabeleceu o protocolo `mathicx-app-data` v1 entre o host e os
aplicativos integrados. Desktop, Japanese Study e Finances agora expoem a mesma
lista fechada de operacoes para capacidades, estado de sync, sincronizacao
manual, exportacao, validacao e importacao. As mensagens sao correlacionadas por
`MessageChannel`, limitadas a mesma origem e recusam restauracao sem confirmacao
e modo explicitos. Os formatos de backup sao versionados e o Finances declara a
presenca de dados financeiros para a politica de criptografia da `16.4`.

A `16.2` acrescentou uma aba de Sincronizacao nas Configuracoes. Ela apresenta
Desktop, Japanese Study e Finances sob os mesmos estados normalizados, permite
atualizar e sincronizar manualmente e reage ao ciclo de vida dos iframes. Os
aplicativos integrados continuam lazy: quando fechados, podem ser abertos pela
Central, mas nao sao inicializados silenciosamente.

A `16.3` adicionou a composicao e o download de `mathicx-unified-backup` schema
1. Desktop e Japanese Study podem ser selecionados e cada exportacao e validada
pelo adaptador de origem. O pacote registra contratos e checksum SHA-256 por
app. Finances fica bloqueado porque pacotes financeiros exigem a criptografia
por senha da proxima subfase.

A `16.4` adicionou o modo Com senha com envelope `mathicx-encrypted-backup`
schema 1. A chave AES-GCM 256 e derivada por PBKDF2-HMAC-SHA-256 com salt
aleatorio e 600.000 iteracoes; o IV de 96 bits e novo por arquivo. O envelope
nao revela apps ou formatos internos e libera o Finances apenas dentro do
ciphertext autenticado.

A `16.5` adicionou leitura e desbloqueio de arquivos, selecao e modo por app,
confirmacao explicita e um orquestrador transacional. Antes da primeira escrita,
os uploads sao pausados e um recovery local e baixado. Falhas revertem os apps
tocados em ordem reversa e a sincronizacao so e liberada depois do estado final.

A `16.6` consolidou 17 testes de recuperacao em um comando unico, incluindo
arquivo corrompido, recovery indisponivel, falha de pausa, rollback completo e
incompleto, falha de rede no Japanese Study e round-trip protegido com os tres
adaptadores reais. Com essa matriz aprovada, a Fase 16 foi encerrada.

A `17.1` consolidou a matriz de ameacas, os limites de confianca e uma baseline
executavel com 5 verificacoes. A `17.2` adicionou 10 testes focados nas rules e
4 fluxos integrados com clientes reais nos emuladores de Authentication e
Firestore, cobrindo cadastro pendente, aprovacao, isolamento por UID e logout.

A `17.3` possui o inicializador compartilhado do App Check preparado antes de
Auth e Firestore, com bypass para emuladores, debug restrito ao localhost e 6
testes automatizados. O Web App foi registrado com reCAPTCHA Enterprise e a
site key publica foi incluida no cliente. O artefato Pages voltou a ser
reproduzivel no Windows apos fixar os bytes dos pacotes content-addressed e foi
validado com 1.582 arquivos. A observacao real aguarda o deploy.

Etapa atual: **concluir a ativacao sem enforcement da Fase 17.3**.

## 8. Protocolo de Atualizacao do Roteiro

Ao iniciar uma fase:

1. Alterar seu status para `Em andamento` neste documento.
2. Criar ou atualizar o documento detalhado da fase.
3. Registrar subfases descobertas antes de implementa-las.
4. Manter mudancas fora do escopo em backlog, salvo se forem bloqueadoras.

Ao concluir uma fase:

1. Registrar arquivos e contratos entregues.
2. Registrar testes automatizados e manuais.
3. Registrar intervencoes realizadas pelo proprietario.
4. Atualizar a tabela geral.
5. Informar commit ou release de conclusao.
6. Confirmar explicitamente qual e a proxima fase oficial.
