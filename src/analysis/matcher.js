'use strict';

const NUL = '\u0000';
const MAX_SAMPLE_LOCATIONS = 48;
const MAX_DISPLAY_MATCHES = 10000;

function assertMinLength(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number) || number < 6) {
    throw new Error('Minimum match length must be at least 6 characters.');
  }
  return number;
}

function flattenDocuments(documents) {
  const paragraphs = [];
  for (const document of documents) {
    for (const paragraph of document.paragraphs) {
      paragraphs.push({
        ...paragraph,
        documentName: document.name,
        documentPath: document.path,
        flatIndex: paragraphs.length
      });
    }
  }
  return paragraphs;
}

function isMatchableGram(gram) {
  return gram.length > 0 && !gram.includes(NUL);
}

function buildGramData(paragraphs, minLength) {
  const gramSet = new Set();
  const samples = new Map();

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const text = paragraph.normalized;
    for (let offset = 0; offset <= text.length - minLength; offset += 1) {
      const gram = text.slice(offset, offset + minLength);
      if (!isMatchableGram(gram)) continue;
      gramSet.add(gram);
      let locations = samples.get(gram);
      if (!locations) {
        locations = [];
        samples.set(gram, locations);
      }
      if (locations.length < MAX_SAMPLE_LOCATIONS) {
        locations.push({ paragraphIndex, offset });
      }
    }
  });

  return { gramSet, samples };
}

function countMatchableCharacters(text) {
  let count = 0;
  for (const character of text) {
    if (character !== NUL) count += 1;
  }
  return count;
}

function calculateCoverage(paragraphs, otherGramSet, minLength) {
  const byParagraph = [];
  let totalCharacters = 0;
  let matchedCharacters = 0;

  paragraphs.forEach((paragraph) => {
    const text = paragraph.normalized;
    const difference = new Int32Array(text.length + 1);
    for (let offset = 0; offset <= text.length - minLength; offset += 1) {
      const gram = text.slice(offset, offset + minLength);
      if (!isMatchableGram(gram) || !otherGramSet.has(gram)) continue;
      difference[offset] += 1;
      difference[offset + minLength] -= 1;
    }

    let active = 0;
    let paragraphMatched = 0;
    for (let offset = 0; offset < text.length; offset += 1) {
      active += difference[offset];
      if (active > 0 && text[offset] !== NUL) paragraphMatched += 1;
    }

    const paragraphTotal = countMatchableCharacters(text);
    totalCharacters += paragraphTotal;
    matchedCharacters += paragraphMatched;
    byParagraph.push({ totalCharacters: paragraphTotal, matchedCharacters: paragraphMatched });
  });

  return { totalCharacters, matchedCharacters, byParagraph };
}

function extendMatch(leftText, leftOffset, rightText, rightOffset, minLength) {
  let leftStart = leftOffset;
  let rightStart = rightOffset;
  let length = minLength;

  while (
    leftStart > 0 &&
    rightStart > 0 &&
    leftText[leftStart - 1] !== NUL &&
    leftText[leftStart - 1] === rightText[rightStart - 1]
  ) {
    leftStart -= 1;
    rightStart -= 1;
    length += 1;
  }

  while (
    leftStart + length < leftText.length &&
    rightStart + length < rightText.length &&
    leftText[leftStart + length] !== NUL &&
    leftText[leftStart + length] === rightText[rightStart + length]
  ) {
    length += 1;
  }

  return { leftStart, rightStart, length };
}

function collectMatches(leftParagraphs, rightParagraphs, rightSamples, minLength) {
  const occurrenceKeys = new Set();
  const byText = new Map();

  leftParagraphs.forEach((leftParagraph, leftParagraphIndex) => {
    const leftText = leftParagraph.normalized;
    for (let leftOffset = 0; leftOffset <= leftText.length - minLength; leftOffset += 1) {
      const gram = leftText.slice(leftOffset, leftOffset + minLength);
      if (!isMatchableGram(gram)) continue;
      const candidates = rightSamples.get(gram);
      if (!candidates) continue;

      for (const candidate of candidates) {
        const rightParagraph = rightParagraphs[candidate.paragraphIndex];
        const extended = extendMatch(
          leftText,
          leftOffset,
          rightParagraph.normalized,
          candidate.offset,
          minLength
        );
        const occurrenceKey = [
          leftParagraphIndex,
          extended.leftStart,
          candidate.paragraphIndex,
          extended.rightStart,
          extended.length
        ].join(':');
        if (occurrenceKeys.has(occurrenceKey)) continue;
        occurrenceKeys.add(occurrenceKey);

        const text = leftText.slice(extended.leftStart, extended.leftStart + extended.length);
        let match = byText.get(text);
        if (!match) {
          match = {
            text,
            length: text.length,
            occurrences: 0,
            left: {
              file: leftParagraph.documentName,
              path: leftParagraph.documentPath,
              paragraph: leftParagraph.paragraphNumber
            },
            right: {
              file: rightParagraph.documentName,
              path: rightParagraph.documentPath,
              paragraph: rightParagraph.paragraphNumber
            }
          };
          byText.set(text, match);
        }
        match.occurrences += 1;
      }
    }
  });

  return [...byText.values()]
    .sort((first, second) => second.length - first.length || second.occurrences - first.occurrences)
    .slice(0, MAX_DISPLAY_MATCHES);
}

function groupCoverageByFile(paragraphs, coverage) {
  const files = new Map();
  paragraphs.forEach((paragraph, index) => {
    let item = files.get(paragraph.documentPath);
    if (!item) {
      item = {
        name: paragraph.documentName,
        path: paragraph.documentPath,
        totalCharacters: 0,
        matchedCharacters: 0
      };
      files.set(paragraph.documentPath, item);
    }
    item.totalCharacters += coverage.byParagraph[index].totalCharacters;
    item.matchedCharacters += coverage.byParagraph[index].matchedCharacters;
  });

  return [...files.values()].map((item) => ({
    ...item,
    rate: item.totalCharacters === 0 ? 0 : item.matchedCharacters / item.totalCharacters
  }));
}

function compareDocuments(leftDocuments, rightDocuments, options = {}) {
  const minLength = assertMinLength(options.minLength);
  const leftParagraphs = flattenDocuments(leftDocuments);
  const rightParagraphs = flattenDocuments(rightDocuments);
  const leftGramData = buildGramData(leftParagraphs, minLength);
  const rightGramData = buildGramData(rightParagraphs, minLength);

  const leftCoverage = calculateCoverage(leftParagraphs, rightGramData.gramSet, minLength);
  const rightCoverage = calculateCoverage(rightParagraphs, leftGramData.gramSet, minLength);
  const matches = collectMatches(
    leftParagraphs,
    rightParagraphs,
    rightGramData.samples,
    minLength
  );

  return {
    generatedAt: new Date().toISOString(),
    options: { ...options, minLength },
    summary: {
      minLength,
      uniqueMatches: matches.length,
      leftCharacters: leftCoverage.totalCharacters,
      rightCharacters: rightCoverage.totalCharacters,
      leftMatchedCharacters: leftCoverage.matchedCharacters,
      rightMatchedCharacters: rightCoverage.matchedCharacters,
      leftRate: leftCoverage.totalCharacters === 0 ? 0 : leftCoverage.matchedCharacters / leftCoverage.totalCharacters,
      rightRate: rightCoverage.totalCharacters === 0 ? 0 : rightCoverage.matchedCharacters / rightCoverage.totalCharacters
    },
    files: {
      left: groupCoverageByFile(leftParagraphs, leftCoverage),
      right: groupCoverageByFile(rightParagraphs, rightCoverage)
    },
    matches
  };
}

module.exports = {
  assertMinLength,
  buildGramData,
  calculateCoverage,
  compareDocuments,
  extendMatch,
  flattenDocuments
};
