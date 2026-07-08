export const JapaneseStrokePlayer = (() => {
  const KANJIVG_BASE = 'https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/';
  const LOCAL_STROKE_BASES = ['assets/strokes/kana/', 'assets/strokes/kanji/'];
  const ANIMATION_SPEED = 800;
  const MODEL_SAMPLES = 24;

  let container = null;
  let svgElement = null;
  let strokes = [];
  let currentStroke = 0;
  let isPlaying = false;
  let isPaused = false;
  let animationId = null;
  let nextStrokeTimeout = null;
  let activeStrokeElapsed = 0;
  let onStateChange = null;
  let cachedSvgs = {};
  let currentStrokeModel = createFallbackModel('');

  function init(containerEl, stateCallback) {
    container = containerEl;
    onStateChange = stateCallback;
    renderControls();
  }

  function renderControls() {
    if (!container) return;
    container.innerHTML = `
      <div class="stroke-svg-container"></div>
      <div class="stroke-controls">
        <button class="stroke-btn" data-action="play">Reproduzir</button>
        <button class="stroke-btn" data-action="pause" disabled>Pausar</button>
        <button class="stroke-btn" data-action="reset" disabled>Reiniciar</button>
      </div>
      <div class="stroke-info" style="font-size:0.8rem;color:var(--text-muted)"></div>
    `;
    container.querySelectorAll('.stroke-btn').forEach(btn => {
      btn.addEventListener('click', () => handleControl(btn.dataset.action));
    });
  }

  function handleControl(action) {
    switch (action) {
      case 'play': play(); break;
      case 'pause': pause(); break;
      case 'reset': reset(); break;
    }
  }

  async function loadCharacter(unicode) {
    const svgContainer = container.querySelector('.stroke-svg-container');
    svgContainer.innerHTML = '<div class="spinner"></div>';

    strokes = [];
    currentStroke = 0;
    isPlaying = false;
    isPaused = false;
    activeStrokeElapsed = 0;
    currentStrokeModel = createFallbackModel(unicode);
    clearAnimationTimers();
    updateButtonStates();

    try {
      const unicodeParts = getUnicodeParts(unicode);
      const svgDataList = await Promise.all(unicodeParts.map(fetchKanjiVG));
      const availableSvgs = svgDataList.filter(Boolean);

      if (availableSvgs.length > 0) {
        currentStrokeModel = renderSvgFromKanjiVG(svgDataList, svgContainer, unicodeParts);
      } else {
        currentStrokeModel = renderFallbackSvg(unicode, svgContainer);
      }
    } catch {
      currentStrokeModel = renderFallbackSvg(unicode, svgContainer);
    }

    container.querySelector('.stroke-info').textContent =
      strokes.length > 0 ? `Tra\u00e7os: ${strokes.length}` : 'Tra\u00e7os: N/A';

    return currentStrokeModel;
  }

  function getUnicodeParts(unicode) {
    return String(unicode || '')
      .split('+')
      .map(part => part.trim())
      .filter(Boolean);
  }

  async function fetchKanjiVG(unicode) {
    const cleanUnicode = String(unicode || '').toLowerCase();
    if (cachedSvgs[cleanUnicode]) return cachedSvgs[cleanUnicode];

    const filename = `${cleanUnicode.padStart(5, '0')}.svg`;
    const urls = [
      ...LOCAL_STROKE_BASES.map(base => `${base}${filename}`),
      `${KANJIVG_BASE}${filename}`
    ];

    for (const url of urls) {
      const text = await fetchSvgText(url);
      if (text) {
        cachedSvgs[cleanUnicode] = text;
        return text;
      }
    }

    return null;
  }

  async function fetchSvgText(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.text();
    } catch {
      return null;
    }
  }

  function renderSvgFromKanjiVG(svgDataList, targetContainer, unicodeParts) {
    const parser = new DOMParser();
    const svgItems = svgDataList.map((svgData, index) => {
      if (!svgData) return null;
      const doc = parser.parseFromString(svgData, 'image/svg+xml');
      const importedSvg = doc.querySelector('svg');
      if (!importedSvg) return null;
      return { importedSvg, unicode: unicodeParts[index] };
    }).filter(Boolean);

    if (svgItems.length === 0) {
      return renderFallbackSvg(unicodeParts.join('+'), targetContainer);
    }

    const itemWidth = 109;
    const viewBoxWidth = itemWidth * svgItems.length;
    const viewBox = { minX: 0, minY: 0, width: viewBoxWidth, height: 109 };
    svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('viewBox', `0 0 ${viewBoxWidth} 109`);
    svgElement.setAttribute('width', '180');
    svgElement.setAttribute('height', '180');

    const strokePaths = [];

    svgItems.forEach((item, itemIndex) => {
      const offsetX = itemWidth * itemIndex;
      const paths = item.importedSvg.querySelectorAll('path');

      paths.forEach(path => {
        const d = path.getAttribute('d');
        if (d && d.length > 10) {
          strokePaths.push({ d, offsetX });
        }
      });
    });

    if (strokePaths.length === 0) {
      return renderFallbackSvg(unicodeParts.join('+'), targetContainer);
    }

    strokes = strokePaths.map(path => path.d);

    strokePaths.forEach((stroke, i) => {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', stroke.d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#e63946');
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke-linejoin', 'round');
      path.setAttribute('transform', `translate(${stroke.offsetX} 0)`);
      path.dataset.strokeIndex = i;
      path.dataset.offsetX = stroke.offsetX;
      const length = getSvgPathLength(path, stroke.d);
      path.dataset.length = length;
      path.style.opacity = '0.15';
      svgElement.appendChild(path);
    });

    targetContainer.innerHTML = '';
    targetContainer.appendChild(svgElement);
    updateButtonStates();

    return buildStrokeModel(svgElement.querySelectorAll('path'), viewBox);
  }

  function renderFallbackSvg(unicode, targetContainer) {
    targetContainer.innerHTML = '';
    svgElement = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgElement.setAttribute('viewBox', '0 0 109 109');
    svgElement.setAttribute('width', '180');
    svgElement.setAttribute('height', '180');

    const char = getCharFromUnicode(unicode);
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', '54.5');
    text.setAttribute('y', '72');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '60');
    text.setAttribute('fill', 'var(--text-primary, #1a1a2e)');
    text.textContent = char;
    svgElement.appendChild(text);

    targetContainer.appendChild(svgElement);
    strokes = [];
    updateButtonStates();
    return createFallbackModel(unicode);
  }

  function buildStrokeModel(pathNodes, viewBox) {
    const modelStrokes = Array.from(pathNodes).map(path => {
      const offsetX = Number(path.dataset.offsetX || 0);
      const points = sampleSvgPath(path, offsetX, viewBox);
      return buildStrokeStats(points);
    }).filter(stroke => stroke.points.length > 1);

    return {
      source: 'kanjivg',
      viewBox,
      strokeCount: modelStrokes.length,
      strokes: modelStrokes
    };
  }

  function sampleSvgPath(path, offsetX, viewBox) {
    const length = getSvgPathLength(path, path.getAttribute('d'));
    if (!length || typeof path.getPointAtLength !== 'function') return [];

    const points = [];
    for (let i = 0; i < MODEL_SAMPLES; i++) {
      const pos = path.getPointAtLength((length * i) / (MODEL_SAMPLES - 1));
      points.push({
        x: clamp((pos.x + offsetX - viewBox.minX) / viewBox.width, 0, 1),
        y: clamp((pos.y - viewBox.minY) / viewBox.height, 0, 1)
      });
    }
    return points;
  }

  function buildStrokeStats(points) {
    const first = points[0] || { x: 0, y: 0 };
    const last = points[points.length - 1] || first;
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const directLength = Math.sqrt(dx * dx + dy * dy) || 1;

    return {
      points,
      direction: { x: dx / directLength, y: dy / directLength },
      length: getPointPathLength(points),
      box: getPointBox(points)
    };
  }

  function getPointPathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += getDistance(points[i - 1], points[i]);
    }
    return total;
  }

  function getPointBox(points) {
    if (!points.length) return null;
    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    const maxX = Math.max(...xs);
    const maxY = Math.max(...ys);
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  function getDistance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getSvgPathLength(path, d) {
    try {
      if (typeof path.getTotalLength === 'function') return path.getTotalLength();
    } catch {}
    return estimatePathLength(d || '');
  }

  function createFallbackModel(unicode) {
    return {
      source: 'fallback',
      viewBox: { minX: 0, minY: 0, width: 109, height: 109 },
      strokeCount: 0,
      strokes: [],
      char: getCharFromUnicode(unicode)
    };
  }

  function getCharFromUnicode(unicode) {
    return getUnicodeParts(unicode)
      .map(part => {
        const codepoint = parseInt(part, 16);
        return isNaN(codepoint) ? '' : String.fromCodePoint(codepoint);
      })
      .join('') || '?';
  }

  function estimatePathLength(d) {
    let total = 0;
    const parts = d.match(/[MLCQTASZ][^MLCQTASZ]*/gi) || [];
    parts.forEach(p => {
      const nums = p.match(/[\d.-]+/g) || [];
      nums.forEach(n => total += Math.abs(parseFloat(n)));
    });
    return Math.max(total, 100);
  }

  function play() {
    if (strokes.length === 0) return;

    if (!isPaused) {
      currentStroke = 0;
      activeStrokeElapsed = 0;
      resetStrokeStyles();
    }

    isPlaying = true;
    isPaused = false;
    updateButtonStates();
    animateNextStroke(activeStrokeElapsed);
  }

  function pause() {
    isPaused = true;
    isPlaying = false;
    clearAnimationTimers();
    updateButtonStates();
  }

  function reset() {
    isPlaying = false;
    isPaused = false;
    currentStroke = 0;
    activeStrokeElapsed = 0;
    clearAnimationTimers();
    resetStrokeStyles();
    updateButtonStates();
  }

  function clearAnimationTimers() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
    if (nextStrokeTimeout) {
      clearTimeout(nextStrokeTimeout);
      nextStrokeTimeout = null;
    }
  }

  function resetStrokeStyles() {
    if (!svgElement) return;
    const paths = svgElement.querySelectorAll('path');
    paths.forEach(path => {
      path.style.strokeDasharray = '';
      path.style.strokeDashoffset = '';
      path.style.opacity = '0.15';
    });
  }

  function animateNextStroke(resumeElapsed = 0) {
    if (currentStroke >= strokes.length || !isPlaying || isPaused) {
      if (currentStroke >= strokes.length) {
        isPlaying = false;
        activeStrokeElapsed = 0;
        updateButtonStates();
      }
      return;
    }

    const paths = svgElement.querySelectorAll('path');
    const path = paths[currentStroke];
    if (!path) { currentStroke++; animateNextStroke(); return; }

    const length = parseFloat(path.dataset.length) || estimatePathLength(strokes[currentStroke]);
    path.style.strokeDasharray = length;
    path.style.strokeDashoffset = length * (1 - Math.min(resumeElapsed / ANIMATION_SPEED, 1));
    path.style.opacity = '1';
    path.style.transition = 'none';

    const startTime = performance.now() - resumeElapsed;

    function step(time) {
      const elapsed = time - startTime;
      activeStrokeElapsed = Math.min(elapsed, ANIMATION_SPEED);
      const progress = Math.min(elapsed / ANIMATION_SPEED, 1);
      const offset = length * (1 - progress);
      path.style.strokeDashoffset = offset;

      if (progress < 1) {
        animationId = requestAnimationFrame(step);
      } else {
        path.style.strokeDashoffset = 0;
        currentStroke++;
        activeStrokeElapsed = 0;
        nextStrokeTimeout = setTimeout(() => {
          nextStrokeTimeout = null;
          animateNextStroke();
        }, 200);
      }
    }

    animationId = requestAnimationFrame(step);
  }

  function updateButtonStates() {
    const playBtn = container.querySelector('[data-action="play"]');
    const pauseBtn = container.querySelector('[data-action="pause"]');
    const resetBtn = container.querySelector('[data-action="reset"]');
    if (!playBtn) return;

    const hasStrokes = strokes.length > 0;
    playBtn.disabled = !hasStrokes || isPlaying;
    pauseBtn.disabled = !isPlaying;
    resetBtn.disabled = !hasStrokes || (currentStroke === 0 && activeStrokeElapsed === 0 && !isPlaying && !isPaused);
    playBtn.textContent = isPaused ? 'Retomar' : 'Reproduzir';

    if (onStateChange) onStateChange({ isPlaying, isPaused, currentStroke, total: strokes.length });
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return { init, loadCharacter };
})();
