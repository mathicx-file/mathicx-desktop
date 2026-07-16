# Fase 18: Evolucoes Opcionais

> Planejada em: 2026-07-15
>
> Status: concluida em 2026-07-16
>
> Subfase atual: nenhuma; gates permanecem disponiveis para reavaliacao

## 1. Objetivo

Evoluir o Mathicx Desktop depois da estabilizacao do Firebase sem transformar
ideias opcionais em dependencias obrigatorias. Cada subfase deve demonstrar
beneficio, custo, risco, rollback e criterio de aceite antes de ser iniciada.

## 2. Ordem Recomendada

### 18.1 Kit de Integracao para Novos Aplicativos

Status: **concluida e aprovada em 2026-07-16**.

Escopo proposto:

- template de manifest, view iframe e adaptador `mathicx-app-data`;
- declaracao de capacidades de sync, backup e dados sensiveis;
- helper compartilhado para escopo por UID e estado de autenticacao;
- testes contratuais reutilizaveis para novos aplicativos;
- checklist de inclusao no launcher, Configuracoes, backup e Pages;
- exemplo neutro que nao dependa do placeholder `french-study`.

Criterio de aceite: um aplicativo vazio pode ser registrado e validado sem
alterar o kernel, a Central de Sincronizacao ou o orquestrador de backup.

### 18.2 Ambiente Firebase de Desenvolvimento

Status: **cancelada por decisao de escopo em 2026-07-16**.

Escopo proposto:

- projeto Firebase separado de producao;
- configuracao local nao versionada e aliases CLI separados;
- App Check debug somente para desenvolvimento;
- rules e indices promovidos pelo mesmo pipeline;
- teste que bloqueie configuracao de desenvolvimento no artefato Pages.

Intervencao necessaria: criar o projeto Firebase de desenvolvimento e registrar
o Web App. Esta subfase pode ser adiada enquanto os emuladores forem suficientes.

Decisao: o projeto permanecera pequeno e utilizara um unico projeto Firebase.
Testes automatizados continuam nos emuladores; testes ocasionais contra o
backend real usam o token App Check debug privado ja registrado. Um segundo Web
App no mesmo projeto nao isolaria Authentication nem o Firestore e, portanto,
nao justificaria a complexidade adicional.

### 18.3 Diagnostico Operacional Multi-App

Status: **concluida e aprovada em 2026-07-16**.

Escopo proposto:

- diagnostico local de versao, auth, App Check e estado de sync;
- exportacao de relatorio sem tokens nem dados pessoais;
- historico curto de falhas por aplicativo;
- verificacao de compatibilidade antes de integrar um novo app.

Criterio de aceite: erros de integracao podem ser investigados sem depender do
console do navegador ou expor credenciais.

### 18.4 Modo Visitante Local

Status: **concluida e aprovada em 2026-07-16**.

Escopo proposto:

- entrada explicita como visitante no gate do Desktop;
- sessao e escopo locais separados de usuarios Firebase;
- Firestore, sync, whitelist e painel admin indisponiveis;
- indicacao clara de que os dados existem somente naquele navegador;
- migracao confirmada dos dados locais ao criar uma conta aprovada;
- limpeza opcional da sessao visitante.

Nao usar Firebase Anonymous Auth nesta proposta. O visitante deve permanecer
local para nao enfraquecer whitelist, rules ou isolamento por UID.

Criterio de aceite: visitante nunca le ou escreve Firestore e seus dados nao se
misturam com contas autenticadas no mesmo navegador.

### 18.5 Infraestrutura Ampliada do Dicionario

Status: **concluida e aprovada em 2026-07-16 pela alternativa A**.

Possibilidades:

- Cloud Storage para releases maiores;
- painel editorial;
- Firestore administrativo com bundles estaticos;
- Algolia ou Meilisearch para busca ampla.

O pipeline estatico atual deve permanecer enquanto custo, volume e frequencia de
atualizacao continuarem adequados.

### 18.6 Sync Seletivo e Granularizacao

Status: **18.6.1 concluida e aprovada em 2026-07-16**.

Prioridade recomendada: **baixa ate existir evidencia**.

Possibilidades:

- sincronizacao em tempo real seletiva;
- colaboracao entre usuarios;
- granularizacao do snapshot do Finances;
- politicas de conflito por entidade.

Esta subfase exige metricas de volume, latencia ou colaboracao que justifiquem a
complexidade adicional.

A `18.6.1` confirmou que o Japanese Study ja usa documentos por dominio e que o
Finances preserva um snapshot transacional com revisao e conflito explicito. Um
gate reproduzivel agora reabre a decisao por tamanho, registros, conflitos,
latencia ou demanda de colaboracao.

## 3. Regras da Fase 18

1. somente uma subfase opcional fica em andamento por vez;
2. cada subfase recebe documento proprio antes de alterar codigo;
3. recursos Firebase novos exigem estimativa de custo e intervencao registrada;
4. nenhuma subfase pode enfraquecer App Check, whitelist ou rules aprovadas;
5. novos aplicativos devem usar o caminho `users/{uid}/apps/{appId}`;
6. placeholders e projetos ainda nao integrados ficam fora do commit ate serem
   explicitamente aprovados.

## 4. Recomendacao Atual

A `18.1` foi aprovada pelo proprietario em 2026-07-16. A `18.2` foi cancelada
para manter um unico projeto Firebase. A `18.3` foi aprovada depois da validacao
visual do diagnostico e da exportacao. A `18.4` foi concluida com migracao
visitante validada em uma conta Firebase. A `18.5.1` mediu capacidade, retornou
`keep-static` e teve a alternativa A aprovada. A `18.6.1` recomenda manter os
modelos atuais de sync ate que um dos gatilhos objetivos seja atingido; essa
recomendacao foi aprovada e encerrou a Fase 18 em 2026-07-16.
