# Fase 17: Seguranca, Rollout e Remocao do Legado

> Iniciada em: 2026-07-14
>
> Status geral: concluida e aprovada em 2026-07-15
>
> Subfase atual: nenhuma

## 1. Objetivo

Reduzir riscos de abuso, elevacao de privilegio, vazamento operacional e
regressoes durante o rollout Firebase. A remocao de compatibilidade legada so
pode ocorrer depois de monitoramento, backup e rollback comprovados.

## 2. Ativos Protegidos

- identidade Firebase e estado de aprovacao dos usuarios;
- claim administrativo e operacoes de gestao;
- dados pessoais do Desktop, Japanese Study e Finances;
- backups protegidos e respectivas senhas em memoria;
- regras, configuracoes de rollout e artefatos publicados;
- disponibilidade do login, sincronizacao e recuperacao;
- integridade dos pacotes publicos do dicionario.

A configuracao Web do Firebase, incluindo `apiKey`, identifica o projeto no
cliente e nao e tratada como segredo. Autorizacao depende de Auth, rules, claims
e, futuramente, App Check. Service accounts, chaves privadas e tokens de debug
sao segredos e nunca podem entrar no repositorio ou no artefato Pages.

## 3. Fronteiras de Confianca

1. **Navegador e Firebase Auth:** o cliente recebe identidade e claims assinados.
2. **Cliente e Firestore:** toda autorizacao efetiva pertence a `firestore.rules`.
3. **Host e iframes integrados:** mensagens exigem mesma origem, fonte esperada,
   protocolo versionado e correlacao por `MessageChannel`.
4. **Armazenamento local e conta Firebase:** dados locais usam escopo por `uid`,
   mas continuam acessiveis a quem controlar o perfil do navegador.
5. **GitHub Pages e dependencias CDN:** o host e estatico; Firebase SDK e carregado
   por URL HTTPS com versao fixada.
6. **Operacao administrativa:** claims e mudancas sensiveis exigem ambiente
   confiavel fora do navegador comum.

## 4. Matriz de Ameacas

| ID | Ameaca | Impacto | Controle atual | Tratamento |
| --- | --- | --- | --- | --- |
| T1 | Usuario altera status ou papel no proprio perfil | Critico | Rules restringem create/update e admin usa claim | Manter testes na 17.2 |
| T2 | Campo `role` diverge do claim `admin` | Alto | Rules e UI confiam somente no claim; campo e projecao | Resolvido na 17.4 |
| T3 | Cliente automatizado abusa Auth/Firestore | Alto | Auth, whitelist, rules e App Check em observacao | Rollout gradual na 17.5 |
| T4 | Token App Check ou service account entra no Git | Critico | `.gitignore` e teste de baseline | Bloqueio continuo desde 17.1 |
| T5 | Mensagem forjada entre iframe e host | Alto | Origem/fonte/protocolo no contrato | Wildcard restante removido na 17.1 |
| T6 | Flag local ou Emulator chega a producao | Alto | Flags centrais e validacao Pages | Gate automatico desde 17.1; ampliar na 17.5 |
| T7 | XSS ou dependencia CDN comprometida | Critico | Escaping parcial e HTTPS versionado | Inventario/CSP na 17.1-17.5 |
| T8 | Dispositivo ou perfil do navegador comprometido | Alto | Isolamento por uid e backup financeiro criptografado | Risco aceito; documentar logout/limpeza |
| T9 | Falha de rede/quota causa perda ou sobrescrita | Alto | Conflitos, backup, recovery e rollback | Coberto pela Fase 16; monitorar na 17.5 |
| T10 | Remocao precoce de aliases/fallbacks | Medio | Feature flags e caminhos legados preservados | Inventario e janela minima na 17.6 |
| T11 | Enumeracao ou leitura entre usuarios | Critico | Paths por uid e rules `isOwner/isApproved` | Testes integrados na 17.2 |
| T12 | Arquivo de backup adulterado | Alto | AES-GCM, checksum e validacao por app | Coberto pela Fase 16 |

## 5. Decisoes da 17.1

- `request.auth.token.admin == true` permanece a unica autoridade administrativa
  efetiva nas rules;
- o campo de perfil `role` nao sera promovido a fonte de autorizacao;
- a adequacao completa da UI a claims sera feita junto do script confiavel da
  17.4, evitando retirar acesso antes de existir operacao administrativa segura;
- App Check inicia sem enforcement e depende de observacao real antes de bloquear;
- nenhum alias, fallback local ou provider legado sera removido nesta subfase;
- toda remocao futura exige backup, versao estavel e procedimento de rollback.

Status: **concluida tecnicamente em 2026-07-14**.

## 6. Baseline Executavel

O comando `npm run test:security-baseline` verifica:

- claim administrativo, ownership, cadastro pendente e deny-by-default nas rules;
- Auth Firebase e emuladores desativados na configuracao de producao;
- ausencia de `postMessage` com destino curinga no runtime;
- ausencia de chaves privadas e tokens App Check atribuidos no codigo;
- protecao preventiva de credenciais e arquivos `.env` no `.gitignore`.

Resultado inicial: **5 de 5 testes aprovados**.

## 7. Testes Integrados da 17.2

A subfase 17.2 preserva os testes unitarios das rules e acrescenta clientes
Firebase reais conectados simultaneamente aos emuladores de Authentication e
Firestore. Nenhum usuario ou documento do projeto de producao e alterado.

Comandos disponiveis:

- `npm run test:firestore-rules`: executa os 10 cenarios isolados das rules;
- `npm run test:auth-firestore-integration`: executa os 4 fluxos integrados;
- `npm run test:firebase-security`: inicia os dois emuladores e executa as duas
  suites em sequencia.

Os fluxos integrados confirmam:

- cadastro real cria apenas o proprio perfil com status `pending`;
- o cliente nao consegue aprovar a propria conta nem atribuir papel admin;
- contas `pending` e `rejected` nao acessam os dados dos aplicativos;
- uma conta aprovada preserva o UID entre logout e novo login;
- usuarios aprovados acessam somente os caminhos vinculados ao proprio UID;
- logout remove imediatamente a autorizacao de leitura no Firestore.

Resultado em 2026-07-14: **10 de 10 testes de rules e 4 de 4 testes
integrados aprovados**.

Status: **concluida tecnicamente em 2026-07-14**.

## 8. App Check em Observacao da 17.3

O runtime compartilhado do Firebase agora inicializa App Check antes de Auth e
Firestore. Isso cobre Desktop, Japanese Study, Finances e futuras aplicacoes que
reutilizem `initFirebase`, sem acoplar o mecanismo a um `appId` especifico.

Decisoes desta subfase:

- provedor recomendado: reCAPTCHA Enterprise;
- token com renovacao automatica;
- inicializacao tolerante a falhas enquanto nao existe enforcement;
- emuladores ignoram App Check;
- debug e aceito somente em `localhost` e nunca na configuracao de producao;
- nenhuma API sera colocada em enforcement durante a coleta inicial.

Implementacao local concluida:

- inicializador compartilhado em `src/firebase/firebase-app-check.js`;
- configuracao publica registrada com a site key do dominio do GitHub Pages;
- `npm run test:app-check` com 6 cenarios aprovados;
- baseline continua protegendo tokens de debug e credenciais privilegiadas;
- artefatos content-addressed do dicionario preservam bytes LF por
  `.gitattributes`, inclusive em checkouts Windows;
- build Pages validado com 1.582 arquivos, 3 pacotes e 137 artefatos da
  distribuicao principal.

Intervencao concluida no Console:

1. no projeto `mathicx-file-desktop`, criar uma chave Website de pontuacao no
   reCAPTCHA Enterprise para o dominio `mathicx-file.github.io`;
2. em Firebase Console > App Check > Apps, registrar o Web App existente com o
   provedor reCAPTCHA Enterprise e essa site key;
3. manter Authentication e Cloud Firestore como **Unenforced**;
4. informar somente a site key publica para ativacao na configuracao do Pages.

A site key publica foi configurada no cliente em 2026-07-14. Authentication e
Cloud Firestore devem permanecer **Unenforced** durante toda a janela inicial de
observacao.

Nao adicionar `localhost` aos dominios reCAPTCHA. Quando testes locais contra o
backend real forem necessarios, sera usado um debug token privado registrado no
Console e mantido fora do repositorio.

Em 2026-07-16, o runtime local passou a reler o token gerado pelo SDK na base
`firebase-app-check-database` e reapresenta-lo no console a cada inicializacao
debug. O valor continua privado, nao e salvo no codigo e esse comportamento nao
e ativado no GitHub Pages (`debug: false`).

Primeiro teste publicado em 2026-07-14:

- Auth e sincronizacao continuam disponiveis com enforcement desligado;
- `exchangeRecaptchaEnterpriseToken` retorna HTTP 400 e entra em throttle;
- Desktop, Japanese Study e Finances reproduzem a mesma recusa;
- a resposta `FAILED_PRECONDITION` confirmou que a site key pertence ao projeto
  Google Cloud `mathicx-desktop`, diferente do projeto Firebase
  `mathicx-file-desktop`;
- a observacao ainda nao pode ser considerada valida.

Correcao definida: habilitar a API reCAPTCHA Enterprise no projeto existente
`mathicx-file-desktop`, criar nele uma nova chave Website `SCORE` para
`mathicx-file.github.io`, atualizar o registro do Web App e substituir somente
a site key publica no cliente. Chaves Enterprise nao sao movidas entre projetos.

Intervencao concluida em 2026-07-15: a API foi habilitada, o Web App foi
reconfigurado e uma nova site key do projeto `mathicx-file-desktop` substituiu a
chave do projeto incorreto. O deploy `6beba03` publicou somente a nova chave.

O reteste atingiu o endpoint correto, mas recebeu HTTP 403 e o SDK persistiu
`initial-throttle` por 24 horas. O App Check classificou essas chamadas como
invalidas. Antes de alterar codigo ou threshold, devem ser confirmados no
Console o Key ID vinculado ao Web App, o dominio permitido e o score das
avaliacoes. O proximo teste deve usar janela anonima para nao reutilizar o
throttle do perfil principal.

O mesmo teste revelou recursao em `launcher:close` e o token de sandbox invalido
`allow-storage`. Ambos foram corrigidos e possuem regressao automatizada.

Reteste final em 2026-07-15:

- o vinculo da chave e a configuracao do App Check foram corrigidos no Console;
- a troca de token deixou de retornar HTTP 403;
- login e sincronizacao permaneceram operacionais no cliente publicado;
- Authentication e Cloud Firestore continuam sem enforcement, conforme o plano;
- a observacao de metricas pode continuar sem bloquear o encerramento da 17.3.

Status: **concluida e aprovada em 2026-07-15**.

Rollback da 17.3:

1. deixar Authentication e Cloud Firestore como **Unenforced** no Console;
2. alterar `appCheck.enabled` para `false` na configuracao de producao;
3. publicar novamente; nao e necessario excluir a site key ou o registro do app.

## 9. Papeis Administrativos Confiaveis da 17.4

A autoridade administrativa do modo Firebase passa a vir exclusivamente da
custom claim assinada `admin == true`. O campo `users/{uid}.role` permanece
somente como projecao para exibicao e compatibilidade; ele nunca libera o painel,
as rules ou qualquer operacao privilegiada.

Implementacao:

- `src/auth/firebase-claims.js` concentra a decisao de papel baseada em claims;
- restaurar a sessao forca a renovacao do ID token e reconhece claims novas;
- o painel lista perfis Firebase e permite aprovar, rejeitar, bloquear e reativar;
- campos de perfil controlados pelo usuario sao escapados antes da renderizacao;
- promover ou rebaixar admin nao existe na interface Web Firebase;
- `scripts/firebase/manage-admin.mjs` usa Admin SDK e credenciais de aplicacao;
- alteracoes preservam outras custom claims e usam dry-run por padrao;
- a revogacao do ultimo admin e recusada, salvo override explicito;
- cada alteracao aplicada gera evento server-side em `adminAudit`;
- `adminAudit` e explicitamente inacessivel a qualquer cliente pelas rules.

Comandos:

```text
npm run firebase:admin -- show --email EMAIL
npm run firebase:admin -- grant --email EMAIL
npm run firebase:admin -- grant --email EMAIL --apply
npm run firebase:admin -- revoke --email EMAIL
npm run firebase:admin -- revoke --email EMAIL --apply
```

`grant` e `revoke` sem `--apply` sao apenas simulacoes. Depois de uma alteracao
real, a conta afetada deve sair e entrar novamente para receber o token novo.

Bootstrap do primeiro admin:

1. obter credenciais ADC com permissao para Firebase Auth e Firestore;
2. se for usada uma chave JSON, guarda-la fora do repositorio e definir
   `GOOGLE_APPLICATION_CREDENTIALS` apenas no terminal da operacao;
3. executar primeiro o `grant` sem `--apply` e conferir projeto, UID e e-mail;
4. repetir com `--apply`;
5. renovar a sessao no Desktop e validar o Painel Admin;
6. aprovar e rejeitar uma conta de teste pelo painel.

Exemplo no PowerShell, usando um arquivo mantido fora do repositorio:

```powershell
$env:GOOGLE_APPLICATION_CREDENTIALS = 'C:\firebase-admin\mathicx-file-desktop.json'
npm.cmd run firebase:admin -- grant --email EMAIL
npm.cmd run firebase:admin -- grant --email EMAIL --apply
Remove-Item Env:GOOGLE_APPLICATION_CREDENTIALS
```

Arquivos de service account, tokens e chaves privadas nao podem ser enviados ao
chat nem salvos no projeto. A `.gitignore` cobre nomes comuns como defesa extra,
mas a protecao principal e manter a credencial em outro diretorio.

Validacao automatizada local:

- 4 testes de claims, parser, preservacao e protecao do ultimo admin;
- baseline impede fallback de autoridade para o perfil Firestore;
- rules cobrem listagem e alteracao da whitelist por admin claim;
- rules recusam acesso cliente a `adminAudit`, inclusive para admin.

Validacao real em 2026-07-15:

- primeira custom claim administrativa aplicada no projeto correto;
- logout e novo login reconheceram o papel no token;
- Painel Admin apareceu e listou os usuarios Firebase;
- uma conta foi bloqueada pelo painel e o login bloqueado como esperado.

Status: **concluida e aprovada em 2026-07-15**.

Rollback da 17.4:

1. manter ao menos uma conta com claim admin;
2. reverter o cliente para ocultar a gestao remota, sem alterar as rules de claim;
3. usar `revoke` somente depois de confirmar outro administrador funcional;
4. nunca substituir custom claims inteiras manualmente sem preservar as demais.

## 10. Rollout e Monitoramento da 17.5

A 17.5 usa rollout por produto. Nenhum enforcement e ativado apenas por existir
um token valido; primeiro os gates tecnicos e as metricas precisam demonstrar
que as sessoes legitimas atuais estao verificadas.

Subfases:

- `17.5.1`: gates tecnicos, checklist e rollback - **implementada**;
- `17.5.2`: enforcement controlado do Cloud Firestore - **concluida**;
- `17.5.3`: enforcement controlado do Authentication - **concluida**;
- `17.5.4`: observacao final e aceite do rollout - **concluida**.

O comando abaixo repete App Check, claims, baseline, rules integradas, build,
validacao Pages e o inventario final de prontidao:

```text
npm run firebase:rollout:check
```

O workflow Pages tambem executa App Check, claims e baseline antes de publicar.
O validador do artefato recusa nomes associados a service accounts, Admin SDK e
chaves privadas, alem de confirmar que as ferramentas administrativas nao foram
incluidas no site.

### Gate Manual Antes de Cada Enforcement

No Firebase Console > App Check > APIs, revisar separadamente Cloud Firestore e
Authentication. Para o baixo trafego deste projeto, porcentagem isolada nao e
suficiente. O gate exige:

1. requisicoes verificadas produzidas pela versao Pages atual;
2. login normal e anonimo/privado reconhecidos como verificados;
3. Desktop, Japanese Study e Finances sincronizados com sucesso;
4. nenhuma requisicao invalida originada dessas sessoes deliberadas;
5. ausencia de volume material de clientes desatualizados;
6. rollback acessivel no Console e uma conta admin funcional.

### Ordem do Rollout

1. manter Authentication e Cloud Firestore sem enforcement durante a revisao;
2. ativar enforcement apenas para Cloud Firestore;
3. aguardar ate 15 minutos e repetir login, leitura e sync dos tres modulos;
4. observar uma janela controlada de 60 a 90 minutos sem regressao antes do
   segundo produto, usando 24 horas como fallback se as metricas forem ambiguas;
5. ativar enforcement para Authentication;
6. aguardar ate 15 minutos, testar novo login, logout, restauracao de sessao e
   whitelist;
7. observar outra janela controlada de 60 a 90 minutos e registrar o aceite da
   `17.5.4`, usando 24 horas como fallback se as metricas forem ambiguas.

Clientes locais deixarao de acessar o backend real depois do enforcement se nao
usarem debug provider. O token de debug deve ser registrado no Console, mantido
fora do repositorio e removido quando o teste terminar. Emuladores continuam
ignorando App Check e sao a opcao padrao para suites automatizadas.

### Rollback

Se login, leitura ou sincronizacao legitima falhar depois de um estagio:

1. retornar somente o produto afetado para **Unenforced** no Console;
2. aguardar ate 15 minutos pela propagacao;
3. repetir login e sync e confirmar recuperacao;
4. registrar horario, produto, categoria da metrica e erro do Console;
5. nao avancar ao proximo produto ate identificar a origem.

Desativar `appCheck.enabled` no cliente e um rollback secundario e so deve ser
feito com todos os produtos novamente sem enforcement.

Status: **17.5 concluida e aprovada**.

Validacao em 2026-07-15:

- `firebase:rollout:check` retornou `technicalReady: true`;
- 18 de 18 controles de prontidao foram aprovados;
- 6 testes App Check, 4 de claims e 9 de baseline passaram;
- 12 testes de rules e 4 integracoes Auth/Firestore passaram;
- 6 testes do artefato Pages passaram, inclusive credencial com nome suspeito;
- artefato final validado com 1.583 arquivos e nenhuma ferramenta privilegiada.

### Baseline Real da 17.5.2

Metricas das ultimas 24 horas revisadas em 2026-07-15:

| Produto | Estado | Verificadas | Desatualizadas | Origem desconhecida | Invalidas |
| --- | --- | ---: | ---: | ---: | ---: |
| Authentication | Monitorando | 15/35 (43%) | 1/35 (3%) | 6/35 (17%) | 13/35 (37%) |
| Cloud Firestore | Monitorando | 197/992 (20%) | 288/992 (29%) | 0/992 (0%) | 507/992 (51%) |

Decisao: **no-go temporario para enforcement**. A janela ainda inclui as chaves
incorretas, respostas 400/403, throttle, versoes Pages anteriores e testes locais
sem debug provider. O extremo mais recente dos graficos mostra requisicoes
verificadas, sinal compativel com a correcao, mas ainda nao substitui uma janela
limpa.

Proximo gate:

1. usar somente a versao Pages durante a nova janela de observacao;
2. nao acessar o backend real por localhost sem debug provider registrado;
3. repetir login, logout e sync dos tres modulos pela versao publicada em uma
   sessao comum e uma segunda sessao aprovada;
4. aguardar entre 60 e 90 minutos e revisar o bloco horario mais recente dos
   graficos de Authentication e Cloud Firestore;
5. exigir que as sessoes deliberadas aparecam como verificadas e que nao gerem
   novas requisicoes invalidas, desatualizadas ou de origem desconhecida antes
   de aprovar a `17.5.2`;
6. usar a janela completa de 24 horas como fallback quando o bloco horario nao
   permitir separar o trafego controlado dos erros historicos.

O resumo percentual do Console permanece agregado em 24 horas, mas o grafico
oferece blocos horarios. Para este projeto pessoal e de baixo trafego, um bloco
horario limpo produzido pelo teste controlado e aceito como gate acelerado para
iniciar o enforcement do Cloud Firestore. Isso nao elimina a observacao posterior
ao enforcement antes de avancar para Authentication.

Validacao acelerada concluida em 2026-07-15, usando o filtro de ultimos 60
minutos do Console:

| Produto | Verificadas | Desatualizadas | Origem desconhecida | Invalidas |
| --- | ---: | ---: | ---: | ---: |
| Authentication | 8/8 (100%) | 0/8 | 0/8 | 0/8 |
| Cloud Firestore | 101/101 (100%) | 0/101 | 0/101 | 0/101 |

Decisao: **go para o enforcement controlado do Cloud Firestore**. Authentication
deve permanecer em Monitorando ate a conclusao dos testes da `17.5.2`.

O enforcement do Cloud Firestore foi aplicado em 2026-07-15. Depois da
propagacao, login e sincronizacao do Mathicx Desktop, Japanese Study e Finances
foram validados na versao Pages sem erros de App Check, permissao ou regressao
funcional.

Status da `17.5.2`: **concluida**.

O enforcement do Authentication foi aplicado em 2026-07-15. Depois da
propagacao, foram validados login e logout de usuario aprovado, restauracao de
sessao, estados pendente e bloqueado, painel administrativo e sincronizacao das
aplicacoes, sem regressao funcional ou erro de App Check.

Status da `17.5.3`: **concluida**.

Proxima etapa: **17.5.4 - repetir o gate tecnico, observar as metricas finais com
os dois produtos aplicados e registrar o aceite do rollout**.

Gate tecnico final executado em 2026-07-15:

- `firebase:rollout:check` retornou `technicalReady: true`;
- 18 de 18 controles de prontidao foram aprovados;
- 6 testes App Check, 4 de claims e 9 de baseline passaram;
- 12 testes de rules e 4 integracoes Auth/Firestore passaram;
- o artefato Pages foi reconstruido e validado com 1.583 arquivos;
- nenhuma ferramenta privilegiada foi incluida no artefato.

Status da `17.5.4`: **gate tecnico aprovado; aguarda metricas finais de uma
janela controlada com Authentication e Cloud Firestore aplicados**.

Metricas finais aprovadas em 2026-07-15, com os dois produtos em estado
**Aplicada** e filtro de ultimos 60 minutos:

| Produto | Verificadas | Desatualizadas | Origem desconhecida | Invalidas |
| --- | ---: | ---: | ---: | ---: |
| Authentication | 23/23 (100%) | 0/23 | 0/23 | 0/23 |
| Cloud Firestore | 242/242 (100%) | 0/242 | 0/242 | 0/242 |

Status da `17.5.4`: **concluida e aprovada**.

Status da `17.5`: **concluida e aprovada**.

## 11. Inventario e Remocao Gradual do Legado na 17.6

Subfases:

- `17.6.1`: inventariar aliases, fallbacks, flags e caminhos de compatibilidade
  - **concluida**;
- `17.6.2`: classificar cada item e aprovar a estrategia de remocao
  - **concluida**;
- `17.6.3`: remover somente os itens aprovados, com migracao e rollback
  - **concluida**;
- `17.6.4`: executar regressao completa e encerrar a Fase 17
  - **concluida**.

Nenhuma compatibilidade sera removida durante a `17.6.1`.

O inventario detalhado esta em `FIREBASE_PHASE_17_6_LEGACY_INVENTORY.md`. Ele
separou persistencia local necessaria de autenticacao local dormente, identificou
quatro flags sem consumidores e preservou alias de app, fallback do dicionario,
controles de rollback e escopo por UID ate decisao explicita.

A `17.6.2` aprovou a retirada somente das quatro flags sem consumidor e dos
comentarios obsoletos. A autenticacao local e seus dados ficam preservados por
uma release estavel; alias, fallback do dicionario, `role`, cache, offline e
isolamento por UID permanecem suportados.

A `17.6.3` removeu as quatro flags sem consumidor e atualizou comentarios de
runtime obsoletos. O gate `firebase:rollout:check` permaneceu aprovado com 18 de
18 controles, 12 testes de rules, 4 integracoes Auth/Firestore e artefato Pages
valido. Nenhum dado, provider, alias ou fallback foi removido.

A regressao da `17.6.4` aprovou 55 testes adicionais e o script de migracao de
IDs. Foram cobertos launcher, contratos host/iframe, Central de Sincronizacao,
backup protegido, restauracao e rollback, sync Firebase do Japanese Study e
Finances, equivalencia do dicionario e carregamento lazy/offline.

Status da `17.6`: **concluida**.

Status da Fase 17: **concluida e aprovada em 2026-07-15**.

### Aviso de Sandbox dos Aplicativos Integrados

Chrome registra um aviso para Japanese Study e Finances porque os iframes de
mesma origem usam simultaneamente `allow-scripts` e `allow-same-origin`. Essa
combinacao e necessaria no desenho atual para Firebase Auth, armazenamento local,
IndexedDB e contratos validados por origem, mas significa que o sandbox nao e
uma fronteira forte contra codigo comprometido dentro desses aplicativos.

Classificacao: **risco arquitetural aceito; nao bloqueia App Check**. Os dois
aplicativos sao codigo first-party do mesmo repositorio e nenhum conteudo
arbitrario e carregado no frame. Remover uma permissao isoladamente causaria
regressoes. A `17.6` deve inventariar essa compatibilidade e uma evolucao futura
pode mover aplicativos para origens separadas ou centralizar Auth/storage no
host antes de endurecer o sandbox.

## 12. Fora de Escopo

- proteger dados contra controle total do dispositivo ou perfil do navegador;
- criptografia ponta a ponta dos documentos armazenados no Firestore;
- substituir os mecanismos de seguranca da plataforma Firebase;
- enforcement App Check antes da medicao da 17.3;
- remocao de compatibilidade antes da 17.6.

## 13. Subfases da Fase 17

- `17.1`: matriz de ameacas e limites - **concluida tecnicamente**;
- `17.2`: testes Auth/Firestore integrados - **concluida tecnicamente**;
- `17.3`: App Check em observacao - **concluida e aprovada**;
- `17.4`: papeis administrativos confiaveis - **concluida e aprovada**;
- `17.5`: rollout e monitoramento - **concluida e aprovada**;
- `17.6`: inventario e remocao gradual do legado - **concluida**.

A Fase 17 possui **6 subfases** no total.

## 14. Criterios de Saida Concluidos

- ativos e fronteiras de confianca documentados;
- ameacas possuem impacto, controle e subfase responsavel;
- nenhuma credencial administrativa e tratada como configuracao Web publica;
- comunicacao entre host e iframe nao usa destino curinga;
- baseline pode ser repetido por um unico comando;
- decisoes que dependem do Console permanecem explicitamente adiadas;
- integracao real entre Auth e Firestore pode ser repetida por um unico comando;
- cadastro, aprovacao, isolamento por UID e logout foram validados em emuladores.
- cliente publicado troca tokens App Check sem erro e preserva login e sync;
- enforcement permanece adiado para o rollout controlado da 17.5.
- autoridade administrativa real e entregue somente por custom claim assinada;
- whitelist Firebase foi operada e validada pelo Painel Admin;

## 14. Referencias Oficiais

Consultadas em 2026-07-14:

- Firebase API keys: https://firebase.google.com/docs/projects/api-keys
- App Check Web com reCAPTCHA Enterprise: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- Metricas antes do enforcement: https://firebase.google.com/docs/app-check/monitor-metrics
- App Check debug provider: https://firebase.google.com/docs/app-check/web/debug-provider
- Custom claims e Admin SDK: https://firebase.google.com/docs/auth/admin/custom-claims
