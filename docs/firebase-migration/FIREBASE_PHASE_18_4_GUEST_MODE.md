# Fase 18.4: Modo Visitante Local

> Iniciada em: 2026-07-16
>
> Status: concluida e aprovada em 2026-07-16

## 1. Objetivo

Permitir o uso do Mathicx Desktop sem conta, mantendo todos os dados no
navegador e sem enfraquecer whitelist, rules, App Check ou isolamento por UID.
Esta fase nao utiliza Firebase Anonymous Auth.

## 2. Decisoes de Seguranca

- o visitante usa o escopo reservado `guest-local-v1`;
- o usuario sintetico nao possui UID nem e-mail;
- Firestore e sincronizacao ficam indisponiveis nesse escopo;
- painel administrativo, whitelist e operacoes de usuario ficam bloqueados;
- a sessao guarda somente a opcao de continuar como visitante;
- credenciais, tokens e dados pessoais nao sao criados;
- dados de contas e dados do visitante permanecem separados no mesmo navegador.

## 3. Subfases

### 18.4.1 Entrada e Sessao

Status: **concluida e aprovada em 2026-07-16**.

- botao `Continuar como visitante` no gate Firebase;
- restauracao da sessao visitante ao recarregar;
- saida pelo menu normal do usuario;
- perfil explicito `Visitante` e sem privilegios administrativos.

### 18.4.2 Isolamento Local

Status: **concluida e aprovada em 2026-07-16**.

- preferencias, widgets, atalhos e dashboard em namespace proprio;
- Explorer virtual filtrado pelo escopo atual;
- reset do visitante remove somente seus dados;
- dados locais preexistentes continuam no escopo normal.

### 18.4.3 Aplicativos Integrados e Firebase

Status: **concluida e aprovada em 2026-07-16**.

- Desktop Sync retorna `guest-local` sem criar repositorio Firestore;
- Japanese Study recebe o escopo pela URL e nao inicia Firebase Sync;
- Finances reconhece o escopo visitante e permanece local;
- diagnostico identifica o modo como `Visitante local`;
- backup local permanece disponivel como mecanismo de preservacao.

### 18.4.4 Validacao Operacional

Status: **concluida e aprovada em 2026-07-16**.

Validar entrada, recarga, isolamento, aplicativos, reset e ausencia de erros no
console. O teste automatizado `npm run test:guest-mode` cobre sessao, escopo,
Explorer e contrato dos aplicativos.

### 18.4.5 Migracao Confirmada para Conta

Status: **concluida e aprovada em 2026-07-16**.

Como contas novas dependem da whitelist, a migracao nao ocorre durante o
cadastro pendente. O visitante exporta um arquivo identificado por procedencia,
sem UID ou credenciais. Depois do login aprovado, Configuracoes oferece a
migracao com selecao por aplicativo e modos `Mesclar` ou `Substituir`.

Antes da primeira alteracao, o Desktop baixa um backup preventivo da conta. Uma
falha restaura os estados anteriores em ordem reversa. Finances exige pacote
protegido; o marcador local de migracao contem somente versao e data, nunca o
conteudo exportado. Nada e enviado automaticamente.

Validacao tecnica em 2026-07-16:

- 17 testes de sessao, isolamento, contrato e pacote visitante aprovados;
- 12 testes de criptografia, restauracao e rollback aprovados;
- exportacao real no Chrome gerou `mathicx-guest-migration-*.json`;
- pacote exportado declarou `guest-local` sem UID, e-mail ou credenciais;
- marcador local guardou somente schema e data;
- nenhum erro de pagina ocorreu durante a exportacao.

Validacao final do proprietario:

- pacote visitante exportado corretamente;
- login em conta Firebase aprovada concluido;
- pacote identificado importado com sucesso;
- dados migrados ficaram disponiveis no escopo da conta;
- modo visitante e sincronizacao desativada permaneceram isolados.

## 4. Criterios de Aceite

1. visitante entra e recarrega a pagina sem conta;
2. visitante nunca le nem escreve Firestore;
3. dados do visitante nao aparecem depois do login normal;
4. dados da conta nao aparecem no modo visitante;
5. Japanese Study e Finances funcionam localmente;
6. reset e logout nao removem dados de outro escopo;
7. eventual migracao exige conta aprovada, confirmacao e backup preventivo.

## 5. Teste Manual Recomendado

1. sair da conta e selecionar `Continuar como visitante`;
2. alterar o tema, criar um arquivo e registrar um dado em cada aplicativo;
3. recarregar a pagina e confirmar a persistencia;
4. abrir `Configuracoes > Sincronizacao` e confirmar os estados locais;
5. sair, entrar em uma conta Firebase e confirmar que os dados nao aparecem;
6. sair da conta, voltar como visitante e confirmar que os dados reaparecem;
7. verificar o console e confirmar ausencia de erros Firebase durante o uso.

### Validacao da migracao 18.4.5

1. como visitante, abrir os aplicativos que serao migrados;
2. em `Configuracoes > Sincronizacao`, exportar os dados do visitante;
3. para incluir Finances, selecionar `Com senha` e usar uma senha com 12 ou mais
   caracteres;
4. sair, entrar em uma conta Firebase aprovada e voltar a Configuracoes;
5. selecionar o arquivo `mathicx-guest-migration-*.json`;
6. escolher os aplicativos e manter `Mesclar` no primeiro teste;
7. confirmar a migracao e o download do backup preventivo;
8. abrir os aplicativos e confirmar os dados migrados e sincronizados.

## 6. Observacao de Cache Local

Durante a validacao, o Chrome reutilizou JavaScript antigo mesmo apos recarga
forcada; uma janela anonima recebeu a versao atual. O comportamento foi tratado
como cache do perfil de desenvolvimento, nao como falha do modo visitante.

Se voltar a ocorrer, encerrar as abas do servidor, limpar os dados do site para
`127.0.0.1` em DevTools e remover Service Workers registrados para o host antes
de reabrir. O artefato Pages continua sujeito ao seu versionamento e validacao.

## 7. Rollback

Remover o botao visitante e a restauracao da sessao desativa o recurso sem
alterar dados autenticados. O namespace visitante pode ser preservado para uma
reativacao futura ou apagado explicitamente pelo usuario.
