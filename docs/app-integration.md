# Guia de Integração de Aplicações

**mathicx-file** — Adicione novas aplicações ao portal via iframe.

---

## Índice

1. [Visão Geral](#1-visão-geral)
2. [Arquitetura](#2-arquitetura)
3. [Passo a Passo](#3-passo-a-passo)
4. [Templates](#4-templates)
5. [Registry](#5-registry)
6. [Segurança](#6-segurança)
7. [Performance](#7-performance)
8. [Sincronização](#8-sincronização)
9. [Comunicação Host ↔ Iframe](#9-comunicação-host--iframe)
10. [Testes](#10-testes)
11. [Troubleshooting](#11-troubleshooting)
12. [Removendo um App](#12-removendo-um-app)

---

## 1. Visão Geral

### Por que Iframe?

| Aspecto | Iframe | Nativo |
|---------|--------|--------|
| **Performance** | Isolamento de memória | Compartilha memória |
| **Conflito CSS/JS** | Zero | Possível |
| **Conversão de código** | Nenhuma | Completa |
| **Manutenção separada** | Sim | Não |
| **Reuso em outros projetos** | Sim | Difícil |

### Quando Usar

- App existente em HTML/CSS/JS puro
- App que você quer desenvolver independentemente
- App com dependências próprias (bibliotecas, frameworks)
- App que será reutilizada em outros projetos

### Quando NÃO Usar

- Funcionalidade que precisa de integração profunda com o mathicx-file
- Componente pequeno que faz mais sentido como nativo
- Funcionalidade que precisa de acesso direto ao DOM do host

---

## 2. Arquitetura

```
mathicx-file/
│
├── Applications/                    ← Aplicações externas (conteúdo do iframe)
│   └── <app-id>/
│       ├── index.html
│       ├── js/
│       ├── css/
│       └── assets/
│
├── src/apps/<app-id>/              ← Integração (código do host)
│   ├── manifest.js                  ← Metadados
│   └── view.js                      ← Controller do iframe
│
└── src/apps/registry.js            ← Registro central
```

### Fluxo de Carregamento

```
1. Usuário abre o launcher (Win+E)
2. Registry lista todos os manifestos
3. Usuário clica no app
4. manifest.loader() faz import() dinâmico de view.js
5. mount() é chamado com o elemento host
6. mount() cria iframe apontando para Applications/<app-id>/
7. Iframe carrega a aplicação isoladamente
8. Quando a janela fecha, cleanup remove o iframe
```

---

## 3. Passo a Passo

### 3.1. Preparar a Aplicação Original

Sua aplicação precisa ter:

```
seu-app/
├── index.html
├── js/app.js
├── css/styles.css
└── .git/              (recomendado)
```

Teste localmente:

```bash
cd ~/projetos/seu-app
python -m http.server 8888
# Abra http://localhost:8888
```

### 3.2. Criar Pastas no mathicx-file

```bash
cd /caminho/mathicx-file
mkdir -p src/apps/<app-id>
mkdir -p Applications/<app-id>
```

### 3.3. Copiar a Aplicação

```bash
cp -r ~/projetos/seu-app/* Applications/<app-id>/
```

### 3.4. Criar a Integração

Crie `src/apps/<app-id>/manifest.js` e `src/apps/<app-id>/view.js`.

→ Veja os templates completos na seção [Templates](#4-templates).

### 3.5. Registrar no Registry

Edite `src/apps/registry.js`:

**Import** (topo do arquivo):
```javascript
import meuApp from './meu-app/manifest.js';
```

**Registro** (dentro de `registerAll()`):
```javascript
registerAll() {
  [calculadora, notas, arquivos, ..., meuApp].forEach((m) => this.register(m));
}
```

### 3.6. Testar

```bash
python -m http.server 8080
# Abra http://localhost:8080 + Ctrl+Shift+R
# Win+E → seu app
```

---

## 4. Templates

Os templates completos estão em arquivos separados em `docs/templates/`:

| Arquivo | Descrição |
|---------|-----------|
| `docs/templates/manifest.js` | Metadados do app (id, nome, ícone, tamanho) |
| `docs/templates/view.js` | Controller do iframe com sandbox e performance |
| `docs/templates/index.html` | HTML mínimo para a aplicação externa |
| `docs/templates/app.js` | JavaScript base com inicialização e cleanup |
| `docs/templates/styles.css` | CSS reset + layout responsivo |

Use também o script automatizado:

```bash
bash docs/scripts/setup-novo-app.sh relatorios Relatórios 📊
```

### Referência Rápida — manifest.js

```javascript
export default {
  id: '<app-id>',
  name: '<Nome>',
  icon: '<emoji>',
  category: '<categoria>',
  description: '<descrição>',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 600, height: 400 },
  loader: () => import('./view.js'),
};
```

**Categorias disponíveis:** `pessoal`, `trabalho`, `ferramenta`, `sistema`, `midia`

**Tamanhos sugeridos:**

| Tipo | defaultSize | minSize |
|------|-------------|---------|
| App complexo | 1000×700 | 600×400 |
| App médio | 800×600 | 400×300 |
| App pequeno | 400×500 | 300×400 |

### Referência Rápida — view.js (estrutura)

```javascript
export function mount(host) {
  // 1. Cria container com spinner
  // 2. Cria iframe com sandbox + atributos de performance
  // 3. gerencia load/error com timeout
  // 4. Retorna função de cleanup
}
```

---

## 5. Registry

O arquivo `src/apps/registry.js` é o registro central. Para adicionar um app:

### Import no topo

```javascript
import meuApp from './meu-app/manifest.js';
```

### Registrar no método registerAll()

```javascript
registerAll() {
  const apps = [calculadora, notas, arquivos, formularios, configuracoes, meuApp];
  apps.forEach((m) => this.register(m));
}
```

---

## 6. Segurança

### Sandbox Attributes (obrigatórios)

```javascript
iframe.sandbox.add('allow-same-origin');   // localStorage, fetch
iframe.sandbox.add('allow-scripts');        // JavaScript
iframe.sandbox.add('allow-storage');        // localStorage/IndexedDB
```

### Sandbox Attributes (opcionais)

```javascript
iframe.sandbox.add('allow-popups');                    // window.open()
iframe.sandbox.add('allow-popups-to-escape-sandbox');  // popup fora do sandbox
iframe.sandbox.add('allow-forms');                     // submit de formulários
```

### O que NÃO incluir

```javascript
// ❌ Evite a menos que absolutamente necessário:
allow-top-navigation    // Permite redirecionar o host
allow-pointer-lock      // Bloqueio de ponteiro
allow-modals            // alert/confirm/prompt
```

---

## 7. Performance

Atributos obrigatórios no iframe:

```javascript
iframe.loading = 'lazy';      // Nativo do browser: carrega só quando visível
iframe.decoding = 'async';    // Decodificação assíncrona
iframe.importance = 'low';    // Dica de baixa prioridade
```

### Cleanup (libera memória ao fechar)

```javascript
return () => {
  iframe.src = 'about:blank';  // Zera o src antes de remover
  iframe.remove();
};
```

---

## 8. Sincronização

### Fluxo Recomendado

```
1. EDITAR no projeto original
2. TESTAR localmente (python -m http.server 8888)
3. SINCRONIZAR com mathicx-file
4. TESTAR integração (Ctrl+Shift+R)
5. VERSIONAR no git do projeto original
```

### Script de Sincronização

Crie `sync-<app-id>.sh` na raiz do **projeto original**:

```bash
#!/bin/bash
SOURCE="$(pwd)"
DEST="/caminho/mathicx-file/Applications/<app-id>"
cp -r "$SOURCE"/* "$DEST"/
echo "✅ Sincronizado!"
```

---

## 9. Comunicação Host ↔ Iframe

### Host → Iframe

```javascript
// Em view.js, após iframe carregar:
iframe.contentWindow.postMessage({ type: 'theme', value: 'dark' }, '*');
```

### Iframe → Host

```javascript
// Dentro do iframe:
window.parent.postMessage({ type: 'data-updated', payload: {...} }, '*');

// No host:
window.addEventListener('message', (e) => {
  if (e.data.type === 'data-updated') { /* fazer algo */ }
});
```

---

## 10. Testes

### Checklist de Integração

- [ ] App funciona standalone (`python -m http.server 8888`)
- [ ] `Applications/<app-id>/index.html` acessível
- [ ] `manifest.js` com todos os campos preenchidos
- [ ] `view.js` com sandbox, performance e cleanup
- [ ] Registry importado e registrado
- [ ] App abre corretamente no mathicx-file
- [ ] App fecha sem erros no console
- [ ] Error handling funciona
- [ ] Cleanup libera memória
- [ ] Testar com `Ctrl+Shift+R` (cache)

### Teste via Console (F12)

```javascript
// Verificar se app está registrada
window.app.modules?.launcher?.registry?.get('<app-id>')

// Listar todas as apps
window.app.modules?.launcher?.registry?.list()

// Abrir app manualmente
window.app.launchApp('<app-id>')
```

---

## 11. Troubleshooting

| Problema | Causa Comum | Solução |
|----------|-------------|---------|
| App não aparece no menu | Cache ou registry | `Ctrl+Shift+R`, verificar import em `registry.js` |
| Iframe branco/não carrega | Caminho errado | Verificar se `Applications/<app-id>/index.html` existe; conferir console (F12) |
| Spinner nunca some | Erro interno no app | Ver console dentro do iframe (F12) |
| Erro de sandbox | Permissão faltando | Adicionar `allow-forms`, `allow-popups` conforme necessário |
| Memory leak | Cleanup ausente | Verificar `removeEventListener` e `clearTimeout` no cleanup |

### Debug Rápido

```bash
# Verificar estrutura
ls src/apps/<app-id>/
ls Applications/<app-id>/

# Verificar registro
grep "<app-id>" src/apps/registry.js

# Testar sintaxe
node -c src/apps/registry.js
```

---

## 12. Removendo um App

```bash
# 1. Apagar a aplicação externa
rm -rf Applications/<app-id>/

# 2. Apagar a integração
rm -rf src/apps/<app-id>/

# 3. Remover do registry.js
#    - Remover import
#    - Remover do array registerAll()
```

---

*Documento consolidado a partir dos manuais de integração do mathicx-file.*
