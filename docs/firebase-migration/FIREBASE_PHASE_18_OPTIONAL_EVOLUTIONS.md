# Fase 18: Evolucoes Opcionais

> Planejada em: 2026-07-15
>
> Status: planejamento; nenhuma subfase iniciada

## 1. Objetivo

Evoluir o Mathicx Desktop depois da estabilizacao do Firebase sem transformar
ideias opcionais em dependencias obrigatorias. Cada subfase deve demonstrar
beneficio, custo, risco, rollback e criterio de aceite antes de ser iniciada.

## 2. Ordem Recomendada

### 18.1 Kit de Integracao para Novos Aplicativos

Prioridade recomendada: **alta**.

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

Prioridade recomendada: **media**.

Escopo proposto:

- projeto Firebase separado de producao;
- configuracao local nao versionada e aliases CLI separados;
- App Check debug somente para desenvolvimento;
- rules e indices promovidos pelo mesmo pipeline;
- teste que bloqueie configuracao de desenvolvimento no artefato Pages.

Intervencao necessaria: criar o projeto Firebase de desenvolvimento e registrar
o Web App. Esta subfase pode ser adiada enquanto os emuladores forem suficientes.

### 18.3 Diagnostico Operacional Multi-App

Prioridade recomendada: **media**.

Escopo proposto:

- diagnostico local de versao, auth, App Check e estado de sync;
- exportacao de relatorio sem tokens nem dados pessoais;
- historico curto de falhas por aplicativo;
- verificacao de compatibilidade antes de integrar um novo app.

Criterio de aceite: erros de integracao podem ser investigados sem depender do
console do navegador ou expor credenciais.

### 18.4 Modo Visitante Local

Prioridade recomendada: **opcional, posterior**.

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

Prioridade recomendada: **baixa ate existir demanda**.

Possibilidades:

- Cloud Storage para releases maiores;
- painel editorial;
- Firestore administrativo com bundles estaticos;
- Algolia ou Meilisearch para busca ampla.

O pipeline estatico atual deve permanecer enquanto custo, volume e frequencia de
atualizacao continuarem adequados.

### 18.6 Sync Seletivo e Granularizacao

Prioridade recomendada: **baixa ate existir evidencia**.

Possibilidades:

- sincronizacao em tempo real seletiva;
- colaboracao entre usuarios;
- granularizacao do snapshot do Finances;
- politicas de conflito por entidade.

Esta subfase exige metricas de volume, latencia ou colaboracao que justifiquem a
complexidade adicional.

## 3. Regras da Fase 18

1. somente uma subfase opcional fica em andamento por vez;
2. cada subfase recebe documento proprio antes de alterar codigo;
3. recursos Firebase novos exigem estimativa de custo e intervencao registrada;
4. nenhuma subfase pode enfraquecer App Check, whitelist ou rules aprovadas;
5. novos aplicativos devem usar o caminho `users/{uid}/apps/{appId}`;
6. placeholders e projetos ainda nao integrados ficam fora do commit ate serem
   explicitamente aprovados.

## 4. Recomendacao Atual

Iniciar pela `18.1`. Ela reduz o custo das futuras integracoes sem exigir outro
projeto Firebase e cria uma base verificavel para Japanese Study, Finances e os
proximos aplicativos. A `18.4` permanece registrada como opcional para depois
das prioridades atuais.
