# 文本重复片段检索

离线比较两组文本文件中的连续完全相同片段，适用于标书、报告、合同、论文及其他长文本审核。最小片段长度由使用者设置，程序前端和匹配引擎都会强制限制为不少于 6 个字符。

## 下载

不想和 Node.js、Electron 打交道？直接前往 [Releases](https://github.com/arron-oss/Text_Duplicate_Finder/releases/latest)。普通用户请下载并运行 `Text-Duplicate-Finder-Setup-0.1.0-x64.exe`，这是带安装向导的 Windows 安装版。

不想安装时，再下载 `Text-Duplicate-Finder-Portable-0.1.0-x64.zip`，解压后运行其中的 `Text Duplicate Finder.exe`。`SHA256SUMS.txt` 只是校验文件，不是程序。

本项目是个人维护的小工具，文件全程留在本机，不上传、不排队，也不偷偷围观你的文档。

## 支持范围

- Word `.doc`、`.docx`
- 纯文本 `.txt`、Markdown `.md`
- 单次添加多个文件或递归添加章节文件夹
- 忽略空白、忽略标点、排除章节标题、自定义排除词条
- 分别计算 A、B 两侧覆盖率
- 导出 CSV、JSON、HTML
- 全程离线，不上传文件

图片中的文字不会自动 OCR。加密、损坏或由特殊编辑器生成的 Word 文件可能无法提取。

## 计算口径

程序先按最小片段长度建立连续字符索引，再查找两侧共同片段。所有候选文本均按字面值精确比较，不把 `.`、`(`、`[` 等字符解释为正则操作符。相比逐条构造正则表达式，这一实现更适合处理数百页 Word 文档，统计口径仍然是连续完全相同文本。

覆盖率使用字符区间合并计算。一个较长句子中可能包含多个短片段，但同一个字符最多计入一次，因此不会通过简单累加嵌套片段夸大重复率。

匹配限定在同一段落内部，不跨段落拼接。启用“忽略标点”后，标点从匹配文本和统计分母中移除。

## 本地开发

要求 Node.js 24 或当前 Electron 支持的 LTS 版本。

```powershell
npm install
npm test
npm start
```

## Windows 打包

生成安装程序和免安装版本：

```powershell
npm run dist
```

输出文件位于 `release` 目录。

只生成未安装的应用目录：

```powershell
npm run pack
```

如果当前网络无法下载 Electron Builder 的辅助二进制，可使用不依赖签名工具的本地组装命令：

```powershell
npm run pack:local
```

该命令生成可直接运行的 `win-unpacked-*` 目录和 ZIP，不生成安装向导。

## GitHub 维护

仓库包含 `.github/workflows/build.yml`。推送到 `main`、提交 Pull Request 或手动触发工作流时，会在 Windows 环境执行测试和打包，并上传构建产物。

发布前建议修改 `package.json` 中的版本号，并为正式版本补充公司名称、应用图标和代码签名证书。未签名的 Windows 安装程序可能触发 SmartScreen 提示。

## 项目结构

```text
src/main.js                 Electron 主进程与文件对话框
src/preload.js              受限渲染进程接口
src/analysis/extract.js     Word 和文本提取
src/analysis/normalize.js   空白、标点、标题和词条处理
src/analysis/matcher.js     精确匹配与覆盖率计算
src/analysis/worker.js      后台分析线程
src/renderer/               桌面界面
test/                       Node 自动化测试
```

## 许可证

MIT
