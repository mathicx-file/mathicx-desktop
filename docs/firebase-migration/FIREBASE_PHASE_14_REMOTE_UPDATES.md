# Fase 14: Manifesto Remoto, Atualizacao e Rollback

> Status: concluida
>
> Iniciada em: 2026-07-13

## 1. Objetivo

Atualizar dados linguisticos sem republicar o codigo do aplicativo e sem
substituir um cache funcional antes que a nova distribuicao esteja completa e
validada.

## 2. Principios

- detectar, baixar e ativar sao operacoes independentes;
- consultar uma release nunca altera a versao ativa;
- todo artefato e validado por tamanho e SHA-256;
- uma instalacao incompleta permanece candidata e pode ser retomada;
- a versao anterior pronta permanece disponivel para rollback;
- dados pessoais, progresso e sincronizacao Firebase nao participam do cache
  linguistico;
- Firestore pode fornecer metadados pequenos no futuro, mas nao armazena o
  catalogo do dicionario.

## 3. Subfases

### 14.1 - Contrato remoto e compatibilidade

Status: **Concluida**.

O ponteiro `releases/current.json` declara:

- formato e versao do contrato;
- canal de publicacao;
- versao minima do Japanese Study;
- identidade e versao do dicionario;
- descritor verificavel do manifesto;
- contagem e tamanho da distribuicao.

### 14.2 - Deteccao sem promocao automatica

Status: **Concluida**.

O cliente consulta o ponteiro com cache HTTP desabilitado, valida o manifesto e
classifica a release como atual, mais nova, mais antiga ou incompativel. Nenhum
chunk e instalado e nenhuma chave ativa e alterada nessa operacao.

O resultado e exibido em `Configuracoes e backup > Atualizacoes do dicionario`
e emitido pelo evento `japanese-study:dictionary-release-status`.

### 14.3 - Download candidato retomavel

Status: **Concluida**.

O instalador baixa apenas artefatos ausentes ou invalidos para um namespace
candidato. Interrupcoes preservam os arquivos validos ja recebidos.

O estado `interrupted` registra a falha sem apagar os chunks aprovados. Uma nova
tentativa verifica o cache e baixa somente arquivos ausentes ou invalidos.

### 14.4 - Ativacao transacional

Status: **Concluida**.

A promocao ocorre somente depois da validacao integral. O runtime passa a abrir
a versao ativa registrada, mantendo a release embutida como recuperacao.

Download e ativacao possuem botoes separados. Depois da ativacao explicita, o
aplicativo recarrega e o runtime abre o manifesto da versao ativa no IndexedDB.

### 14.5 - Rollback e limpeza

Status: **Concluida**.

O usuario pode retornar a versao anterior pronta. Versoes excedentes sao
removidas gradualmente sem tocar progresso, SRS, favoritos ou historico.

A limpeza protege sempre o par `activeVersion`/`previousVersion`. O rollback
troca esse par de forma transacional e passa a valer no recarregamento seguinte.

## 4. Intervencao do Proprietario

Nenhuma acao no Console Firebase e necessaria no inicio. A primeira promocao de
uma release diferente da `2026.07.13-2` exigira aprovacao explicita depois que o
download candidato e seu resumo forem apresentados.

## 5. Validacao

- 75 testes do Japanese Study aprovados;
- 44 testes do pipeline aprovados;
- 5 testes de equivalencia e 5 do launcher aprovados;
- retomada apos interrupcao reutiliza artefatos validos;
- adulteracao, quota e manifesto incompativel preservam a versao ativa;
- versao promovida abre pelo cache mesmo offline;
- rollback preserva ativa e anterior;
- artefato Pages com 428 arquivos validado;
- smoke HTTP classificou `2026.07.13-2` como `current` e verificou o manifesto.

## 6. Validacao do Proprietario

Concluida em 2026-07-13: o painel `Atualizacoes do dicionario` foi confirmado
no servidor local dentro de `Configuracoes e backup`.

A primeira promocao completa sera exercitada quando uma release com conteudo
novo for publicada na Fase 15. Nao foi criada uma versao artificial apenas para
o teste; os caminhos de promocao, interrupcao e rollback permanecem cobertos
pela suite automatizada.
