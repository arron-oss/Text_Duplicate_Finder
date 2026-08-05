'use strict';

const state = {
  left: [],
  right: [],
  result: null,
  running: false,
  cancelRequested: false,
  analysisId: null,
  visibleMatches: 250,
  activeTab: 'matches'
};

const elements = {
  minLength: document.querySelector('#minLength'),
  ignoreWhitespace: document.querySelector('#ignoreWhitespace'),
  ignorePunctuation: document.querySelector('#ignorePunctuation'),
  excludeHeadings: document.querySelector('#excludeHeadings'),
  exclusionToggle: document.querySelector('#exclusionToggle'),
  exclusionPanel: document.querySelector('#exclusionPanel'),
  exclusionTerms: document.querySelector('#exclusionTerms'),
  runButton: document.querySelector('#runButton'),
  cancelButton: document.querySelector('#cancelButton'),
  progressBand: document.querySelector('#progressBand'),
  progressStage: document.querySelector('#progressStage'),
  progressPercent: document.querySelector('#progressPercent'),
  progressFill: document.querySelector('#progressFill'),
  results: document.querySelector('#results'),
  matchRows: document.querySelector('#matchRows'),
  matchSearch: document.querySelector('#matchSearch'),
  matchVisibleCount: document.querySelector('#matchVisibleCount'),
  loadMore: document.querySelector('#loadMore'),
  fileStats: document.querySelector('#fileStats'),
  toast: document.querySelector('#toast')
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((element) => {
    const svg = window.bidAudit.icon(element.dataset.icon);
    if (svg) element.innerHTML = svg;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatNumber(number) {
  return new Intl.NumberFormat('zh-CN').format(number || 0);
}

function formatRate(rate) {
  return `${((rate || 0) * 100).toFixed(2)}%`;
}

let toastTimer;
function showToast(message, error = false) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.classList.remove('hidden');
  toastTimer = setTimeout(() => elements.toast.classList.add('hidden'), 3600);
}

function markInputsChanged() {
  if (state.result) {
    state.result = null;
    elements.results.classList.add('hidden');
  }
}

function mergeFiles(side, files) {
  const map = new Map(state[side].map((file) => [file.path.toLowerCase(), file]));
  for (const file of files) map.set(file.path.toLowerCase(), file);
  state[side] = [...map.values()].sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'));
  markInputsChanged();
  renderFiles(side);
  updateRunButton();
}

function renderFiles(side) {
  const container = document.querySelector(`#${side}Dropzone`);
  const files = state[side];
  document.querySelector(`#${side}Count`).textContent = `${files.length} 个文件`;
  if (files.length === 0) {
    container.innerHTML = '<div class="empty-state"><span data-icon="Files"></span><strong>尚未添加文件</strong></div>';
    hydrateIcons(container);
    return;
  }

  container.innerHTML = files.map((file) => `
    <div class="file-row">
      <div class="file-name" title="${escapeHtml(file.path)}">
        <span data-icon="FileText"></span>
        <div><strong>${escapeHtml(file.name)}</strong><small>${escapeHtml(file.directory)}</small></div>
      </div>
      <span class="file-size">${formatBytes(file.size)}</span>
      <button class="remove-file" data-remove="${escapeHtml(file.path)}" title="移除" type="button"><span data-icon="X"></span></button>
    </div>
  `).join('');
  hydrateIcons(container);
}

function updateRunButton() {
  elements.runButton.disabled = state.running || state.left.length === 0 || state.right.length === 0;
}

async function addFiles(side, folder = false) {
  try {
    const files = folder ? await window.bidAudit.pickFolder() : await window.bidAudit.pickFiles();
    mergeFiles(side, files);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
}

function readOptions() {
  const minLength = Math.max(6, Number.parseInt(elements.minLength.value, 10) || 6);
  elements.minLength.value = String(minLength);
  return {
    minLength,
    ignoreWhitespace: elements.ignoreWhitespace.checked,
    ignorePunctuation: elements.ignorePunctuation.checked,
    excludeHeadings: elements.excludeHeadings.checked,
    exclusionTerms: elements.exclusionTerms.value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
  };
}

function setRunning(running) {
  state.running = running;
  elements.cancelButton.classList.toggle('hidden', !running);
  elements.runButton.classList.toggle('hidden', running);
  elements.progressBand.classList.toggle('hidden', !running);
  updateRunButton();
}

async function runAnalysis() {
  const options = readOptions();
  state.visibleMatches = 250;
  state.cancelRequested = false;
  state.analysisId = null;
  setRunning(true);
  elements.progressStage.textContent = '正在启动分析';
  elements.progressPercent.textContent = '0%';
  elements.progressFill.style.width = '0%';
  elements.results.classList.add('hidden');

  try {
    const response = await window.bidAudit.runAnalysis({
      leftPaths: state.left.map((file) => file.path),
      rightPaths: state.right.map((file) => file.path),
      options
    });
    state.analysisId = response.analysisId;
    state.result = response.result;
    renderResult();
    showToast('比对完成');
  } catch (error) {
    if (!state.cancelRequested) {
      showToast(error.message || String(error), true);
    }
  } finally {
    setRunning(false);
    state.analysisId = null;
  }
}

function renderResult() {
  const { summary, generatedAt } = state.result;
  document.querySelector('#leftRate').textContent = formatRate(summary.leftRate);
  document.querySelector('#rightRate').textContent = formatRate(summary.rightRate);
  document.querySelector('#leftCoverage').textContent = `${formatNumber(summary.leftMatchedCharacters)} / ${formatNumber(summary.leftCharacters)} 字`;
  document.querySelector('#rightCoverage').textContent = `${formatNumber(summary.rightMatchedCharacters)} / ${formatNumber(summary.rightCharacters)} 字`;
  document.querySelector('#matchCount').textContent = formatNumber(summary.uniqueMatches);
  document.querySelector('#thresholdLabel').textContent = `连续不少于 ${summary.minLength} 字`;
  document.querySelector('#resultMeta').textContent = `${new Date(generatedAt).toLocaleString('zh-CN')} · 空白已${state.result.options.ignoreWhitespace ? '忽略' : '保留'} · 标点已${state.result.options.ignorePunctuation ? '忽略' : '保留'}`;
  renderMatches();
  renderFileStats();
  elements.results.classList.remove('hidden');
  elements.results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function filteredMatches() {
  if (!state.result) return [];
  const query = elements.matchSearch.value.trim().toLowerCase();
  if (!query) return state.result.matches;
  return state.result.matches.filter((match) => [
    match.text, match.left.file, match.right.file
  ].some((value) => value.toLowerCase().includes(query)));
}

function renderMatches() {
  const matches = filteredMatches();
  const visible = matches.slice(0, state.visibleMatches);
  elements.matchVisibleCount.textContent = `显示 ${formatNumber(visible.length)} / ${formatNumber(matches.length)} 条`;
  elements.loadMore.classList.toggle('hidden', visible.length >= matches.length);

  if (visible.length === 0) {
    elements.matchRows.innerHTML = '<tr><td class="empty-row" colspan="5">没有符合当前条件的完全相同文本</td></tr>';
    return;
  }

  elements.matchRows.innerHTML = visible.map((match) => `
    <tr>
      <td>${formatNumber(match.length)}</td>
      <td class="match-text">${escapeHtml(match.text)}</td>
      <td><span class="location">${escapeHtml(match.left.file)}<small>第 ${match.left.paragraph} 段</small></span></td>
      <td><span class="location">${escapeHtml(match.right.file)}<small>第 ${match.right.paragraph} 段</small></span></td>
      <td>${formatNumber(match.occurrences)}</td>
    </tr>
  `).join('');
}

function renderFileStats() {
  const sideSection = (title, files) => `
    <section class="stat-section">
      <h3>${title}</h3>
      ${files.map((file) => `
        <div class="stat-row" title="${escapeHtml(file.path)}">
          <strong>${escapeHtml(file.name)}</strong><span>${formatRate(file.rate)}</span>
          <small>${formatNumber(file.matchedCharacters)} / ${formatNumber(file.totalCharacters)} 字</small>
        </div>
      `).join('')}
    </section>`;
  elements.fileStats.innerHTML = sideSection('A侧文件', state.result.files.left) + sideSection('B侧文件', state.result.files.right);
}

function toCsv(result) {
  const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const rows = [['长度', '完全相同文本', '出现组合', 'A侧文件', 'A侧段落', 'B侧文件', 'B侧段落']];
  for (const match of result.matches) {
    rows.push([match.length, match.text, match.occurrences, match.left.file, match.left.paragraph, match.right.file, match.right.paragraph]);
  }
  return `\uFEFF${rows.map((row) => row.map(quote).join(',')).join('\r\n')}`;
}

function toHtml(result) {
  const rows = result.matches.map((match) => `<tr><td>${match.length}</td><td>${escapeHtml(match.text)}</td><td>${escapeHtml(match.left.file)} / 第${match.left.paragraph}段</td><td>${escapeHtml(match.right.file)} / 第${match.right.paragraph}段</td><td>${match.occurrences}</td></tr>`).join('');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>文本重复片段检索报告</title><style>body{font-family:"Microsoft YaHei",sans-serif;color:#18211e;margin:32px}h1{font-size:24px}section{display:flex;gap:20px;margin:24px 0}.metric{border-left:4px solid #0f766e;padding:10px 18px;background:#f1f6f4}.metric strong{display:block;font-size:24px;color:#0f766e}table{width:100%;border-collapse:collapse}th,td{padding:8px;border:1px solid #ccd6d2;text-align:left;vertical-align:top}th{background:#edf2f0}</style><h1>文本重复片段检索报告</h1><p>最小片段：${result.summary.minLength}字；生成时间：${escapeHtml(result.generatedAt)}</p><section><div class="metric">A侧覆盖率<strong>${formatRate(result.summary.leftRate)}</strong></div><div class="metric">B侧覆盖率<strong>${formatRate(result.summary.rightRate)}</strong></div><div class="metric">独立匹配文本<strong>${formatNumber(result.summary.uniqueMatches)}</strong></div></section><table><thead><tr><th>长度</th><th>完全相同文本</th><th>A侧位置</th><th>B侧位置</th><th>出现组合</th></tr></thead><tbody>${rows}</tbody></table></html>`;
}

async function exportResult(format) {
  if (!state.result) return;
  const content = format === 'csv' ? toCsv(state.result) : format === 'html' ? toHtml(state.result) : JSON.stringify(state.result, null, 2);
  try {
    const saved = await window.bidAudit.saveExport({ format, content });
    if (saved) showToast(`已导出：${saved}`);
  } catch (error) {
    showToast(error.message || String(error), true);
  }
}

document.querySelectorAll('.source-pane').forEach((pane) => {
  const side = pane.dataset.side;
  pane.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'add-files') addFiles(side, false);
    if (action === 'add-folder') addFiles(side, true);
    if (action === 'clear') {
      state[side] = [];
      markInputsChanged();
      renderFiles(side);
      updateRunButton();
    }
    const removePath = event.target.closest('[data-remove]')?.dataset.remove;
    if (removePath) {
      state[side] = state[side].filter((file) => file.path !== removePath);
      markInputsChanged();
      renderFiles(side);
      updateRunButton();
    }
  });

  const dropzone = pane.querySelector('.dropzone');
  for (const eventName of ['dragenter', 'dragover']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.add('dragging'); });
  }
  for (const eventName of ['dragleave', 'drop']) {
    dropzone.addEventListener(eventName, (event) => { event.preventDefault(); dropzone.classList.remove('dragging'); });
  }
  dropzone.addEventListener('drop', async (event) => {
    try {
      const paths = [...event.dataTransfer.files].map((file) => window.bidAudit.getPathForFile(file)).filter(Boolean);
      mergeFiles(side, await window.bidAudit.resolvePaths(paths));
    } catch (error) {
      showToast(error.message || String(error), true);
    }
  });
});

elements.exclusionToggle.addEventListener('click', () => elements.exclusionPanel.classList.toggle('hidden'));
elements.minLength.addEventListener('change', () => { readOptions(); markInputsChanged(); });
for (const element of [elements.ignoreWhitespace, elements.ignorePunctuation, elements.excludeHeadings, elements.exclusionTerms]) {
  element.addEventListener('change', markInputsChanged);
}
elements.runButton.addEventListener('click', runAnalysis);
elements.cancelButton.addEventListener('click', async () => {
  state.cancelRequested = true;
  if (state.analysisId) await window.bidAudit.cancelAnalysis(state.analysisId);
  setRunning(false);
  showToast('已停止比对');
});
elements.matchSearch.addEventListener('input', () => { state.visibleMatches = 250; renderMatches(); });
elements.loadMore.addEventListener('click', () => { state.visibleMatches += 250; renderMatches(); });

document.querySelectorAll('[data-tab]').forEach((button) => {
  button.addEventListener('click', () => {
    state.activeTab = button.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach((tab) => tab.classList.toggle('active', tab === button));
    for (const name of ['matches', 'files', 'method']) {
      document.querySelector(`#${name}Panel`).classList.toggle('hidden', name !== state.activeTab);
    }
  });
});

document.querySelectorAll('[data-export]').forEach((button) => button.addEventListener('click', () => exportResult(button.dataset.export)));

window.bidAudit.onProgress((progress) => {
  state.analysisId = progress.analysisId;
  const percent = Math.min(100, Math.max(0, progress.percent || 0));
  elements.progressStage.textContent = progress.stage;
  elements.progressPercent.textContent = `${percent}%`;
  elements.progressFill.style.width = `${percent}%`;
});

hydrateIcons();
renderFiles('left');
renderFiles('right');
updateRunButton();
