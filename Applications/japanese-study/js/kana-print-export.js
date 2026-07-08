export const JapaneseKanaPrintExport = (() => {
  const KANJIVG_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
  const LOCAL_STROKE_BASE = 'assets/strokes/kana/';
  const CATEGORY_LABELS = {
    gojuuon: 'Gojuuon',
    dakuon: 'Dakuon',
    handakuon: 'Handakuon',
    youon: 'Youon'
  };

  const svgCache = {};

  function getKanaCharacters(characters = [], options = {}) {
    const script = options.script === 'katakana' ? 'katakana' : 'hiragana';
    const categories = normalizeCategories(options.categories);
    const selectedIds = Array.isArray(options.characterIds) ? new Set(options.characterIds) : null;

    return characters.filter(char => {
      if (!char || char.script !== script) return false;
      if (categories.length && !categories.includes(char.category)) return false;
      if (selectedIds && !selectedIds.has(getCharacterId(char))) return false;
      return true;
    });
  }

  async function print(options = {}) {
    const characters = getKanaCharacters(options.characters, options);
    if (!characters.length && !options.blankOnly) {
      window.alert('Nenhum caractere encontrado para exportar.');
      return;
    }

    const printWindow = openPrintWindow();
    if (!printWindow) return;
    writeLoadingDocument(printWindow);

    const html = options.blankOnly
      ? buildBlankPracticeHtml(options)
      : options.type === 'practice'
      ? await buildPracticeHtml(characters, options)
      : buildReferenceHtml(characters, options);

    writePrintDocument(printWindow, html);
  }

  function buildReferenceHtml(characters, options = {}) {
    const scriptLabel = getScriptLabel(options.script);
    const categoryLabel = getCategorySummary(options.categories);
    const cells = characters.map(char =>
      '<div class="reference-cell">' +
        '<span class="reference-kana">' + escapeHtml(char.char) + '</span>' +
        '<span class="reference-romaji">' + escapeHtml(char.romaji) + '</span>' +
      '</div>'
    ).join('');

    return buildDocument({
      title: 'Tabela de ' + scriptLabel,
      subtitle: categoryLabel,
      body: '<section class="reference-grid">' + cells + '</section>',
      mode: 'reference'
    });
  }

  async function buildPracticeHtml(characters, options = {}) {
    const scriptLabel = getScriptLabel(options.script);
    const categoryLabel = getCategorySummary(options.categories);
    const rows = [];
    const extraRows = clampInteger(options.extraRows, 0, 6);

    for (const char of characters) {
      const steps = await buildStrokeSteps(char);
      rows.push(renderPracticeRow({
        model: '<strong>' + escapeHtml(char.char) + '</strong><span>' + escapeHtml(char.romaji) + '</span>',
        strokes: steps
      }));

      for (let i = 0; i < extraRows; i++) {
        rows.push(renderPracticeRow({ blankModel: true }));
      }
    }

    return buildDocument({
      title: 'Pratica de escrita - ' + scriptLabel,
      subtitle: categoryLabel,
      body: '<table class="practice-table"><tbody>' + rows.join('') + '</tbody></table>',
      mode: 'practice',
      orientation: options.orientation
    });
  }

  function buildBlankPracticeHtml(options = {}) {
    const scriptLabel = getScriptLabel(options.script);
    const categoryLabel = getCategorySummary(options.categories);
    const rows = Array.from({ length: getBlankRowCount(options.orientation) })
      .map(() => renderPracticeRow({ blankModel: true }))
      .join('');

    return buildDocument({
      title: 'Folha em branco - ' + scriptLabel,
      subtitle: categoryLabel,
      body: '<table class="practice-table blank-practice-table"><tbody>' + rows + '</tbody></table>',
      mode: 'practice',
      orientation: options.orientation
    });
  }

  function renderPracticeRow({ model = '', strokes = '', blankModel = false } = {}) {
    const modelCell = blankModel
      ? '<td class="practice-model practice-empty-model"></td>'
      : '<td class="practice-model">' + model + '</td>';
    const strokeCell = strokes
      ? '<td class="practice-strokes">' + strokes + '</td>'
      : '<td class="practice-strokes practice-empty-strokes"></td>';

    return '<tr>' +
      modelCell +
      strokeCell +
      Array.from({ length: 7 }).map(() => '<td class="practice-blank"></td>').join('') +
    '</tr>';
  }

  async function buildStrokeSteps(char) {
    const model = await loadStrokePaths(char.unicode);
    if (!model.paths.length) {
      return '<div class="stroke-step fallback"><strong>' + escapeHtml(char.char) + '</strong><span>modelo</span></div>';
    }

    return model.paths.map((_, index) => {
      const paths = model.paths.map((path, pathIndex) => {
        if (pathIndex > index) return '';
        const strokeClass = pathIndex === index ? 'active-stroke' : 'past-stroke';
        return '<path class="' + strokeClass + '" d="' + escapeAttribute(path.d) + '" transform="' + escapeAttribute(path.transform) + '"></path>';
      }).join('');

      return '<div class="stroke-step">' +
        '<svg viewBox="0 0 ' + model.width + ' 109" aria-hidden="true">' + paths + '</svg>' +
        '<span>' + (index + 1) + '</span>' +
      '</div>';
    }).join('');
  }

  async function loadStrokePaths(unicode) {
    const unicodeParts = String(unicode || '')
      .split('+')
      .map(part => part.trim().toLowerCase())
      .filter(Boolean);
    const itemWidth = 109;
    const width = Math.max(itemWidth, itemWidth * unicodeParts.length);
    const paths = [];

    for (let i = 0; i < unicodeParts.length; i++) {
      const result = await fetchSvg(unicodeParts[i]);
      if (!result.text) continue;

      const svgText = sanitizeKanjiVgSvg(result.text);
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
      const parserError = doc.querySelector('parsererror');
      if (parserError) continue;

      const partPaths = Array.from(doc.querySelectorAll('path'));
      partPaths.forEach(path => {
        const d = path.getAttribute('d') || '';
        if (d.length <= 10) return;
        paths.push({
          d: sanitizePathData(d),
          transform: 'translate(' + (i * itemWidth) + ' 0)'
        });
      });
    }

    return { paths, width };
  }

  async function fetchSvg(unicode) {
    if (svgCache[unicode]) {
      return { text: svgCache[unicode] };
    }

    const filename = unicode.padStart(5, '0') + '.svg';
    const urls = [LOCAL_STROKE_BASE + filename, KANJIVG_BASE + filename];

    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const text = await response.text();
        svgCache[unicode] = text;
        return { text };
      } catch {}
    }

    return { text: '' };
  }

  function buildDocument({ title, subtitle, body, mode, orientation }) {
    const printedAt = new Date().toLocaleDateString('pt-BR');
    return '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>' + escapeHtml(title) + '</title>' +
      '<style>' + getPrintCss(mode, orientation) + '</style></head><body>' +
      '<header><div><h1>' + escapeHtml(title) + '</h1><p>' + escapeHtml(subtitle) + '</p></div><span>' + printedAt + '</span></header>' +
      body +
      '<script>window.addEventListener("load",function(){setTimeout(function(){window.focus();window.print();},250);});<\/script>' +
      '</body></html>';
  }

  function getPrintCss(mode, orientation) {
    const pageOrientation = orientation === 'portrait' ? 'portrait' : 'landscape';
    const pageSize = mode === 'practice' ? 'A4 ' + pageOrientation : 'A4 portrait';
    return `
      @page { size: ${pageSize}; margin: 10mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #171717; font-family: Arial, "Noto Sans JP", "Yu Gothic", Meiryo, sans-serif; }
      header { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 8mm; border-bottom: 1px solid #d8d8d8; padding-bottom: 4mm; }
      h1 { margin: 0; font-size: 18pt; line-height: 1.1; }
      p { margin: 2mm 0 0; color: #555; font-size: 9pt; }
      header span { color: #666; font-size: 8pt; white-space: nowrap; }
      .reference-grid { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid #222; border-left: 1px solid #222; }
      .reference-cell { min-height: 24mm; border-right: 1px solid #222; border-bottom: 1px solid #222; display: flex; align-items: center; justify-content: center; gap: 3mm; page-break-inside: avoid; }
      .reference-kana { font-size: 32pt; line-height: 1; }
      .reference-romaji { font-size: 10pt; color: #555; text-transform: uppercase; }
      .practice-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .practice-table tr { page-break-inside: avoid; }
      .practice-table td { border: 1px solid #222; height: 22mm; vertical-align: middle; }
      .practice-model { width: 20mm; text-align: center; }
      .practice-model strong { display: block; font-size: 24pt; line-height: 1; }
      .practice-model span { display: block; margin-top: 1mm; color: #555; font-size: 7pt; text-transform: uppercase; }
      .practice-strokes { width: 55mm; padding: 1mm; }
      .practice-empty-model,
      .practice-empty-strokes { background-image: linear-gradient(#e2e2e2 1px, transparent 1px), linear-gradient(90deg, #e2e2e2 1px, transparent 1px); background-size: 50% 50%; }
      .practice-blank { background-image: linear-gradient(#e2e2e2 1px, transparent 1px), linear-gradient(90deg, #e2e2e2 1px, transparent 1px); background-size: 50% 50%; }
      .stroke-step { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; width: 12mm; height: 16mm; margin-right: 1mm; }
      .stroke-step svg { width: 10mm; height: 10mm; overflow: visible; }
      .stroke-step path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .stroke-step .past-stroke { stroke: #9ca3af; }
      .stroke-step .active-stroke { stroke: #e63946; }
      .stroke-step span { color: #555; font-size: 6pt; line-height: 1; }
      .stroke-step.fallback strong { font-size: 20pt; line-height: 1; }
      .stroke-step.fallback span { font-size: 6pt; }
    `;
  }

  function openPrintWindow() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      window.alert('Nao foi possivel abrir a janela de impressao. Verifique o bloqueador de pop-ups.');
      return null;
    }

    return printWindow;
  }

  function writeLoadingDocument(printWindow) {
    writePrintDocument(printWindow, '<!doctype html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Gerando PDF</title>' +
      '<style>body{font-family:Arial,sans-serif;margin:32px;color:#171717}p{color:#555}</style></head>' +
      '<body><h1>Gerando documento...</h1><p>Aguarde enquanto a folha de impressao e preparada.</p></body></html>');
  }

  function writePrintDocument(printWindow, html) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  }

  function normalizeCategories(categories) {
    return Array.isArray(categories)
      ? categories.filter(category => Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, category))
      : [];
  }

  function getCategorySummary(categories) {
    const normalized = normalizeCategories(categories);
    if (!normalized.length || normalized.length === Object.keys(CATEGORY_LABELS).length) return 'Todos os niveis de kana';
    return normalized.map(category => CATEGORY_LABELS[category]).join(', ');
  }

  function getScriptLabel(script) {
    return script === 'katakana' ? 'Katakana' : 'Hiragana';
  }

  function getBlankRowCount(orientation) {
    return orientation === 'portrait' ? 10 : 7;
  }

  function clampInteger(value, min, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
  }

  function getCharacterId(char) {
    return String(char.romaji || '') + '_' + String(char.char || '');
  }

  function sanitizePathData(value) {
    return String(value || '').replace(/[^a-zA-Z0-9,.\-\s]/g, '');
  }

  function sanitizeKanjiVgSvg(svgText) {
    return String(svgText || '')
      .replace(/<!DOCTYPE[\s\S]*?\]>\s*/i, '')
      .replace(/<!DOCTYPE[^>]*>\s*/i, '')
      .replace(/\s+kvg:[\w-]+="[^"]*"/g, '')
      .replace(/\s+xmlns:kvg="[^"]*"/g, '');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    print,
    getKanaCharacters,
    getCharacterId
  };
})();
