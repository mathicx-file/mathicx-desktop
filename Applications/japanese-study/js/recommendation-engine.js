export const JapaneseRecommendationEngine = (() => {
  const SYLLABUS = [
    { id: 'hiragana-gojuuon', title: 'Hiragana Gojuuon', script: 'hiragana', categories: ['gojuuon'] },
    { id: 'hiragana-dakuon', title: 'Hiragana Dakuon e Handakuon', script: 'hiragana', categories: ['dakuon', 'handakuon'] },
    { id: 'hiragana-youon', title: 'Hiragana Youon', script: 'hiragana', categories: ['youon'] },
    { id: 'katakana-gojuuon', title: 'Katakana Gojuuon', script: 'katakana', categories: ['gojuuon'] },
    { id: 'katakana-dakuon', title: 'Katakana Dakuon e Handakuon', script: 'katakana', categories: ['dakuon', 'handakuon'] },
    { id: 'katakana-youon', title: 'Katakana Youon', script: 'katakana', categories: ['youon'] },
    { id: 'similar-kana', title: 'Revisao de caracteres parecidos', script: 'all', categories: ['gojuuon'] },
    { id: 'writing-basic', title: 'Escrita basica', script: 'all', categories: ['gojuuon'] },
    { id: 'pre-kanji', title: 'Pre-Kanji: vocabulario e radicais iniciais', script: 'all', categories: ['gojuuon'] },
    { id: 'kanji-n5-initial', title: 'Kanji N5 inicial', script: 'kanji', categories: ['N5'] }
  ];

  const GUIDED_TRAILS = [
    {
      id: 'hiragana-7-days',
      title: 'Hiragana em 7 dias',
      description: 'Comece pelo Gojuuon e avance por blocos curtos de hiragana.',
      quiz: { mode: 'multiple-choice', script: 'hiragana', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'katakana-7-days',
      title: 'Katakana em 7 dias',
      description: 'Construa reconhecimento de katakana antes de palavras estrangeiras.',
      quiz: { mode: 'multiple-choice', script: 'katakana', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'similar-kana',
      title: 'Kana parecidos',
      description: 'Reforce pares que costumam confundir leitura e escrita.',
      quiz: { mode: 'multiple-choice', script: 'all', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'active-production',
      title: 'Producao ativa',
      description: 'Veja o romaji e produza o kana sem depender de alternativas.',
      quiz: { mode: 'kana-typing', script: 'hiragana', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'kanji-n5-initial',
      title: 'Primeiros Kanji N5',
      description: 'Pratique significado e leitura dos 10 primeiros kanji.',
      quiz: { mode: 'multiple-choice', script: 'kanji', categories: ['N5'], limit: '10', includeMistakeReviews: true }
    }
  ];

  const QUICK_SESSIONS = [
    {
      id: 'five-minute-review',
      title: 'Revisao de 5 minutos',
      quiz: { mode: 'multiple-choice', script: 'all', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'new-hiragana',
      title: '10 hiragana basicos',
      quiz: { mode: 'multiple-choice', script: 'hiragana', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'new-katakana',
      title: '10 katakana basicos',
      quiz: { mode: 'multiple-choice', script: 'katakana', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'active-kana',
      title: 'Producao ativa',
      quiz: { mode: 'kana-typing', script: 'all', categories: ['gojuuon'], limit: '10', includeMistakeReviews: true }
    },
    {
      id: 'flashcards',
      title: 'Flashcards rapidos',
      quiz: { mode: 'flashcards', script: 'all', categories: ['gojuuon'], limit: '10', includeMistakeReviews: false }
    },
    {
      id: 'kanji-n5',
      title: 'Kanji N5 inicial',
      quiz: { mode: 'multiple-choice', script: 'kanji', categories: ['N5'], limit: '10', includeMistakeReviews: true }
    }
  ];

  function recommend(data = {}) {
    const srsStats = data.srsStats || {};
    const difficulty = data.difficulty || [];
    const completion = data.completion || {};
    const diagnostic = data.diagnostic || {};

    if ((srsStats.due || 0) > 0 && (srsStats.totalTracked || 0) > 0) {
      return buildRecommendation({
        type: 'review',
        title: 'Revisar pendentes',
        description: `Voce tem ${srsStats.due} revisao(oes) vencida(s) no SRS.`,
        reason: 'SRS vencido tem prioridade porque protege o que voce ja estudou.',
        evidence: [
          `${srsStats.due} revisao(oes) vencida(s)`,
          `${srsStats.totalTracked} item(ns) acompanhados no SRS`
        ],
        actionLabel: 'Revisar agora',
        nextStep: 'Depois da revisao, avance apenas se a precisao ficar estavel.',
        session: { reason: 'review-due', script: 'all', categories: ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'], mode: 'multiple-choice', limit: 10 }
      });
    }

    const recurringErrors = difficulty.filter(item => (item.errors || 0) >= 2 && (item.accuracy || 0) < 70);
    if (recurringErrors.length >= 2) {
      const examples = recurringErrors.slice(0, 3).map(item => item.char || item.romaji || item.charId).filter(Boolean);
      return buildRecommendation({
        type: 'reinforcement',
        title: 'Reforcar erros recentes',
        description: 'Alguns caracteres apareceram com baixa precisao. Faca uma sessao curta de reforco.',
        reason: 'Erros repetidos indicam que vale corrigir confusoes antes de adicionar conteudo novo.',
        evidence: [
          `${recurringErrors.length} caractere(s) com erro recorrente`,
          examples.length ? `Atencao em: ${examples.join(', ')}` : 'Precisao abaixo de 70%'
        ],
        actionLabel: 'Reforcar agora',
        nextStep: 'Se a sessao melhorar, volte para a ementa normal no proximo estudo.',
        session: { reason: 'recent-errors', script: 'all', categories: ['gojuuon', 'dakuon', 'handakuon', 'youon', 'N5'], mode: 'multiple-choice', limit: 10 }
      });
    }

    const nextItem = getNextSyllabusItem(data.characters || [], data.studiedIds || [], completion, diagnostic);
    return buildRecommendation({
      type: 'syllabus',
      title: nextItem.title,
      description: nextItem.description || 'Proximo bloco recomendado da ementa.',
      reason: nextItem.reason || 'A ementa avanca em blocos pequenos para manter revisao e conteudo novo equilibrados.',
      evidence: buildSyllabusEvidence(nextItem, completion, diagnostic),
      actionLabel: 'Estudar este bloco',
      nextStep: nextItem.nextStep || 'Ao concluir, o assistente recalcula o proximo bloco com seu novo progresso.',
      session: {
        reason: nextItem.id,
        script: nextItem.script,
        categories: nextItem.categories,
        mode: 'multiple-choice',
        limit: 10
      }
    });
  }

  function getNextSyllabusItem(characters, studiedIds, completion, diagnostic) {
    const studied = new Set(studiedIds || []);
    const weakScript = diagnostic?.weakScript;

    if (weakScript === 'katakana') {
      return {
        ...SYLLABUS[3],
        description: 'Seu diagnostico indica que katakana merece atencao.',
        reason: 'O diagnostico marcou katakana como ponto fraco.',
        nextStep: 'Reforce katakana basico antes de misturar muitos modos.'
      };
    }

    for (const item of SYLLABUS.slice(0, 6)) {
      const pool = characters.filter(char =>
        char.script === item.script &&
        item.categories.includes(char.category)
      );
      const studiedCount = pool.filter(char => studied.has(buildStudyId(char))).length;
      const ratio = pool.length ? studiedCount / pool.length : 1;
      if (ratio < 0.8) return item;
    }

    if (getPercent(completion.katakana) >= 80 && getPercent(completion.hiragana) >= 80) {
      if (getPercent(completion.kanji) < 80) {
        return {
          ...SYLLABUS[9],
          reason: 'Kana ja esta forte o suficiente para inserir Kanji N5 em uma fatia pequena.',
          nextStep: 'Misture significado, leitura e vocabulario antes de aumentar o conjunto de kanji.'
        };
      }
      return SYLLABUS[7];
    }

    return SYLLABUS[0];
  }

  function buildRecommendation(data) {
    return {
      schemaVersion: 1,
      type: data.type || 'syllabus',
      title: data.title || 'Sessao recomendada',
      description: data.description || 'Faca uma sessao curta com base no seu progresso.',
      reason: data.reason || 'O assistente escolheu uma sessao curta para manter consistencia.',
      evidence: normalizeEvidence(data.evidence),
      action: data.action || 'study-now',
      actionLabel: data.actionLabel || 'Estudar agora',
      nextStep: data.nextStep || 'Depois da sessao, revise o resumo e siga a proxima recomendacao.',
      session: data.session || { reason: 'default', script: 'hiragana', categories: ['gojuuon'], mode: 'multiple-choice', limit: 10 }
    };
  }

  function buildSyllabusEvidence(item, completion, diagnostic) {
    const evidence = [];
    if (diagnostic?.level) evidence.push(`Diagnostico: ${diagnostic.level}`);
    if (item.script === 'kanji') {
      evidence.push(`Kanji N5: ${getPercent(completion.kanji)}% estudado`);
      evidence.push(`Hiragana: ${getPercent(completion.hiragana)}% e Katakana: ${getPercent(completion.katakana)}%`);
      return evidence;
    }
    if (item.script === 'hiragana' || item.script === 'katakana') {
      evidence.push(`${capitalize(item.script)}: ${getPercent(completion[item.script])}% estudado`);
    } else {
      evidence.push(`Hiragana: ${getPercent(completion.hiragana)}%`);
      evidence.push(`Katakana: ${getPercent(completion.katakana)}%`);
    }
    return evidence;
  }

  function normalizeEvidence(evidence) {
    return Array.isArray(evidence)
      ? evidence.map(item => String(item || '').trim()).filter(Boolean).slice(0, 4)
      : [];
  }

  function getPercent(group = {}) {
    const total = Number(group.total || 0);
    return total > 0 ? Math.round((Number(group.studied || 0) / total) * 100) : 0;
  }

  function getGuidedTrail(id) {
    return GUIDED_TRAILS.find(item => item.id === id) || null;
  }

  function getQuickSession(id) {
    return QUICK_SESSIONS.find(item => item.id === id) || null;
  }

  function buildStudyId(item) {
    if (item?.script === 'kanji') return `kanji_${item.id || item.unicode || item.char}`;
    return `${item.romaji}_${item.char}`;
  }

  function capitalize(value) {
    const text = String(value || '');
    return text ? text[0].toUpperCase() + text.slice(1) : '';
  }

  return { recommend, SYLLABUS, GUIDED_TRAILS, QUICK_SESSIONS, getGuidedTrail, getQuickSession };
})();
