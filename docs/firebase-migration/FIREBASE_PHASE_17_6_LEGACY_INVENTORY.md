# Fase 17.6.1: Inventario de Compatibilidade e Legado

> Executado em: 2026-07-15
>
> Status: concluido; nenhuma compatibilidade removida

## 1. Objetivo

Identificar caminhos criados durante a migracao Firebase e separar codigo
realmente obsoleto de mecanismos que ainda protegem dados, rollback, modo
offline ou compatibilidade de formatos.

## 2. Criterios

- **Removivel**: nao possui consumidor de runtime nem funcao operacional atual;
- **Candidato**: pode ser removido, mas exige migracao, teste ou decisao previa;
- **Manter**: continua fazendo parte da arquitetura ou do rollback suportado;
- **Adiar**: depende de uma evolucao futura fora do escopo da Fase 17.

As classificacoes foram decididas na `17.6.2`. A alteracao de codigo pertence a
`17.6.3`.

## 3. Inventario

| ID | Item | Evidencia principal | Uso atual | Classificacao preliminar | Condicao |
| --- | --- | --- | --- | --- | --- |
| L01 | Flags `firebaseAuthEnabled`, `dictionaryRemoteManifestEnabled`, `localMigrationEnabled` e `localFallbackEnabled` | `src/firebase/feature-flags.js` | Nenhum consumidor de runtime encontrado | Remover na 17.6.3 | Documentos historicos nao sao configuracao de runtime |
| L02 | Provider de autenticacao local e PBKDF2 local | `src/auth/provider.js`, `src/auth/crypto.js` | Dormente em producao; acessivel por `authMode: local` | Preservar por uma release | Reavaliar depois da primeira release estavel com App Check aplicado |
| L03 | Stores IndexedDB `users`, `sessions` e `stats` | `src/storage/indexeddb.js` | Usados apenas pelo provider local | Preservar sem limpar | Nunca apagar dados existentes automaticamente |
| L04 | Branches `isFirebaseMode` e facade dual | `src/auth/provider.js`, login, admin e widgets | Ativas para sustentar L02 | Preservar por uma release | Remover somente junto de L02 e atualizar testes de seguranca |
| L05 | Alias de aplicativo `financas` para `finances` | `src/apps/registry.js`, manifest e sync do Desktop | Read-repair de favoritos, fixados, atalhos e uso antigos | Manter temporariamente | Remover apenas depois de uma migracao versionada confirmar IDs canonicos |
| L06 | JSON e source legados do dicionario | `legacy-dictionary-source.js`, `dictionary-runtime.js`, launcher | Fallback de falha, equivalencia e resolucao de IDs antigos | Manter | Substituicao exige pacote essencial autossuficiente e migracao de favoritos/deep links |
| L07 | Flag `dictionaryProviderV2Enabled` | Japanese Study e launcher | Rollback ativo para L06 | Manter | Reavaliar junto da futura retirada do source legado |
| L08 | Flags de leitura/escrita por aplicativo | sync do Desktop, Japanese Study e Finances | Rollback granular e hidratacao controlada | Manter | Podem ser consolidadas somente apos uma politica nova de rollout |
| L09 | `firebaseEmulatorsEnabled` e bypass App Check | cliente Firebase e testes | Desenvolvimento local e suites automatizadas | Manter | Controle permanente de desenvolvimento, sempre falso em producao |
| L10 | Escopo local `local` e armazenamento por UID | storages do Japanese Study e Finances | Execucao standalone, cache, offline e isolamento local | Manter | Nao e legado; faz parte da arquitetura local-first |
| L11 | LocalStorage/IndexedDB do Desktop | state, Explorer, backup e sync | Cache, arquivos locais, recuperacao e estado da sessao | Manter | Nao confundir persistencia local com autenticacao local |
| L12 | Campo de perfil `role` no Firestore | provider Firebase e painel admin | Projecao de exibicao; nunca concede autoridade | Manter | Custom claim continua como unica autoridade |
| L13 | Documentos `users/{uid}/migrations/*` | repositorios Japanese Study e Finances | Auditoria idempotente das migracoes | Manter | Nao e fallback de runtime |
| L14 | Sandbox same-origin dos apps integrados | helper de iframe e manifests | Necessario para Auth e armazenamento no desenho atual | Adiar | Exige origens separadas ou bridge de storage/auth |
| L15 | Comentarios de fases antigas em arquivos ativos | feature flags e provider Firebase | Apenas texto desatualizado | Remover na 17.6.3 | Atualizacao editorial sem mudar comportamento |

## 4. Dados Que Nao Devem Ser Apagados

A remocao de codigo nao autoriza excluir automaticamente:

- bancos IndexedDB existentes do Mathicx Desktop ou Japanese Study;
- chaves LocalStorage com escopo por UID;
- snapshots e documentos de migracao do Firestore;
- aliases presentes em backups antigos;
- pacotes offline e caches do dicionario instalados pelo usuario.

Qualquer limpeza de dados deve ser opcional, explicita e posterior a um backup
validado. A `17.6` trata primeiro da superficie de codigo e configuracao.

## 5. Resultado da 17.6.1

Foram encontrados:

- 2 grupos removiveis sem impacto comportamental imediato: L01 e L15;
- 4 candidatos que exigem decisao ou migracao: L02, L03, L04 e L12;
- 8 mecanismos que devem ser mantidos: L05, L06, L07, L08, L09, L10, L11 e L13;
- 1 risco arquitetural adiado: L14.

Observacao: L02, L03 e L04 formam uma unica decisao tecnica sobre a retirada da
autenticacao local. Eles nao devem ser executados separadamente.

## 6. Decisoes da 17.6.2

A estrategia aprovada para a implementacao e:

1. remover L01 e L15 imediatamente;
2. preservar L02-L04 por uma release estavel, sem reativar o modo local em
   producao e sem limpar dados IndexedDB;
3. manter o alias `financas` enquanto backups e documentos antigos puderem
   conter esse ID;
4. manter o campo `role` apenas como projecao de UI;
5. manter L06-L11 e L13; adiar L14.

Essa decisao reduz codigo morto sem combinar a primeira release com App Check
aplicado a uma segunda mudanca de alto impacto na autenticacao.
