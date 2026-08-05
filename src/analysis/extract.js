'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const mammoth = require('mammoth');
const WordExtractor = require('word-extractor');
const { prepareParagraph } = require('./normalize');

const SUPPORTED_EXTENSIONS = new Set(['.doc', '.docx', '.txt', '.md']);

function splitParagraphs(text) {
  return String(text ?? '')
    .replace(/\r\n?/gu, '\n')
    .replace(/[\u0007\u000B\u000C]/gu, '\n')
    .split(/\n+/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

async function extractRawText(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`Unsupported file type: ${extension || 'unknown'}`);
  }

  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value;
  }

  if (extension === '.doc') {
    const extractor = new WordExtractor();
    const document = await extractor.extract(filePath);
    return document.getBody();
  }

  return fs.readFile(filePath, 'utf8');
}

async function extractDocument(filePath, options = {}) {
  const rawText = await extractRawText(filePath);
  const rawParagraphs = splitParagraphs(rawText);
  const paragraphs = rawParagraphs.map((raw, index) => ({
    ...prepareParagraph(raw, options),
    paragraphNumber: index + 1
  }));

  return {
    path: filePath,
    name: path.basename(filePath),
    paragraphs
  };
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  extractDocument,
  extractRawText,
  splitParagraphs
};
