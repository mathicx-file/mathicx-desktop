# Fase 15: Dicionario Ampliado, Pacotes Offline e PWA

> Status: concluida em 2026-07-13
>
> Preparada em: 2026-07-13

## 1. Objetivo

Ampliar o dicionario para uso abrangente e permitir que o usuario escolha quais
conjuntos deseja manter offline, sem transformar o Service Worker em requisito
do runtime zero-build.

## 2. Modelo Recomendado

Adotar pacotes em camadas:

1. `essential` (`bootstrap-n5`): pacote pequeno instalado com o aplicativo;
2. `core`: palavras comuns e conteudo de estudo frequente;
3. `full`: catalogo amplo derivado do JMdict e KANJIDIC2;
4. pacotes auxiliares de kanji, tracos ou niveis quando houver beneficio de
   tamanho e manutencao.

O ingles permanece como fallback de significado. Traducoes pt-BR entram apenas
quando revisadas, sem bloquear a cobertura ampla das fontes publicas.

## 3. Subfases Propostas

### 15.1 - Escopo e geracao do dicionario ampliado

Status: **Concluida em 2026-07-13**.

- limites de `essential`, `core` e `full` definidos em
  `scripts/dictionary/config/package-tiers.json`;
- snapshots completos e fixados do JMdict/KANJIDIC2 importados;
- IDs estaveis, licencas, marcadores de prioridade e camada editorial pt-BR
  preservados;
- candidato local `2026.07.13-3` gerado e medido;
- fragmentacao validada para `core` e `full`, incluindo indices latinos com
  prefixo de dois caracteres no catalogo completo;
- resultados registrados em `DICTIONARY_TIER_REPORT.md`.

A publicacao foi mantida para a `15.6`, depois da implementacao do gerenciador,
quota e recuperacao. Os artefatos volumosos permanecem em `tmp/`, fora do Git.

### 15.2 - Gerenciador de pacotes

Status: **Concluida em 2026-07-13**.

- catalogo publico `essential/core/full` criado em
  `data/dictionary/packages/catalog.json`;
- lista de pacotes, versoes, cobertura, tamanho estimado e estado integrada as
  Configuracoes do Japanese Study;
- instalacao, retomada e remocao de pacotes opcionais implementadas com
  verificacao SHA-256;
- artefatos opcionais identificados por versao e pacote no IndexedDB;
- remocao limitada ao pacote selecionado, sem acesso ao banco de progresso;
- pacote `essential` sempre instalado e protegido contra remocao;
- manifests opcionais restritos a caminhos exclusivos do proprio pacote;
- catalogo incluido e validado pelo pipeline do GitHub Pages;
- `core/full` foram promovidos para `available` na publicacao real da `15.6`.

Validacao do proprietario: secao **Conteudo offline** aprovada, com os tres
pacotes visiveis, `Essencial N5` obrigatorio e `core/full` como **Em breve**.

### 15.3 - Quota, tamanho e persistencia

Status: **Concluida em 2026-07-13**.

- uso real do IndexedDB publico do dicionario exibido separadamente;
- uso total, quota e espaco livre da origem obtidos por `StorageManager.estimate`;
- preflight aplicado antes de pacotes opcionais e novas releases;
- bytes validos de downloads interrompidos descontados do espaco necessario;
- reserva minima de 10 MB mantida antes de autorizar um download;
- `QuotaExceededError` convertido em orientacao para remover conteudo opcional
  ou liberar armazenamento no navegador;
- persistencia solicitada por gesto do usuario com `StorageManager.persist`;
- recusa e indisponibilidade da API tratadas sem invalidar o cache atual;
- medidor e controles validados automaticamente em desktop e celular.

Validacao do proprietario: cache do dicionario, armazenamento do site e
atualizacao manual aprovados. O navegador recusou a persistencia e a interface
informou corretamente que o cache continua disponivel, sem tratar a resposta
como falha.

### 15.4 - Experiencia offline e recuperacao

Status: **Concluida em 2026-07-13**.

- estados `Disponivel online`, `Pronto offline`, `Baixado`, `Desatualizado` e
  `Download interrompido` integrados ao gerenciador de pacotes;
- acao **Preparar offline** instala e valida manifest, pack, rotas e shards do
  pacote essencial antes de promove-lo;
- preparacao interrompida pode ser retomada, reaproveitando artefatos validos e
  baixando novamente apenas arquivos ausentes ou invalidos;
- catalogo de pacotes armazenado no IndexedDB e reutilizado quando a rede nao
  esta disponivel;
- indicador de conectividade e orientacoes de recuperacao adicionados ao painel
  **Conteudo offline**;
- pacote essencial continua protegido contra remocao e pode ser revalidado sem
  apagar previamente a versao ativa;
- primeira preparacao online e nova busca por `mizu` sem rede validadas em
  desktop, celular e teste automatizado com uma nova instancia do provedor;
- busca offline retornou `水` sem requisicoes de rede e sem overflow em 390 px.

O IndexedDB agora garante o conteudo linguistico offline depois da preparacao.
O cache do shell HTML/CSS/JS da aplicacao continua dependente do cache HTTP do
navegador; sua garantia explicita sera avaliada separadamente na `15.5`.

Validacao do proprietario: preparacao do pacote essencial e pesquisa offline
aprovadas em 2026-07-13.

### 15.5 - Service Worker opcional

Status: **Concluida em 2026-07-13**.

- Service Worker opt-in limitado ao escopo `Applications/japanese-study/`;
- ativacao disponivel somente depois que o pacote essencial estiver pronto no
  IndexedDB;
- cache explicito dos arquivos do shell, modulos e dados basicos de estudo;
- estrategia network-first atualiza o shell quando ha rede e usa o cache como
  fallback em navegacao e recursos conhecidos;
- `data/dictionary/` excluido do interceptor e do Cache Storage, preservando o
  IndexedDB como unica fonte dos pacotes linguisticos offline;
- toggle **Aplicativo offline** integrado a **Conteudo offline**;
- **Reparar cache** prepara uma copia temporaria completa antes de substituir o
  cache ativo;
- desativacao remove o registro do Worker, o cache ativo e caches temporarios;
- recarga integral sem rede validada em desktop e celular, seguida de busca por
  `mizu` com retorno de `水`;
- ativacao, reparo e desativacao validados em navegador real sem erros de pagina
  e sem overflow em 390 px.

Esta subfase nao adiciona manifest de instalacao standalone nem duplica o app do
desktop. A possibilidade de instalar o Japanese Study separadamente permanece
opcional e deve ser planejada apenas se houver necessidade de produto.

Validacao do proprietario: ativacao, reparo, recarga offline e desativacao
aprovados em 2026-07-13.

### 15.6 - Validacao e primeira promocao real

Status: **Concluida em 2026-07-13**.

- testar pacotes pequenos e completos;
- validar busca, cache, quota, offline e mojibake;
- promover uma release nova com aprovacao do proprietario;
- exercitar rollback real para `2026.07.13-2`.

Auditoria inicial:

- os pacotes fragmentados ja foram gerados e medidos localmente;
- `core` soma aproximadamente 3,2 MB comprimidos;
- `full` soma aproximadamente 22 MB comprimidos;
- publicar os JSON brutos adicionaria aproximadamente 240 MB ao repositorio;
- o gerenciador instala e remove pacotes opcionais, mas a busca ainda precisa
  consultar seus shards;
- a candidata sera preparada com shards gzip no GitHub Pages e descompressao
  sob demanda no navegador;
- a disponibilidade publica e a troca da release ativa permanecem bloqueadas
  ate aprovacao explicita do proprietario.

Resultado da candidata `2026.07.13-3`:

| Pacote | Artefatos | Transferencia/cache | Verbetes | Kanji |
| --- | ---: | ---: | ---: | ---: |
| `core` | 212 | 3.248.999 bytes | 30.142 | 2.136 |
| `full` | 673 | 22.121.202 bytes | 217.856 | 13.108 |

- 885 arquivos reproduzidos em duas geracoes independentes, sem diferencas de
  hash;
- todos os artefatos, rotas, contagens, SHA-256, UTF-8 e mojibake validados;
- instalacao real em IndexedDB validada com tres downloads concorrentes;
- busca no `core` validada com `犬`;
- busca exclusiva do `full` validada com `暗色` (`jmdict-1154620`);
- nova instancia do runtime repetiu a busca sem rede;
- remocao do `core` preservou os 673 artefatos e 22.121.202 bytes do `full`;
- pacote gzip e descompactado somente por shard consultado, sem carregar o JSON
  monolitico na memoria;
- runtime e Service Worker preparados para o novo modulo, mantendo os pacotes
  fora do Cache Storage.

Resultado da promocao:

- os 885 artefatos comprimidos foram publicados na arvore estatica;
- `core/full` passaram de `planned` para `available` no catalogo;
- a release essencial foi promovida para `2026.07.13-3`;
- o validador do Pages confere manifesto, caminho, tamanho, SHA-256,
  descompressao gzip, UTF-8 e JSON de todos os pacotes publicados;
- o artefato final possui 1.319 arquivos e 27.108.873 bytes;
- instalacao real confirmou 212 artefatos do `core` e 673 do `full`;
- buscas por kanji comum e por entrada exclusiva do pacote completo passaram
  sem rede;
- remover `core` preservou a busca e os artefatos do `full`;
- rollback real restaurou `2026.07.13-2` e manteve `2026.07.13-3` como versao
  anterior disponivel;
- interface validada sem erros de pagina em 1440 x 1000 e 390 x 844.

Validacao do proprietario: modelo e promocao aprovados em 2026-07-13.

### 15.7 - Navegacao pelos pacotes instalados

Status: **Implementada em 2026-07-13; aguardando validacao do proprietario**.

- seletor de fonte adicionado a aba **Dicionario**, exibindo `essential` e os
  pacotes opcionais efetivamente instalados;
- quantidade de verbetes apresentada junto ao nome de cada pacote;
- listagem paginada em blocos de 50 verbetes, com intervalo atual, total e
  controles anterior/proxima;
- navegacao deterministica pelos shards do pacote, sem montar o catalogo
  completo em memoria;
- cache limitado a quatro buckets decodificados para manter o consumo de
  memoria previsivel;
- busca textual limitada ao pacote selecionado; historico e favoritos continuam
  agregados porque representam dados pessoais, nao conteudo de um pacote;
- filtros por escrita continuam disponiveis e reiniciam a navegacao na primeira
  pagina;
- troca ou remocao de pacote atualiza imediatamente as opcoes da aba;
- runtime legado preservado como fallback quando a fonte nao implementa
  navegacao paginada;
- Service Worker atualizado para `v3`, com verificacao explicita de atualizacao
  e requisicoes network-first sem cache HTTP intermediario;
- URLs dos modulos alterados na `15.7` foram versionadas para impedir a mistura
  de shell novo com runtime antigo depois de uma publicacao.

Validacao automatizada: paginas consecutivas do pacote `full` retornaram 50
verbetes sem sobreposicao, a busca exclusiva por `暗色` encontrou o verbete
esperado e a interface foi verificada em desktop e celular sem erros de pagina.
O artefato final manteve 1.319 arquivos e passou a 27.120.050 bytes.

## 4. Decisao Para Iniciar

Confirmar o modelo em camadas recomendado ou escolher entre:

- um unico pacote completo opcional, mais simples e mais pesado;
- pacotes somente por JLPT, mais intuitivos para estudo, mas dependentes de uma
  classificacao que nao cobre todas as entradas;
- camadas `essential/core/full`, recomendadas por equilibrar cobertura,
  desempenho e manutencao.

Nenhuma intervencao no Console Firebase e necessaria para iniciar a `15.1`.

## 5. Decisoes Consolidadas

- `essential`: 44 verbetes revisados do pacote atual, instalado por padrao;
- `core`: entradas JMdict com ao menos um marcador oficial de prioridade e kanji
  escolares/Jinmeiyo dos graus `1-6` e `8`;
- `full`: catalogo integral dos snapshots JMdict e KANJIDIC2;
- ingles continua como fallback no conteudo ampliado;
- apenas traducoes pt-BR revisadas integram o indice em portugues;
- o catalogo ampliado nao sera enviado ao Firestore nem versionado como JSON
  monolitico no repositorio;
- `15.4`: concluida e aprovada pelo proprietario;
- `15.5`: concluida e aprovada pelo proprietario;
- `15.6`: concluida com promocao comprimida, integracao com a busca e rollback
  real validados;
- `15.7`: implementada com seletor por pacote, navegacao paginada e consistencia
  de atualizacao do shell; aguarda validacao do proprietario;
- Fase 15 concluida; a proxima fase oficial e a Fase 16.
