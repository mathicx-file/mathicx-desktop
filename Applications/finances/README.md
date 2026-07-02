# 💰 Finanças Pessoais

Aplicação web completa de **gerenciamento financeiro pessoal**, construída com **HTML5, CSS3 e JavaScript puro** (sem frameworks). 100% local — seus dados nunca saem do navegador.

![Stack](https://img.shields.io/badge/HTML5-orange) ![Stack](https://img.shields.io/badge/CSS3-blue) ![Stack](https://img.shields.io/badge/JavaScript-vanilla-yellow) ![Status](https://img.shields.io/badge/status-pronto-success)

## ✨ Funcionalidades

| Módulo | Descrição |
|---|---|
| 🏠 **Dashboard** | Saldo, receitas/despesas do mês, economia, indicadores de saúde financeira, gráficos interativos (evolução, distribuição, receitas x despesas) |
| 💸 **Movimentações** | Receitas e despesas com descrição, valor, categoria, vencimento, pagamento, observações, status e forma de pagamento. Filtros avançados + busca |
| 🧾 **Parcelamentos** | Cadastro gera as parcelas automaticamente (1/12, 2/12...), marca parcelas pagas individualmente, cancela futuras, acompanha progresso |
| 🔁 **Recorrentes** | Contas fixas (mensal, quinzenal, semanal, anual) com geração automática de lançamentos futuros |
| 💳 **Cartões** | Limite, dias de fechamento/vencimento, fatura atual e % de uso |
| 🏷️ **Categorias** | Personalizadas com cor e ícone, separadas por tipo (receita/despesa) |
| 🧮 **Simulador** | Calcula parcela (tabela Price com juros), impacto no orçamento, alertas de comprometimento da renda e **botão para efetivar o lançamento** |
| 🎯 **Metas** | Objetivos com barra de progresso e valor acumulado |
| 📊 **Relatórios** | 7 relatórios filtráveis (fluxo de caixa, por categoria, parcelamentos, atrasadas, evolução, ranking) com exportação **PDF, Excel e CSV** |
| 📅 **Calendário** | Visão mensal de vencimentos por dia, com indicadores de status |
| ⚙️ **Configurações** | Temas (claro/escuro/auto/personalizado com gradiente), orçamento por categoria, backup/restore, dados |

### 🔔 Extras incluídos
- Alertas de contas atrasadas e vencimentos próximos (topo da página)
- Indicador de saúde financeira (anel de progresso 0–100)
- Previsão de saldo futuro (simulador)
- Ranking das categorias de maior gasto
- Sistema de orçamento mensal por categoria
- Busca global no topo
- Notificações (toasts) e feedback visual
- Layout 100% responsivo (desktop + mobile, com FAB e sidebar deslizante)

## 🚀 Como executar

Não há build nem dependências para instalar. Basta abrir o `index.html`:

**Opção 1 — Abrir direto**
```bash
# Dê duplo clique em finances/index.html, ou:
start finances/index.html        # Windows
open finances/index.html         # macOS
xdg-open finances/index.html     # Linux
```

**Opção 2 — Servidor local (recomendado, evita restrições de `file://`)**
```bash
cd finances
python -m http.server 8080
# abra http://localhost:8080
```

> 💡 Na primeira execução a aplicação já vem com **dados de exemplo** (salário, contas, um parcelamento, uma meta, um cartão) para você explorar. Para começar do zero, vá em **Configurações → Apagar todos os dados**.

## 🌐 Dependências (via CDN)

Carregadas automaticamente — não precisam de instalação:

| Biblioteca | Uso |
|---|---|
| [Chart.js 4](https://chartjs.org) | Gráficos interativos |
| [jsPDF](https://github.com/parallax/jsPDF) + autoTable | Exportação PDF |
| [SheetJS (xlsx)](https://sheetjs.com) | Exportação Excel |
| [Google Fonts (Inter)](https://fonts.google.com) | Tipografia |

> Caso fique **offline**, os gráficos e exportações ficam indisponíveis, mas todo o restante da aplicação continua funcionando (os dados são salvos localmente).

## 🗂️ Estrutura do projeto

```
finances/
├── index.html              # Estrutura base + templates
├── css/
│   └── styles.css          # Design system, temas, layout, componentes
├── js/
│   ├── storage.js          # Camada de dados (LocalStorage, backup, seed)
│   ├── utils.js            # Formatação, datas, agregações financeiras
│   ├── ui.js               # Componentes (toast, modal, charts, tabelas)
│   ├── app.js              # Router, navegação, tema, alertas
│   └── views/
│       ├── dashboard.js
│       ├── transactions.js
│       ├── installments.js
│       ├── recurring.js
│       ├── categories.js
│       ├── cards.js
│       ├── simulator.js
│       ├── goals.js
│       ├── reports.js
│       ├── calendar.js
│       └── settings.js
└── test/
    ├── smoke.js            # Teste: carrega + renderiza todas as views
    └── functional.js       # Teste: lógica financeira, cálculos, backup
```

### Arquitetura

- **Sem framework**: cada view é um módulo (`App.Dashboard.render()`, `App.Transactions.render()`, …) exposto no objeto global `App`.
- **Store central** (`js/storage.js`): único ponto de acesso ao estado, com `subscribe()` para que as views se re-renderizem ao mudar os dados. Persistência via `localStorage` com debounce.
- **Utils** (`js/utils.js`): funções puras de domínio financeiro (agregação por mês, status efetivo, tabela Price, formatação BRL).
- **UI** (`js/ui.js`): biblioteca de componentes reutilizáveis (modal, toast, tabelas, gráficos Chart.js com cores do tema).

## 🧪 Testes

```bash
cd finances
node test/smoke.js          # carrega todos os scripts + renderiza as 11 views
node test/functional.js     # valida categorias, cálculos, status, backup/restore
```

## 💾 Backup e privacidade

- Todos os dados ficam no `localStorage` do navegador.
- **Configurações → Exportar backup** gera um JSON completo.
- **Importar backup** permite restaurar (substituindo ou mesclando).
- Os dados **não são enviados a nenhum servidor**.

## 🎨 Temas

Quatro opções em **Configurações → Aparência**:

1. **Claro** — fundo claro
2. **Escuro** — fundo escuro
3. **Automático** — segue a preferência do sistema operacional
4. **Personalizado** — escolha a cor primária, de destaque, o fundo e um gradiente pré-definido

Há também um botão rápido 🎨 na barra lateral para alternar claro/escuro.

## 📋 Roadmap / ideias futuras

- Sincronização opcional com nuvem
- Modo multiusuário / família
- Importação de extratos bancários (OFX/CSV)
- Notificações no navegador e por e-mail
- App instalável (PWA) com service worker offline

---

Feito com 💙 · Dados 100% locais · Sem rastreamento
