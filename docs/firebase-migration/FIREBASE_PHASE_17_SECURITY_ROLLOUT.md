# Fase 17: Seguranca, Rollout e Remocao do Legado

> Iniciada em: 2026-07-14
>
> Status geral: em andamento
>
> Subfase atual: 17.3 em andamento; pronta para deploy e observacao

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
| T2 | Campo `role` diverge do claim `admin` | Alto | Rules confiam apenas no claim; UI ainda preserva compatibilidade | Resolver na 17.4 |
| T3 | Cliente automatizado abusa Auth/Firestore | Alto | Auth, whitelist e rules; App Check ausente | Observacao na 17.3 |
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

Status: **implementacao e registro preparados; aguarda deploy para observacao**.

Rollback da 17.3:

1. deixar Authentication e Cloud Firestore como **Unenforced** no Console;
2. alterar `appCheck.enabled` para `false` na configuracao de producao;
3. publicar novamente; nao e necessario excluir a site key ou o registro do app.

## 9. Fora de Escopo

- proteger dados contra controle total do dispositivo ou perfil do navegador;
- criptografia ponta a ponta dos documentos armazenados no Firestore;
- substituir os mecanismos de seguranca da plataforma Firebase;
- enforcement App Check antes da medicao da 17.3;
- remocao de compatibilidade antes da 17.6.

## 10. Subfases da Fase 17

- `17.1`: matriz de ameacas e limites - **concluida tecnicamente**;
- `17.2`: testes Auth/Firestore integrados - **concluida tecnicamente**;
- `17.3`: App Check em observacao - **em andamento**;
- `17.4`: papeis administrativos confiaveis;
- `17.5`: rollout e monitoramento;
- `17.6`: inventario e remocao gradual do legado.

A Fase 17 possui **6 subfases** no total.

## 11. Criterios de Saida Concluidos

- ativos e fronteiras de confianca documentados;
- ameacas possuem impacto, controle e subfase responsavel;
- nenhuma credencial administrativa e tratada como configuracao Web publica;
- comunicacao entre host e iframe nao usa destino curinga;
- baseline pode ser repetido por um unico comando;
- decisoes que dependem do Console permanecem explicitamente adiadas;
- integracao real entre Auth e Firestore pode ser repetida por um unico comando;
- cadastro, aprovacao, isolamento por UID e logout foram validados em emuladores.

## 12. Referencias Oficiais

Consultadas em 2026-07-14:

- Firebase API keys: https://firebase.google.com/docs/projects/api-keys
- App Check Web com reCAPTCHA Enterprise: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
- Metricas antes do enforcement: https://firebase.google.com/docs/app-check/monitor-metrics
- App Check debug provider: https://firebase.google.com/docs/app-check/web/debug-provider
- Custom claims e Admin SDK: https://firebase.google.com/docs/auth/admin/custom-claims
