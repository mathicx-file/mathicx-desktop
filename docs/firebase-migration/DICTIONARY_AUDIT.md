# Fase 0: Auditoria Japanese Study e Dicionario

> Escopo: baseline antes da integracao do Japanese Study e antes da arquitetura de dicionario escalavel.
>
> Data: 2026-07-04
>
> Resultado esperado da fase: nenhum codigo de producao alterado.

## 1. Resumo executivo

O `japanese-study` ainda nao esta integrado neste repositorio. Portanto, esta auditoria nao encontrou arquivos reais do app japones, dicionario, SRS, favoritos ou provider de busca dentro de `Applications/japanese-study` ou `src/apps/japanese-study`.

O que existe hoje e a infraestrutura generica para integrar apps externos por iframe, ja exercitada pelo app `finances`. Isso confirma que o melhor caminho continua sendo: preparar Firebase primeiro no host, depois integrar o Japanese Study como app externo/hibrido usando o mesmo padrao de iframe.

## 2. Estado atual comprovado

### Ausencia do Japanese Study

No repositorio atual:

- `Applications/` contem apenas `finances`;
- `src/apps/` contem `admin`, `arquivos`, `calculadora`, `configuracoes`, `finanças`, `formularios` e `notas`;
- nao ha `Applications/japanese-study`;
- nao ha `src/apps/japanese-study`;
- nao ha `Applications/japanese-study/data/dictionary.json`;
- nao ha `DictionaryProvider`, `KanjiProvider`, SRS ou repositories do app japones.

Evidencias:

- listagem de `Applications` mostra apenas `finances`;
- listagem de `src/apps` nao inclui `japanese-study`;
- `README.md:382` lista "Integrar `japanese-study` como app externo via iframe" como roadmap, nao como recurso existente.

### Infraestrutura de apps externos existente

O projeto ja suporta apps externos por iframe:

- app real fica em `Applications/<app-id>/`;
- wrapper do host fica em `src/apps/<app-id>/`;
- registro acontece em `src/apps/registry.js`;
- janela carrega a view sob demanda via `manifest.loader()`;
- wrapper cria iframe e retorna cleanup.

Evidencias:

- `README.md:224` recomenda app externo para projetos independentes.
- `README.md:229` documenta a estrutura `Applications/japanese-study/`.
- `README.md:235` documenta a estrutura `src/apps/japanese-study/`.
- `README.md:243` indica `Applications/japanese-study/index.html`.
- `src/apps/registry.js:48` registra os apps atuais em `registerAll()`.
- `src/apps/finanças/view.js:83` resolve `./Applications/finances/index.html`.
- `src/apps/finanças/view.js:112` a `src/apps/finanças/view.js:116` configura sandbox do iframe.

## 3. Baseline do app externo existente

O app `finances` e a referencia pratica atual:

```text
src/apps/finanças/
  manifest.js
  view.js

Applications/finances/
  index.html
  css/
  js/
  test/
```

Caracteristicas observadas:

- o manifest define id, nome, icone, categoria, tamanhos e loader;
- o wrapper monta spinner;
- o iframe usa `allow-same-origin`, `allow-scripts`, `allow-storage`, `allow-popups` e `allow-popups-to-escape-sandbox`;
- cleanup troca `src` para `about:blank` e remove o iframe;
- o app real persiste dados no `localStorage` proprio.

Implicacao para Japanese Study:

- o primeiro wrapper do Japanese Study pode seguir esse padrao;
- a diferenca futura sera a inicializacao Firebase dentro do iframe e um contrato mais cuidadoso de `postMessage`;
- nao se deve enviar senha, ID token ou credenciais pelo bridge.

## 4. Hipoteses do plano que ainda nao podem ser verificadas

Os documentos de planejamento mencionam:

- `Applications/japanese-study`;
- `DictionaryProvider`;
- `KanjiProvider`;
- `HostBridge`;
- `data/dictionary.json`;
- favoritos, historico, progresso, SRS e backup locais;
- Kanji N5 e KanjiVG;
- pipeline JMdict/KANJIDIC2.

Esses itens ainda sao hipoteses externas ao repositorio atual. Devem ser auditados no repositorio/projeto real do Japanese Study antes de qualquer migracao de dicionario ou progresso.

## 5. Ordem recomendada

Manter a ordem decidida:

1. Fase 1 do Mathicx-File: infraestrutura Firebase desligada por flags.
2. Fase 2/3: provider Firebase em paralelo e depois troca controlada da identidade.
3. Integracao inicial do Japanese Study como iframe, quando a base Auth/config ja existir.
4. Auditoria especifica do codigo real do Japanese Study.
5. Repositories hibridos para progresso/favoritos/SRS.
6. Abstracao do dicionario.
7. Pipeline de chunks/cache/manifesto.

## 6. Checklist para quando o Japanese Study for trazido

Antes de implementar Firebase no app japones, auditar:

- estrutura real de pastas;
- entrada principal (`index.html` e scripts);
- fontes de dados (`dictionary.json`, kanji, exemplos, assets);
- todos os usos de `localStorage`, IndexedDB ou outra persistencia;
- modelo de favoritos;
- modelo de historico;
- modelo de progresso;
- modelo de SRS;
- backup/import/export;
- fluxo de busca;
- tamanho dos arquivos de dados;
- dependencia de origem/caminho relativo;
- eventos globais;
- uso atual de `postMessage`, se existir;
- testes existentes.

## 7. Riscos especificos

1. **Integrar antes de estabilizar Auth**
   - Risco: duplicar trabalho quando o provider Firebase do host mudar.
   - Recomendacao: integrar depois da base Firebase do desktop.

2. **Assumir compartilhamento automatico de instancia Firebase**
   - Risco: iframe tem outro contexto JavaScript.
   - Recomendacao: o iframe inicializa seu proprio `FirebaseApp` com a mesma configuracao publica.

3. **Usar Firestore como busca lexical**
   - Risco: custo, latencia e leituras por tecla.
   - Recomendacao: dicionario publico estatico, busca local e cache IndexedDB.

4. **Misturar cache publico com dados pessoais**
   - Risco: limpeza de cache apagar progresso ou favoritos.
   - Recomendacao: separar stores/camadas desde o inicio.

5. **Caminhos quebrados em GitHub Pages**
   - Risco: iframe e chunks usando caminhos absolutos incorretos.
   - Recomendacao: resolver URLs relativas ao documento atual, como o wrapper de `finances` faz hoje.

## 8. Criterio de aceite da Fase 0

- Este documento existe.
- A ausencia do Japanese Study no repositorio atual esta registrada.
- O padrao de integracao por iframe existente foi mapeado.
- As hipoteses nao verificaveis foram separadas dos fatos comprovados.
- Nenhum arquivo de producao foi alterado nesta fase.
