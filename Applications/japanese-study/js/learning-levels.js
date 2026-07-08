import { JapaneseGamificationEngine } from './gamification-engine.js';

export const JapaneseLearningLevels = (() => {
  const LEVELS = JapaneseGamificationEngine.LEVELS;

  function calculate(data = {}) {
    return JapaneseGamificationEngine.summarize({
      ...data,
      events: data.gamificationEvents || data.events || data.gamificationStats?.events || []
    });
  }

  return { calculate, LEVELS };
})();
