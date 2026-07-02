#!/bin/bash
# Script de Setup Automático para Nova Aplicação no mathicx-file
# Uso: bash docs/scripts/setup-novo-app.sh <app-id> <nome-display> <emoji>
# Exemplo: bash docs/scripts/setup-novo-app.sh relatorios Relatórios 📊

if [ $# -lt 2 ]; then
  echo "Uso: bash setup-novo-app.sh <NOME_APP> <NOME_DISPLAY> [EMOJI]"
  echo "Exemplo: bash setup-novo-app.sh relatorios Relatórios 📊"
  exit 1
fi

NOME_APP=$1
NOME_DISPLAY=$2
EMOJI=${3:-"⚙️"}
CATEGORIA="trabalho"
BASE="$(cd "$(dirname "$0")/../.." && pwd)"

echo "🚀 Criando setup para: $NOME_DISPLAY ($EMOJI)"
echo ""

# Criar estrutura de pastas
echo "📁 Criando estrutura..."
mkdir -p "$BASE/src/apps/$NOME_APP"
mkdir -p "$BASE/Applications/$NOME_APP/js"
mkdir -p "$BASE/Applications/$NOME_APP/css"
mkdir -p "$BASE/Applications/$NOME_APP/assets"

# manifest.js
echo "📋 Criando manifest.js..."
cat > "$BASE/src/apps/$NOME_APP/manifest.js" << EOF
export default {
  id: '$NOME_APP',
  name: '$NOME_DISPLAY',
  icon: '$EMOJI',
  category: '$CATEGORIA',
  description: '$NOME_DISPLAY integrado via iframe.',
  defaultSize: { width: 1000, height: 700 },
  resizable: true,
  minSize: { width: 600, height: 400 },
  loader: () => import('./view.js'),
};
EOF

# view.js
echo "🎨 Criando view.js..."
cp "$BASE/docs/templates/view.js" "$BASE/src/apps/$NOME_APP/view.js"
# Substituir placeholders
sed -i "s/<app-id>/$NOME_APP/g" "$BASE/src/apps/$NOME_APP/view.js"
sed -i "s/<Nome do App>/$NOME_DISPLAY/g" "$BASE/src/apps/$NOME_APP/view.js"

# index.html
echo "🌐 Criando index.html..."
cat > "$BASE/Applications/$NOME_APP/index.html" << EOF
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>$NOME_DISPLAY</title>
  <link rel="stylesheet" href="css/styles.css">
</head>
<body>
  <div id="app" class="app-container">
    <header class="app-header">
      <h1 class="app-title">$EMOJI $NOME_DISPLAY</h1>
    </header>
    <main class="app-content">
      <p>Bem-vindo ao $NOME_DISPLAY!</p>
    </main>
    <footer class="app-footer">
      <p>$NOME_DISPLAY · Feito com 💙</p>
    </footer>
  </div>
  <script src="js/app.js" defer></script>
</body>
</html>
EOF

# app.js
echo "🎯 Criando app.js..."
cat > "$BASE/Applications/$NOME_APP/js/app.js" << EOF
document.addEventListener('DOMContentLoaded', () => {
  console.log('$NOME_DISPLAY iniciado');
});
window.addEventListener('beforeunload', () => {
  console.log('$NOME_DISPLAY finalizado');
});
EOF

# styles.css
echo "💅 Criando styles.css..."
cat > "$BASE/Applications/$NOME_APP/css/styles.css" << 'EOF'
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333; background: #fff; }
.app-container { width: 100%; height: 100%; display: flex; flex-direction: column; }
.app-header { padding: 16px; background: #f5f5f5; border-bottom: 1px solid #e0e0e0; flex-shrink: 0; }
.app-title { font-size: 20px; font-weight: 600; }
.app-content { flex: 1; overflow-y: auto; padding: 16px; }
.app-footer { padding: 12px 16px; background: #f5f5f5; border-top: 1px solid #e0e0e0; flex-shrink: 0; text-align: center; font-size: 12px; color: #999; }
@media (max-width: 768px) { .app-content { padding: 8px; } }
EOF

# sync script
echo "🔄 Criando sync-$NOME_APP.sh..."
cat > "$BASE/sync-$NOME_APP.sh" << EOF
#!/bin/bash
SOURCE="\$1"
if [ ! -d "\$SOURCE" ]; then
  echo "❌ Uso: bash sync-$NOME_APP.sh /caminho/para/$NOME_APP"
  exit 1
fi
cp -r "\$SOURCE"/* "$BASE/Applications/$NOME_APP/"
echo "✅ $NOME_DISPLAY sincronizado!"
EOF
chmod +x "$BASE/sync-$NOME_APP.sh"

echo ""
echo "⚠️  Próximo passo: editar src/apps/registry.js"
echo ""
echo "   Adicione no topo (com os outros imports):"
echo "   import $NOME_APP from './$NOME_APP/manifest.js';"
echo ""
echo "   Adicione dentro de registerAll():"
echo "   [$NOME_APP, ...apps existentes].forEach((m) => this.register(m));"
echo ""
echo "✅ Setup concluído para $NOME_DISPLAY!"
echo "   Pasta: src/apps/$NOME_APP/"
echo "   Pasta: Applications/$NOME_APP/"
echo "   Sync:  bash sync-$NOME_APP.sh /caminho/origem"
