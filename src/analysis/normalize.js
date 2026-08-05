'use strict';

const HEADING_PATTERN = /^\s*(?:第?[一二三四五六七八九十百\d]+[章节篇部分、.．]|[（(]?[一二三四五六七八九十\d]+[）)]?[、.．])\s*/u;

function normalizeText(value, options = {}) {
  const ignoreWhitespace = options.ignoreWhitespace !== false;
  const ignorePunctuation = options.ignorePunctuation === true;
  let text = String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, '')
    .replace(/[\u200B\uFEFF]/gu, '');

  if (ignoreWhitespace) {
    text = text.replace(/\s+/gu, '');
  }
  if (ignorePunctuation) {
    text = text.replace(/[\p{P}\p{S}]/gu, '');
  }
  return text;
}

function isHeading(text) {
  const value = String(text ?? '').trim();
  return value.length > 0 && value.length <= 80 && HEADING_PATTERN.test(value);
}

function applyExclusions(normalized, normalizedTerms) {
  if (!normalized || normalizedTerms.length === 0) {
    return normalized;
  }

  const chars = Array.from(normalized);
  for (const term of normalizedTerms) {
    if (!term) continue;
    let offset = 0;
    while (offset <= normalized.length - term.length) {
      const found = normalized.indexOf(term, offset);
      if (found === -1) break;
      for (let index = found; index < found + term.length; index += 1) {
        chars[index] = '\u0000';
      }
      offset = found + Math.max(1, term.length);
    }
  }
  return chars.join('');
}

function prepareParagraph(raw, options = {}) {
  if (options.excludeHeadings && isHeading(raw)) {
    return { raw, normalized: '', excluded: true };
  }

  const normalized = normalizeText(raw, options);
  const terms = (options.exclusionTerms || [])
    .map((term) => normalizeText(term, options))
    .filter(Boolean);

  return {
    raw,
    normalized: applyExclusions(normalized, terms),
    excluded: false
  };
}

module.exports = {
  applyExclusions,
  isHeading,
  normalizeText,
  prepareParagraph
};
