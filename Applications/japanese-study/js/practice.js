export const JapanesePractice = (() => {
  const SAMPLE_POINTS = 24;
  const GUIDE_PADDING = 28;

  let canvas = null;
  let ctx = null;
  let boundCanvas = null;
  let isDrawing = false;
  let strokes = [];
  let currentStroke = null;
  let target = null;
  let targetModel = null;

  function init(canvasEl) {
    if (!canvasEl) return;
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    setupCanvas();

    if (boundCanvas !== canvas) {
      bindEvents();
      boundCanvas = canvas;
    }
  }

  function setupCanvas() {
    if (!canvas || !ctx) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const size = Math.max(220, Math.min(rect.width - 4, 400));
    const ratio = window.devicePixelRatio || 1;

    canvas.width = Math.round(size * ratio);
    canvas.height = Math.round(size * ratio);
    canvas.style.width = size + 'px';
    canvas.style.height = size + 'px';

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    configureUserStroke();
    redraw();
  }

  function bindEvents() {
    const wrapper = canvas.parentElement;

    wrapper.addEventListener('mousedown', startDraw);
    wrapper.addEventListener('mousemove', moveDraw);
    wrapper.addEventListener('mouseup', endDraw);
    wrapper.addEventListener('mouseleave', endDraw);
    wrapper.addEventListener('touchstart', startDraw, { passive: false });
    wrapper.addEventListener('touchmove', moveDraw, { passive: false });
    wrapper.addEventListener('touchend', endDraw, { passive: false });
  }

  function startPractice(nextTarget, strokeModel) {
    target = nextTarget || null;
    targetModel = strokeModel || null;
    strokes = [];
    currentStroke = null;
    isDrawing = false;
    setupCanvas();
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return {
      x: point.clientX - rect.left,
      y: point.clientY - rect.top
    };
  }

  function startDraw(e) {
    if (!canvas || !ctx) return;
    e.preventDefault();
    isDrawing = true;
    currentStroke = [];

    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    currentStroke.push(pos);
  }

  function moveDraw(e) {
    if (!isDrawing || !ctx) return;
    e.preventDefault();

    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    currentStroke.push(pos);
  }

  function endDraw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    isDrawing = false;

    if (currentStroke && currentStroke.length > 1) {
      strokes.push(currentStroke);
    }
    currentStroke = null;
  }

  function clearCanvas(color) {
    if (!ctx) return;
    strokes = [];
    currentStroke = null;
    if (color) ctx.strokeStyle = color;
    redraw();
  }

  function showModel(char) {
    target = { char };
    targetModel = null;
    clearCanvas();
  }

  function redraw() {
    if (!canvas || !ctx) return;
    const size = getCanvasSize();
    ctx.clearRect(0, 0, size.width, size.height);
    drawGuide();
    configureUserStroke();
  }

  function drawGuide() {
    if (!ctx) return;

    if (hasComparableModel()) {
      const styles = getComputedStyle(document.documentElement);
      ctx.save();
      ctx.strokeStyle = styles.getPropertyValue('--text-muted').trim() || '#adb5bd';
      ctx.globalAlpha = 0.35;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      targetModel.strokes.forEach(stroke => {
        drawPolyline(modelPointsToCanvas(stroke.points));
      });
      ctx.restore();
      return;
    }

    const char = target && target.char ? target.char : '';
    if (!char) return;

    const size = getCanvasSize();
    const styles = getComputedStyle(document.documentElement);
    ctx.save();
    ctx.font = `${Math.min(size.width * 0.5, 160)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = styles.getPropertyValue('--text-muted').trim() || '#adb5bd';
    ctx.globalAlpha = 0.22;
    ctx.fillText(char, size.width / 2, size.height / 2);
    ctx.restore();
  }

  function configureUserStroke() {
    if (!ctx) return;
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#e63946';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
  }

  function compare() {
    if (strokes.length === 0) {
      return { rating: 'needs-practice', message: 'Desenhe primeiro!', score: 0 };
    }

    if (!hasComparableModel()) {
      return compareFallback();
    }

    const user = strokes.map(normalizeUserStroke).filter(stroke => stroke.points.length > 1);
    const expected = targetModel.strokes;
    const countScore = scoreStrokeCount(user.length, expected.length);
    const compared = Math.min(user.length, expected.length);

    let directionTotal = 0;
    let precisionTotal = 0;
    let orderTotal = 0;

    for (let i = 0; i < compared; i++) {
      const userStroke = user[i];
      const targetStroke = expected[i];
      const direction = scoreDirection(userStroke, targetStroke);
      const precision = scorePrecision(userStroke, targetStroke);
      directionTotal += direction;
      precisionTotal += precision;
      orderTotal += (direction * 0.4) + (precision * 0.6);
    }

    const directionScore = compared ? directionTotal / compared : 0;
    const precisionScore = compared ? precisionTotal / compared : 0;
    const orderScore = compared ? orderTotal / compared : 0;
    const layoutScore = scoreBoundingBox(getCombinedBox(user), getCombinedBox(expected));

    const score = Math.round(
      countScore * 0.25 +
      orderScore * 0.2 +
      directionScore * 0.2 +
      precisionScore * 0.25 +
      layoutScore * 0.1
    );

    return buildResult(score, {
      count: `${user.length}/${expected.length}`,
      direction: directionScore,
      precision: precisionScore,
      layout: layoutScore
    });
  }

  function compareFallback() {
    const declared = target && Number(target.strokes) ? Number(target.strokes) : 0;
    const userStats = analyzeStrokeSet(strokes.map(normalizeUserStroke));
    const countScore = declared ? scoreStrokeCount(strokes.length, declared) : 55;
    const lengthScore = clamp(userStats.avgLength * 260, 0, 100);
    const shapeScore = userStats.directionVariety * 100;
    const boxScore = userStats.coverage > 0.08 ? 80 : 35;
    const score = Math.round(countScore * 0.4 + lengthScore * 0.2 + shapeScore * 0.2 + boxScore * 0.2);

    return buildResult(Math.min(score, 68), {
      count: declared ? `${strokes.length}/${declared}` : `${strokes.length}`,
      fallback: true
    });
  }

  function buildResult(score, details) {
    let rating = 'needs-practice';
    let label = 'Praticar mais';

    if (score >= 85) {
      rating = 'excellent';
      label = 'Excelente';
    } else if (score >= 70) {
      rating = 'good';
      label = 'Bom';
    } else if (score >= 50) {
      rating = 'regular';
      label = 'Regular';
    }

    const tips = [];
    if (details.count) tips.push('tra\u00e7os ' + details.count);
    if (details.fallback) {
      tips.push('guia textual');
    } else {
      tips.push(details.direction >= 70 ? 'dire\u00e7\u00e3o boa' : 'ajuste a dire\u00e7\u00e3o');
      tips.push(details.precision >= 70 ? 'forma boa' : 'aproxime do guia');
      if (details.layout < 65) tips.push('ajuste a posi\u00e7\u00e3o');
    }

    return {
      rating,
      score,
      message: `${label}: ${score}/100 - ${tips.join(', ')}.`
    };
  }

  function hasComparableModel() {
    return targetModel &&
      targetModel.source === 'kanjivg' &&
      Array.isArray(targetModel.strokes) &&
      targetModel.strokes.length > 0;
  }

  function normalizeUserStroke(stroke) {
    const size = getCanvasSize();
    const points = stroke.map(point => ({
      x: clamp(point.x / size.width, 0, 1),
      y: clamp(point.y / size.height, 0, 1)
    }));

    return buildStrokeStats(resamplePoints(points, SAMPLE_POINTS));
  }

  function modelPointsToCanvas(points) {
    const size = getCanvasSize();
    const usable = Math.max(1, size.width - GUIDE_PADDING * 2);
    return points.map(point => ({
      x: GUIDE_PADDING + point.x * usable,
      y: GUIDE_PADDING + point.y * usable
    }));
  }

  function scoreStrokeCount(actual, expected) {
    if (!expected) return 50;
    const diff = Math.abs(actual - expected);
    return clamp(100 - diff * 28, 0, 100);
  }

  function scoreDirection(userStroke, targetStroke) {
    const dot =
      userStroke.direction.x * targetStroke.direction.x +
      userStroke.direction.y * targetStroke.direction.y;
    return clamp(((dot + 1) / 2) * 100, 0, 100);
  }

  function scorePrecision(userStroke, targetStroke) {
    const userPoints = userStroke.points;
    const targetPoints = targetStroke.points;
    const count = Math.min(userPoints.length, targetPoints.length);
    if (!count) return 0;

    let total = 0;
    for (let i = 0; i < count; i++) {
      total += distance(userPoints[i], targetPoints[i]);
    }

    const avg = total / count;
    return clamp(100 - avg * 260, 0, 100);
  }

  function scoreBoundingBox(actual, expected) {
    if (!actual || !expected) return 0;
    const centerDistance = distance(getBoxCenter(actual), getBoxCenter(expected));
    const widthDiff = Math.abs(actual.width - expected.width);
    const heightDiff = Math.abs(actual.height - expected.height);
    return clamp(100 - centerDistance * 180 - (widthDiff + heightDiff) * 70, 0, 100);
  }

  function analyzeStrokeSet(strokeSet) {
    let totalLength = 0;
    let horizontal = 0;
    let vertical = 0;
    let diagonal = 0;
    const box = getCombinedBox(strokeSet);

    strokeSet.forEach(stroke => {
      totalLength += stroke.length;
      const angle = Math.abs(Math.atan2(stroke.direction.y, stroke.direction.x));
      if (angle < 0.45) horizontal++;
      else if (angle > 1.15) vertical++;
      else diagonal++;
    });

    const variety = (horizontal ? 1 : 0) + (vertical ? 1 : 0) + (diagonal ? 1 : 0);
    return {
      avgLength: strokeSet.length ? totalLength / strokeSet.length : 0,
      directionVariety: variety / 3,
      coverage: box ? box.width * box.height : 0
    };
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
      length: getPathLength(points),
      box: getPointBox(points)
    };
  }

  function resamplePoints(points, targetCount) {
    if (points.length <= 1) return points;

    const totalLength = getPathLength(points);
    if (totalLength === 0) return Array.from({ length: targetCount }, () => points[0]);

    const result = [points[0]];
    let segmentStart = points[0];
    let segmentIndex = 1;
    let walked = 0;

    for (let i = 1; i < targetCount - 1; i++) {
      const targetDistance = (totalLength * i) / (targetCount - 1);

      while (segmentIndex < points.length) {
        const segmentEnd = points[segmentIndex];
        const segmentLength = distance(segmentStart, segmentEnd);

        if (walked + segmentLength >= targetDistance) {
          const ratio = segmentLength === 0 ? 0 : (targetDistance - walked) / segmentLength;
          result.push({
            x: segmentStart.x + (segmentEnd.x - segmentStart.x) * ratio,
            y: segmentStart.y + (segmentEnd.y - segmentStart.y) * ratio
          });
          break;
        }

        walked += segmentLength;
        segmentStart = segmentEnd;
        segmentIndex++;
      }
    }

    result.push(points[points.length - 1]);
    return result;
  }

  function getCombinedBox(strokeSet) {
    const boxes = strokeSet.map(stroke => stroke.box).filter(Boolean);
    if (!boxes.length) return null;

    const minX = Math.min(...boxes.map(box => box.minX));
    const minY = Math.min(...boxes.map(box => box.minY));
    const maxX = Math.max(...boxes.map(box => box.maxX));
    const maxY = Math.max(...boxes.map(box => box.maxY));

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
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

  function getBoxCenter(box) {
    return {
      x: box.minX + box.width / 2,
      y: box.minY + box.height / 2
    };
  }

  function getPathLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += distance(points[i - 1], points[i]);
    }
    return total;
  }

  function drawPolyline(points) {
    if (!points.length) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function getCanvasSize() {
    const ratio = window.devicePixelRatio || 1;
    return {
      width: canvas.width / ratio,
      height: canvas.height / ratio
    };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  return { init, setupCanvas, clearCanvas, showModel, startPractice, compare };
})();

