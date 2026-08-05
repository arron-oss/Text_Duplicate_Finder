'use strict';

const { parentPort, workerData } = require('node:worker_threads');
const { extractDocument } = require('./extract');
const { compareDocuments } = require('./matcher');

async function extractSide(paths, options, label, startPercent, endPercent) {
  const documents = [];
  for (let index = 0; index < paths.length; index += 1) {
    const filePath = paths[index];
    parentPort.postMessage({
      type: 'progress',
      stage: `正在读取${label}文件 ${index + 1}/${paths.length}`,
      percent: startPercent + Math.round(((index + 1) / paths.length) * (endPercent - startPercent))
    });
    documents.push(await extractDocument(filePath, options));
  }
  return documents;
}

async function run() {
  const { leftPaths, rightPaths, options } = workerData;
  const left = await extractSide(leftPaths, options, '左侧', 0, 25);
  const right = await extractSide(rightPaths, options, '右侧', 25, 50);
  parentPort.postMessage({ type: 'progress', stage: '正在建立连续字符索引', percent: 58 });
  const result = compareDocuments(left, right, options);
  parentPort.postMessage({ type: 'progress', stage: '正在整理匹配结果', percent: 96 });
  parentPort.postMessage({ type: 'result', result });
}

run().catch((error) => {
  parentPort.postMessage({
    type: 'error',
    error: error instanceof Error ? error.message : String(error)
  });
});
