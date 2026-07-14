# Fase 16: Confiabilidade, Backup e Recuperacao

> Iniciada em: 2026-07-14
>
> Status geral: concluida tecnicamente
>
> Subfase atual: 16.6 concluida; Fase 16 encerrada

## 1. Objetivo

Criar uma camada central e segura para consultar sincronizacao, exportar dados e
restaurar backups do desktop e dos aplicativos integrados. A implementacao deve
preservar o isolamento por usuario e por aplicativo ja adotado no Firestore.

## 2. Politica Aprovada

O projeto segue o modelo hibrido recomendado:

- backups sem dados financeiros poderao ser exportados sem senha;
- um pacote que contenha dados do Finances devera ser criptografado por senha;
- a criptografia do pacote sera implementada na Fase 16.4;
- nenhuma restauracao pode ocorrer sem confirmacao explicita do usuario;
- importacao deve informar o modo `merge` ou `replace`;
- a Fase 16.5 adicionara backup local preventivo e rollback atomico.

A Fase 16.1 nao cria arquivos unificados nem executa restauracao pela interface.
Ela estabelece os contratos necessarios para que as fases seguintes facam isso
sem acessar diretamente os detalhes internos de cada aplicativo.

## 3. Fase 16.1: Contratos Compartilhados

Status: **concluida tecnicamente em 2026-07-14**.

### Protocolo

O host e os iframes usam o protocolo versionado `mathicx-app-data`, versao `1`,
por `postMessage` e `MessageChannel`. Cada requisicao possui:

- `requestId` unico;
- `appId` canonico;
- acao pertencente a uma lista fechada;
- payload estruturado;
- resposta correlacionada com `requestId`, `appId` e acao.

A ponte aceita apenas mensagens da mesma origem e, dentro de um iframe, apenas
mensagens vindas da janela pai. Erros atravessam a fronteira somente como
`code` e `message`, sem expor objetos internos.

### Operacoes v1

- `capabilities`: descreve recursos, formato e modos suportados;
- `sync-status`: retorna o ultimo estado conhecido da sincronizacao;
- `sync-now`: solicita sincronizacao manual;
- `backup-export`: exporta o estado versionado do aplicativo;
- `backup-validate`: valida formato e schema antes de importar;
- `backup-import`: importa somente com `confirmed: true` e modo explicito.

### Adaptadores

Desktop:

- formato `mathicx-desktop-backup`, schema `1`;
- exporta apenas tema, widgets, layout, atalhos, favoritos e itens fixados;
- nao exporta sessao, credenciais, tokens ou caches.

Japanese Study:

- reutiliza o formato `japanese-study-backup`, schema `1`;
- reutiliza a validacao e os modos `merge`/`replace` existentes;
- expoe o estado da sincronizacao Firebase sem duplicar persistencia.

Finances:

- formato `finances-backup`, schema `1`;
- encapsula o snapshot financeiro existente em envelope versionado;
- declara `containsFinancialData: true` para bloquear exportacao unificada sem
  a criptografia que sera adicionada na Fase 16.4.

### Arquivos Principais

- `src/apps/integration/app-data-contract.js`;
- `src/apps/integration/app-data-host.js`;
- `src/data/desktop/desktop-app-data.js`;
- `Applications/japanese-study/js/app-data-adapter.js`;
- `Applications/finances/js/app-data-adapter.js`.

### Validacao

- contrato compartilhado: 6 testes aprovados;
- Finances: 42 testes aprovados, incluindo smoke, funcional e Firebase;
- Japanese Study: 84 testes aprovados; 12 testes antigos do carregador do
  dicionario continuam falhando por divergencia entre tamanho/hash do manifest
  promovido na Fase 15 e os artefatos locais;
- build do Pages inclui os novos modulos, mas sua validacao integral encontra a
  mesma divergencia nos descritores dos pacotes `core/full` da Fase 15.9.

A divergencia do dicionario deve ser corrigida em uma manutencao especifica dos
artefatos publicados. Ela nao altera nem bloqueia o contrato da Fase 16.1.

## 4. Fase 16.2: Central de Sincronizacao

Status: **concluida e aprovada pelo proprietario em 2026-07-14**.

A aplicacao Configuracoes recebeu uma aba `Sincronizacao` com:

- resumo de aplicativos sincronizados, com atencao e fechados;
- estado individual do Desktop, Japanese Study e Finances;
- mensagem operacional e horario da ultima sincronizacao quando disponivel;
- sincronizacao manual individual ou de todos os aplicativos disponiveis;
- atualizacao manual e consulta automatica a cada 30 segundos;
- botao para abrir um aplicativo integrado que ainda estiver fechado;
- atualizacao automatica quando um adaptador entra ou sai do host.

O Desktop permanece sempre consultavel. Japanese Study e Finances preservam o
carregamento lazy: enquanto fechados, a Central nao inicializa seus runtimes e
informa que e necessario abrir o aplicativo. Assim que o iframe termina de
carregar, sua linha e atualizada sem recarregar as Configuracoes.

Estados normalizados pela interface:

- `synced`: sincronizado;
- `syncing`, `hydrating` e `checking`: operacao em andamento;
- `conflict` e `pending`: requer atencao;
- `error`: falha de sincronizacao;
- `disabled`: sincronizacao desativada;
- `closed`: aplicativo fechado.

Validacao automatizada e visual:

- 2 testes do modelo da Central aprovados;
- 5 testes do contrato compartilhado aprovados;
- transicao real de Japanese Study fechado para disponivel validada no Chrome;
- layout validado em `900x650` e `390x740`, sem sobreposicao de controles.

Correcao posterior ao primeiro teste do proprietario:

- o iframe passa a ser registrado imediatamente ao abrir a janela, sem depender
  do termino do evento `load`;
- o evento `load` continua sendo usado como confirmacao adicional de prontidao;
- a Central repete a consulta em `100 ms`, `1,5 s` e `5 s` apos mudancas no
  registro, cobrindo inicializacoes mais lentas;
- o fluxo real do Window Manager foi validado abrindo Japanese Study e Finances
  pelos botoes da propria Central, ambos com seus contratos disponiveis.

Segundo reforco apos validacao no Chrome do proprietario:

- a Central nao depende mais exclusivamente do registro compartilhado;
- cada atualizacao tambem localiza o iframe diretamente na janela aberta do
  Window Manager;
- consultas e sincronizacao podem usar esse iframe como canal de contingencia;
- o teste removeu intencionalmente Japanese Study do registro, manteve sua
  janela aberta e confirmou que `Atualizar estados` exibiu o status remoto e
  habilitou a acao de sincronizacao sem erros de pagina.

## 5. Fase 16.3: Exportacao Unificada

Status: **concluida e aprovada pelo proprietario em 2026-07-14**.

Formato criado: `mathicx-unified-backup`, schema `1`.

O pacote JSON possui:

- versao do formato e do protocolo compartilhado;
- data ISO da exportacao;
- indicador explicito `encrypted: false`;
- lista dos aplicativos incluidos;
- formato e schema originais de cada aplicativo;
- backup validado pelo proprio adaptador antes da composicao;
- checksum SHA-256 individual calculado sobre JSON canonico.

A Central permite selecionar Mathicx Desktop e Japanese Study. Aplicativos
fechados permanecem indisponiveis ate serem abertos. O Finances aparece
bloqueado, pois a politica aprovada proibe exportar dados financeiros sem a
criptografia por senha que sera implementada na Fase 16.4.

Protecoes desta subfase:

- selecao vazia e recusada;
- formato/schema divergente e recusado;
- exportacao rejeitada pelo adaptador nao entra no pacote;
- conteudo financeiro sem criptografia e recusado tambem na camada de dominio;
- alteracao posterior no conteudo invalida o checksum;
- nomes de arquivo seguem `mathicx-backup-<data>.json`.

Validacao:

- 4 testes do envelope, checksum, coleta e bloqueio financeiro aprovados;
- download real validado no Chrome com Desktop e Japanese Study;
- arquivo baixado continha os dois apps e checksums SHA-256 de 64 caracteres;
- nenhum erro de pagina durante composicao e download.

## 6. Fase 16.4: Criptografia por Senha

Status: **concluida e aprovada pelo proprietario em 2026-07-14**.

Formato externo: `mathicx-encrypted-backup`, schema `1`.

Parametros criptograficos:

- AES-GCM com chave de 256 bits e tag de autenticacao de 128 bits;
- IV aleatorio de 96 bits para cada exportacao;
- chave derivada por PBKDF2-HMAC-SHA-256;
- salt aleatorio de 128 bits;
- 600.000 iteracoes de PBKDF2;
- metadados do envelope autenticados como `additionalData` do AES-GCM;
- senha aceita entre 12 e 256 caracteres e nunca persistida.

O envelope externo contem apenas formato, versao, data, parametros publicos da
criptografia e ciphertext Base64. A lista de apps, formatos internos, checksums
e dados pessoais ficam integralmente dentro do conteudo criptografado.

A Central agora possui os modos `Sem senha` e `Com senha`. No modo protegido:

- senha e confirmacao sao obrigatorias;
- Desktop, Japanese Study e Finances podem ser selecionados;
- cada app continua validando seu backup antes da composicao;
- o pacote unificado interno e marcado como protegido e nao pode ser baixado
  pela funcao de JSON comum;
- os campos de senha sao limpos depois de uma exportacao bem-sucedida.

Falhas de autenticacao do AES-GCM sao apresentadas como `senha incorreta ou
arquivo corrompido`, sem expor qual condicao ocorreu.

Validacao:

- 3 testes criptograficos aprovados: round-trip financeiro, senha incorreta,
  senha fraca e parametros adulterados;
- derivacao com 600.000 iteracoes ficou abaixo de um segundo por operacao no
  ambiente automatizado;
- download real no Chrome incluiu Desktop, Japanese Study e Finances;
- nenhum nome/formato interno apareceu em texto aberto no envelope;
- descriptografia posterior recuperou os tres backups e seus checksums;
- nenhum erro de pagina foi registrado.

Referencias tecnicas:

- OWASP Password Storage Cheat Sheet: PBKDF2-HMAC-SHA-256 com 600.000 iteracoes;
- Web Crypto API: `deriveKey`, PBKDF2 e AES-GCM;
- NIST SP 800-38D: requisitos de IV para AES-GCM.

## 7. Fase 16.5: Restauracao Seletiva e Rollback

### Correcao apos validacao do proprietario

- O Japanese Study somente anuncia o contrato de backup depois de concluir a selecao do escopo do usuario Firebase.
- A importacao aguarda a gravacao restaurada no Firestore antes de retornar sucesso ao desktop.
- O modo `Substituir` remove documentos remotos antigos de SRS, eventos e conquistas antes de gravar o snapshot restaurado.
- O shell offline foi promovido para o cache `v9`, evitando que o navegador preserve o adaptador anterior.

Status: **concluida e aprovada pelo proprietario em 2026-07-14**.

A validacao final no Chrome confirmou a restauracao do Japanese Study nos modos
`Mesclar` e `Substituir`, isoladamente e junto aos demais aplicativos. A tentativa
anterior estava sendo executada por uma instancia local antiga; um novo servidor
com os dados do site limpos carregou o shell atualizado e concluiu o fluxo. Em
testes futuros de mudancas no service worker, deve-se confirmar a URL/porta ativa
e a versao do cache antes de classificar o resultado como regressao funcional.

A Central recebeu a area `Restaurar backup` com:

- leitura de arquivos JSON de ate 100 MB;
- deteccao de pacote comum ou protegido;
- desbloqueio local por senha para envelopes AES-GCM;
- validacao do envelope, checksums e contratos dos aplicativos;
- selecao individual dos apps presentes no arquivo;
- modo `Mesclar` ou `Substituir` por aplicativo;
- abertura de apps fechados antes da restauracao;
- confirmacao explicita antes de qualquer alteracao.

Fluxo transacional:

1. validar integralmente o arquivo e cada backup de app;
2. pausar os envios automaticos ao Firebase;
3. exportar snapshots atuais dos apps selecionados;
4. baixar `mathicx-recovery-before-restore-<data>.json`;
5. aplicar as restauracoes em sequencia;
6. em falha, restaurar os snapshots tocados em ordem reversa;
7. liberar a sincronizacao apenas com o estado final confirmado ou recuperado.

Se o arquivo de origem for protegido ou contiver Finances, o recovery tambem e
criptografado com a mesma senha mantida apenas em memoria. Uma falha no download
preventivo interrompe o processo antes da primeira escrita.

Novas operacoes do protocolo:

- `restore-begin`: suspende timers de upload durante a transacao;
- `restore-end`: libera os timers com `commit: true/false`.

Desktop, Japanese Study e Finances implementam essas operacoes. Alteracoes
observadas durante a pausa sao consolidadas em uma unica sincronizacao posterior.

Validacao:

- 3 testes do orquestrador aprovados;
- restore seletivo ocorre somente depois do callback de recovery;
- falha simulada no segundo app restaura os apps tocados em ordem reversa;
- fluxo visual real no Chrome exportou origem e recovery protegidos;
- Desktop, Japanese Study e Finances voltaram aos estados originais;
- eventos encerraram em ordem reversa com `commit: true`;
- segundo round-trip usou os adaptadores reais de Japanese Study e Finances em
  modo `Substituir`, tambem sem erros;
- nenhum erro de pagina foi registrado.

## 8. Fase 16.6: Testes Integrados de Recuperacao

Status: **concluida tecnicamente em 2026-07-14**.

A subfase consolidou a verificacao em `npm run test:recovery`, com 17 testes
automatizados cobrindo:

- pacote corrompido bloqueado antes de pausar apps ou salvar recovery;
- senha incorreta, metadados adulterados e senha abaixo da politica;
- impossibilidade de salvar o recovery sem executar nenhuma importacao;
- falha ao pausar um app com retomada apenas dos apps ja suspensos;
- falha de importacao com rollback em ordem reversa;
- rollback incompleto identificado por aplicativo;
- falha de rede no commit do Japanese Study sem perda do estado anterior;
- round-trip protegido pelos adaptadores reais de Desktop, Japanese Study e
  Finances;
- recovery protegido descriptografado e comparado com o estado existente antes
  da restauracao;
- retomada dos tres adaptadores em ordem reversa e com o resultado correto da
  transacao.

Regressao complementar aprovada:

- 7 testes do contrato compartilhado;
- 3 testes da Central de Sincronizacao;
- 14 testes direcionados de backup, isolamento, Firebase e PWA do Japanese Study;
- smoke test, 37 testes funcionais e 5 testes Firebase do Finances;
- migracao de IDs e build estatico do Pages aprovados.

O `pages:validate` continua bloqueado somente pela divergencia ja conhecida de
hash/tamanho em `packages/2026.07.13-3/core/manifest.json`, sem relacao com a
Fase 16.

## 9. Criterio de Saida da 16.1

- host descobre e chama adaptadores sem conhecer seus storages internos;
- desktop, Japanese Study e Finances respondem ao mesmo protocolo;
- formatos e schemas sao versionados;
- origem, fonte e correlacao de mensagens sao verificadas;
- restauracao sem confirmacao explicita e recusada;
- dados financeiros sao identificados para a politica da Fase 16.4.

## 10. Criterio de Saida da 16.2

- os tres dominios aparecem na mesma Central;
- aplicativos lazy nao sao iniciados silenciosamente;
- entrada e saida de iframes atualizam a disponibilidade;
- sincronizacao manual usa apenas o contrato da Fase 16.1;
- estados de conflito, erro, pendencia e indisponibilidade ficam visiveis;
- controles permanecem utilizaveis em desktop e celular.

## 11. Criterio de Saida da 16.3

- usuario escolhe quais apps nao financeiros entram no arquivo;
- cada app valida sua propria exportacao;
- pacote unificado e versionado e verificavel por checksum;
- Finances nao pode vazar para um arquivo sem criptografia;
- download usa nome previsivel e nao altera os dados locais.

## 12. Criterio de Saida da 16.4

- Finances so entra em arquivo protegido por senha;
- senha e confirmacao sao validadas e nunca persistidas;
- salt e IV sao novos em cada exportacao;
- adulteracao de ciphertext ou metadados impede descriptografia;
- envelope nao revela a lista de aplicativos ou dados pessoais;
- arquivo protegido pode ser descriptografado para o pacote unificado original.

## 13. Criterio de Saida da 16.5

- nenhuma escrita ocorre antes da validacao e do recovery local;
- usuario escolhe apps e modo de importacao individualmente;
- restore exige confirmacao explicita;
- uploads automaticos ficam suspensos durante a transacao;
- falha restaura snapshots em ordem reversa;
- falha parcial de rollback e apresentada sem esconder o recovery baixado;
- senha e conteudo descriptografado permanecem apenas em memoria.

## 14. Criterio de Saida da 16.6

- caminhos felizes e falhas usam a mesma API publica dos adaptadores;
- nenhuma importacao comeca se validacao ou recovery falhar;
- falha parcial preserva o recovery e identifica o app afetado;
- rollback recupera o estado existente antes da transacao;
- pacote protegido completo restaura os tres dominios sem expor plaintext;
- a matriz pode ser repetida por um unico comando local.
