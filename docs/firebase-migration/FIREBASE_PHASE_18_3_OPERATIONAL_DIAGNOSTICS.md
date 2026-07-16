# Fase 18.3: Diagnostico Operacional Multi-App

> Iniciada em: 2026-07-16
>
> Status: concluida e aprovada em 2026-07-16

## 1. Objetivo

Permitir que problemas de autenticacao, App Check, compatibilidade e
sincronizacao sejam investigados em Configuracoes sem depender do console do
navegador e sem exportar dados pessoais.

## 2. Implementacao

### 18.3.1 Relatorio sanitizado

O formato `mathicx-operational-diagnostics` registra:

- canal local, Pages ou Web, conectividade e contexto seguro;
- modo e estado da autenticacao, sem UID, nome ou e-mail;
- projeto Firebase publico, emuladores e estado do App Check;
- versao, protocolo, conexao, sync e schema de backup de cada aplicativo;
- totais de modulos sincronizados, fechados e com falha.

O relatorio exclui API key, tokens, mensagens livres de erro/sync, conteudo de
backup, `userAgent` e qualquer campo do perfil.

### 18.3.2 Compatibilidade declarativa

O manifest integrado e o contrato de capacidades agora declaram versao
semantica. A Central rejeita um adaptador cuja versao diverge do manifest antes
de executar sync ou backup.

Versoes iniciais:

| Aplicativo | Versao |
| --- | --- |
| Mathicx Desktop | `1.0.0` |
| Japanese Study | `2.0.0` |
| Finances | `1.0.0` |

### 18.3.3 Painel, historico e exportacao

O painel fica em `Configuracoes > Sincronizacao > Diagnostico operacional`.
Ele acompanha a atualizacao da Central, nao abre apps fechados e nao faz novas
chamadas ao Firebase.

Somente transicoes para `error` e `conflict` entram no historico. O historico e
limitado a 12 entradas e usa uma chave local separada pelo escopo do usuario.
O botao `Exportar relatorio` baixa JSON sanitizado para suporte e comparacao.

## 3. Seguranca

- nenhum segredo ou dado pessoal aparece no DOM, historico ou relatorio;
- o projeto Firebase e exibido porque seu ID ja e configuracao publica Web;
- o diagnostico e somente leitura;
- nenhuma informacao e enviada para servidor adicional;
- `french-study` continua fora do registro e do diagnostico.

## 4. Testes

Comando:

```text
npm run test:diagnostics
```

Cobertura:

- sanitizacao contra UID, e-mail, API key e mensagem livre;
- classificacao local, Pages e Web;
- historico somente por transicao e com limite;
- versoes declaradas e rejeicao de capacidades incompativeis;
- descoberta dinamica, iframe e sync da Central.

## 5. Criterio de Aceite

O proprietario consegue identificar ambiente, Auth, App Check e compatibilidade
dos tres modulos e exportar um relatorio que nao contenha dados pessoais.

## 6. Validacao Tecnica

Resultado em 2026-07-16:

- diagnostico e contratos: 12 de 12 testes aprovados;
- backup e recuperacao: 17 de 17 testes aprovados;
- rollout Firebase: `technicalReady: true`, 18 de 18 controles;
- Pages: 1.586 arquivos e artefato valido;
- Chrome: painel sem erros de pagina, tres apps identificados e download JSON
  aprovado sem e-mail ou API key.

## 7. Validacao do Proprietario

Em 2026-07-16, o proprietario confirmou no servidor local:

- exibicao correta do painel de diagnostico;
- atualizacao dos estados dos tres modulos;
- exportacao e funcionamento do relatorio conforme o fluxo apresentado.

Com essa aprovacao, a Fase 18.3 foi encerrada e a Fase 18.4 foi autorizada.
