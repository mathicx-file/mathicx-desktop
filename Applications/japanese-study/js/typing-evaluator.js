export const JapaneseTypingEvaluator = (() => {
  const OPTIONAL_PUNCTUATION = /[。、．.！!？?]/g;
  const WHITESPACE = /\s+/g;

  function normalizeAnswer(value, options = {}) {
    let text = String(value || '').normalize('NFKC').trim();
    if (options.ignoreWhitespace !== false) text = text.replace(WHITESPACE, '');
    if (options.ignorePunctuation !== false) text = text.replace(OPTIONAL_PUNCTUATION, '');
    return text;
  }

  function evaluateAnswer(value, exercise) {
    const answered = String(value || '');
    const expected = String(exercise?.answer || '');
    const acceptedAnswers = getAcceptedAnswers(exercise);
    const normalizedAnswered = normalizeAnswer(answered);
    const normalizedExpected = normalizeAnswer(expected);
    const normalizedAccepted = acceptedAnswers.map(answer => normalizeAnswer(answer));
    const correct = normalizedAccepted.includes(normalizedAnswered);
    const firstErrorIndex = findFirstErrorIndex(normalizedAnswered, normalizedExpected);
    const matchedCharacters = countMatchingPrefix(normalizedAnswered, normalizedExpected);
    const expectedLength = normalizedExpected.length;
    const accuracy = expectedLength > 0 ? Math.round((matchedCharacters / expectedLength) * 100) : 0;

    return {
      correct,
      answered,
      expected,
      normalizedAnswered,
      normalizedExpected,
      firstErrorIndex,
      matchedCharacters,
      expectedLength,
      accuracy,
      empty: normalizedAnswered.length === 0,
      incomplete: normalizedAnswered.length < normalizedExpected.length && matchedCharacters === normalizedAnswered.length
    };
  }

  function getAcceptedAnswers(exercise) {
    const values = [exercise?.answer, ...(Array.isArray(exercise?.acceptedAnswers) ? exercise.acceptedAnswers : [])];
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  }

  function findFirstErrorIndex(answered, expected) {
    const max = Math.max(answered.length, expected.length);
    for (let index = 0; index < max; index += 1) {
      if ((answered[index] || '') !== (expected[index] || '')) return index;
    }
    return -1;
  }

  function countMatchingPrefix(answered, expected) {
    let count = 0;
    const max = Math.min(answered.length, expected.length);
    while (count < max && answered[count] === expected[count]) count += 1;
    return count;
  }

  function getLiveFeedback(value, exercise) {
    const normalizedAnswered = normalizeAnswer(value);
    const normalizedExpected = normalizeAnswer(exercise?.answer || '');
    const firstErrorIndex = findFirstErrorIndex(normalizedAnswered, normalizedExpected.slice(0, normalizedAnswered.length));

    return {
      firstErrorIndex,
      correctPrefixLength: firstErrorIndex === -1 ? normalizedAnswered.length : firstErrorIndex,
      complete: normalizedAnswered === normalizedExpected,
      partial: firstErrorIndex === -1 && normalizedAnswered.length < normalizedExpected.length
    };
  }

  return {
    normalizeAnswer,
    evaluateAnswer,
    getLiveFeedback,
    findFirstErrorIndex
  };
})();
