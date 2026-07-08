import { JapaneseTypingEvaluator } from './typing-evaluator.js';

export function createTypingSession(exercises = [], settings = {}) {
  const startedAt = Date.now();
  const steps = [];
  let index = 0;
  let completed = false;

  function getCurrentExercise() {
    return exercises[index] || null;
  }

  function submit(value) {
    if (completed) return getSummary();
    const exercise = getCurrentExercise();
    if (!exercise) {
      completed = true;
      return getSummary();
    }

    const result = JapaneseTypingEvaluator.evaluateAnswer(value, exercise);
    const step = {
      exerciseId: exercise.id,
      promptPt: exercise.promptPt,
      expected: exercise.answer,
      answered: result.answered,
      correct: result.correct,
      accuracy: result.accuracy,
      firstErrorIndex: result.firstErrorIndex,
      timestamp: Date.now()
    };

    steps.push(step);
    if (index >= exercises.length - 1) {
      completed = true;
    } else {
      index += 1;
    }

    return {
      result,
      step,
      summary: getSummary(),
      nextExercise: getCurrentExercise()
    };
  }

  function getSummary(now = Date.now()) {
    const total = exercises.length;
    const answered = steps.length;
    const correct = steps.filter(step => step.correct).length;
    const errors = steps.filter(step => !step.correct).length;
    const kanaTyped = steps.reduce((sum, step) => sum + String(step.answered || '').length, 0);
    const durationMs = Math.max(now - startedAt, 0);
    const minutes = durationMs > 0 ? durationMs / 60000 : 0;
    const kanaPerMinute = minutes > 0 ? Math.round(kanaTyped / minutes) : 0;
    const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0;

    return {
      startedAt,
      durationMs,
      total,
      answered,
      correct,
      errors,
      accuracy,
      kanaTyped,
      kanaPerMinute,
      completed: completed || answered >= total,
      currentIndex: Math.min(index, Math.max(total - 1, 0)),
      settings: { ...settings },
      steps: [...steps]
    };
  }

  return {
    getCurrentExercise,
    submit,
    getSummary,
    isComplete: () => getSummary().completed
  };
}
