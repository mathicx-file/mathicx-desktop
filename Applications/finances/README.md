# Finances

Aplicacao local-first de financas pessoais integrada ao Mathicx Desktop. Usa
HTML, CSS e JavaScript nativo, funciona como pagina independente e ganha escopo
por usuario, tema, sincronizacao e backup unificado quando aberta pelo host.

## Recursos

- dashboard financeiro e indicadores mensais;
- receitas, despesas, parcelas e recorrencias;
- cartoes, categorias, metas e orcamentos;
- calendario, simulador e relatorios;
- exportacao PDF, Excel e CSV por bibliotecas CDN;
- temas claro, escuro e personalizado;
- backup JSON proprio e participacao no backup unificado;
- conflito explicito entre dispositivos.

## Persistencia

O aplicativo sempre mantem um estado local no navegador. No Mathicx Desktop:

- o host informa o UID antes da leitura do storage;
- cada conta usa um namespace local separado;
- visitante usa somente o escopo local `guest-local-v1`;
- usuario Firebase aprovado sincroniza um snapshot transacional em
  `users/{uid}/apps/finances/profile/snapshot`;
- cada gravacao compara a revisao remota para evitar sobrescrita silenciosa;
- conflitos oferecem escolha entre a versao local e a versao do Firebase.

O modelo de snapshot permanece oficial enquanto o gate de arquitetura nao
identificar tamanho, volume, conflitos ou latencia que justifiquem dividir as
entidades. Consulte `npm run firebase:assess-sync` na raiz.

## Executar

O modo standalone nao precisa de build:

```bash
cd Applications/finances
python -m http.server 8080
```

Acesse `http://localhost:8080`. Para testar a integracao completa, sirva a raiz
do Mathicx Desktop e abra o Finances pelo launcher.

## Integracao com o Desktop

Arquivos principais:

```text
Applications/finances/js/app-data-adapter.js
Applications/finances/js/firebase/finances-firebase-sync.js
Applications/finances/js/firebase/finances-firestore-repository.js
src/apps/finances/manifest.js
src/apps/finances/view.js
```

O manifesto integrado declara dados financeiros e isolamento por usuario. Por
isso, backups unificados que incluem o Finances exigem protecao criptografada.
O adaptador oferece capacidades, status de sync, exportacao, validacao,
restauracao `merge`/`replace` e pausa transacional durante rollback.

## Dependencias de Runtime

Carregadas por CDN:

| Biblioteca | Uso |
| --- | --- |
| Chart.js | Graficos |
| jsPDF e autoTable | PDF |
| SheetJS | Excel |
| Google Fonts | Tipografia |

Sem rede, dados e telas continuam locais; recursos dependentes das bibliotecas
CDN podem ficar indisponiveis.

## Estrutura

```text
index.html
css/styles.css
js/storage.js
js/app-data-adapter.js
js/firebase/
js/views/
test/
```

## Seguranca e Privacidade

- nenhuma senha ou token Firebase e enviado por `postMessage`;
- a sessao Firebase e obtida no mesmo origin do host;
- dados ficam isolados por UID no navegador e no Firestore;
- App Check, whitelist e Firestore Rules protegem o acesso remoto;
- o modo visitante nunca acessa o Firebase.

## Validacao Recomendada

Na raiz do projeto:

```bash
npm run test:integration-kit
npm run test:recovery
npm run test:firebase-security
npm run pages:build
npm run pages:validate
```

Teste manualmente dois navegadores, sincronizacao, conflito, backup criptografado
e restauracao seletiva.
