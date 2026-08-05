'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compareDocuments } = require('../src/analysis/matcher');
const { prepareParagraph } = require('../src/analysis/normalize');

function document(name, values, options = {}) {
  return {
    name,
    path: `C:/${name}`,
    paragraphs: values.map((raw, index) => ({
      ...prepareParagraph(raw, options),
      paragraphNumber: index + 1
    }))
  };
}

test('rejects a minimum length below six', () => {
  assert.throws(
    () => compareDocuments([document('a.txt', ['abcdef'])], [document('b.txt', ['abcdef'])], { minLength: 5 }),
    /at least 6/
  );
});

test('finds an exact six-character run', () => {
  const result = compareDocuments(
    [document('a.txt', ['XXabcdefYY'])],
    [document('b.txt', ['QQabcdefZZ'])],
    { minLength: 6, ignoreWhitespace: true }
  );
  assert.equal(result.summary.leftMatchedCharacters, 6);
  assert.equal(result.summary.rightMatchedCharacters, 6);
  assert.equal(result.matches[0].text, 'abcdef');
  assert.equal(result.matches[0].length, 6);
});

test('merges overlapping gram coverage instead of double counting', () => {
  const result = compareDocuments(
    [document('a.txt', ['abcdefghij'])],
    [document('b.txt', ['abcdefghij'])],
    { minLength: 6 }
  );
  assert.equal(result.summary.leftMatchedCharacters, 10);
  assert.equal(result.summary.rightMatchedCharacters, 10);
  assert.equal(result.summary.leftRate, 1);
  assert.equal(result.matches[0].text, 'abcdefghij');
});

test('ignores whitespace when requested', () => {
  const options = { minLength: 6, ignoreWhitespace: true };
  const result = compareDocuments(
    [document('a.txt', ['施工 进度 计划'], options)],
    [document('b.txt', ['施工进度计划'], options)],
    options
  );
  assert.equal(result.matches[0].text, '施工进度计划');
  assert.equal(result.summary.leftRate, 1);
});

test('can ignore punctuation', () => {
  const options = { minLength: 6, ignoreWhitespace: true, ignorePunctuation: true };
  const result = compareDocuments(
    [document('a.txt', ['钢筋、模板、混凝土'], options)],
    [document('b.txt', ['钢筋模板混凝土'], options)],
    options
  );
  assert.equal(result.matches[0].text, '钢筋模板混凝土');
});

test('excludes headings and custom terms from the denominator', () => {
  const options = {
    minLength: 6,
    ignoreWhitespace: true,
    excludeHeadings: true,
    exclusionTerms: ['共同项目名称']
  };
  const left = document('a.txt', ['1、项目施工方案', '共同项目名称abcdef'], options);
  const right = document('b.txt', ['1、项目施工方案', '共同项目名称abcdef'], options);
  const result = compareDocuments([left], [right], options);
  assert.equal(result.summary.leftCharacters, 6);
  assert.equal(result.summary.leftMatchedCharacters, 6);
  assert.equal(result.matches[0].text, 'abcdef');
});
