(() => {
  "use strict";

  const paperData = window.DSE_SITE_DATA;
  const textbookData = window.DSE_TEXTBOOK_DATA;
  const knowledgeNetwork = {
    ...(window.DSE_KNOWLEDGE_NETWORK || {}),
    ...(window.DSE_PAPER2_KNOWLEDGE || {}),
  };
  const statistics = window.DSE_STATISTICS || {};
  const MISTAKE_STORAGE_KEY = "dse-physics-mistakes-v1";
  const THEME_STORAGE_KEY = "dse-physics-theme-v1";
  const elementCache = new Map();
  const element = (id) => {
    if (!elementCache.has(id)) elementCache.set(id, document.getElementById(id));
    return elementCache.get(id);
  };
  const escapeHtml = (value) => String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

  const superscriptDigits = {
    "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
    "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  };
  const subscriptCharacters = {
    "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
    "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
    "₊": "+", "₋": "−", "₌": "=", "₍": "(", "₎": ")",
    "ₐ": "a", "ₑ": "e", "ₕ": "h", "ᵢ": "i", "ⱼ": "j",
    "ₖ": "k", "ₗ": "l", "ₘ": "m", "ₙ": "n", "ₒ": "o",
    "ₚ": "p", "ᵣ": "r", "ₛ": "s", "ₜ": "t", "ᵤ": "u",
    "ᵥ": "v", "ₓ": "x",
  };

  function normalizeScientificExponents(value) {
    return String(value)
      .replace(/⁻(\d{1,3})/g, (_, digits) => `⁻${[...digits].map((digit) => superscriptDigits[digit]).join("")}`)
      .replace(/([A-Za-z])(?:–|−)-(\d)/g, (_, symbol, digit) => `${symbol}⁻${superscriptDigits[digit]}`);
  }

  function mathMarkup(value) {
    return escapeHtml(normalizeScientificExponents(value))
      .replace(/([₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+)⁄([₀₁₂₃₄₅₆₇₈₉]+)/g, (_, numerator, denominator) => `<sub>${[...numerator].map((character) => subscriptCharacters[character]).join("")}/${[...denominator].map((character) => subscriptCharacters[character]).join("")}</sub>`)
      .replace(/[₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ]+/g, (characters) => `<sub>${[...characters].map((character) => subscriptCharacters[character]).join("")}</sub>`)
      .replace(/_\{([^{}]+)\}/g, "<sub>$1</sub>")
      .replace(/_([A-Za-z0-9]+|½)/g, "<sub>$1</sub>")
      .replace(/\^\(([^()]+)\)/g, "<sup>$1</sup>")
      .replace(/\^([+\-−]?\d+)/g, "<sup>$1</sup>");
  }

  function noteMarkup(value) {
    const note = String(value).trim();
    const separator = note.match(/^([^:：]{1,32})([:：])(.*)$/s);
    if (!separator) return `<span class="formula-condition">${mathMarkup(note)}</span>`;
    return `<span class="formula-symbol">${mathMarkup(separator[1])}</span><span class="formula-definition">${mathMarkup(separator[3].trim())}</span>`;
  }

  function formulaMarkup(point) {
    const formulaLines = String(point.formula || "").split("\n").map((line) => line.trim()).filter(Boolean);
    const notes = String(point.formula_notes || "").split(/;\s*/).map((note) => note.trim()).filter(Boolean);
    return `<section class="formula-block" aria-label="${escapeHtml(categoryLabel(point))}">
      <div class="formula-expression">${formulaLines.map((line) => `<div>${mathMarkup(line)}</div>`).join("")}</div>
      ${notes.length ? `<div class="formula-notes">${notes.map((note) => `<div class="formula-note">${noteMarkup(note)}</div>`).join("")}</div>` : ""}
    </section>`;
  }

  function joinWrappedContent(left, right) {
    if (/[A-Za-z]-$/.test(left) && /^[a-z]/.test(right)) return `${left.slice(0, -1)}${right}`;
    const joinsCjk = /[\u3400-\u9fff]$/.test(left) && /^[\u3400-\u9fff]/.test(right);
    return `${left}${joinsCjk ? "" : " "}${right}`;
  }

  function contentBlocks(value) {
    const lines = String(value || "").split("\n").map((line) => line.trim());
    const blocks = [];
    let paragraph = "";
    let list = null;
    const flushParagraph = () => {
      if (paragraph) blocks.push({ type: "paragraph", text: paragraph });
      paragraph = "";
    };
    const flushList = () => {
      if (list?.items.length) blocks.push(list);
      list = null;
    };

    for (const line of lines) {
      if (!line) {
        flushParagraph();
        flushList();
        continue;
      }
      const bullet = line.match(/^[•●▪]\s*(.+)$/);
      const numbered = line.match(/^(\d+)[.)]?\s+(.+)$/);
      if (bullet || numbered) {
        flushParagraph();
        const type = bullet ? "unordered" : "ordered";
        if (list && list.type !== type) flushList();
        if (!list) list = { type, items: [] };
        list.items.push((bullet || numbered)[bullet ? 1 : 2]);
        continue;
      }
      if (list) {
        const lastIndex = list.items.length - 1;
        list.items[lastIndex] = joinWrappedContent(list.items[lastIndex], line);
      } else {
        paragraph = paragraph ? joinWrappedContent(paragraph, line) : line;
      }
    }
    flushParagraph();
    flushList();
    return blocks;
  }

  function regularContentMarkup(point) {
    const lines = String(point.content).split("\n");
    if (point.category_code === "3" && lines.length > 1) {
      const noteStart = lines.findIndex((line, index) => index > 0 && /^[^:：]{1,32}[:：]/.test(line.trim()));
      if (noteStart > 0) {
        const formula = lines.slice(0, noteStart).filter((line) => line.trim());
        const notes = lines.slice(noteStart).join(" ").split(/[；;]\s*/).filter((note) => note.trim());
        return `<section class="formula-block" aria-label="${escapeHtml(categoryLabel(point))}">
          <div class="formula-expression">${formula.map((line) => `<div>${mathMarkup(line)}</div>`).join("")}</div>
          <div class="formula-notes">${notes.map((note) => `<div class="formula-note">${noteMarkup(note)}</div>`).join("")}</div>
        </section>`;
      }
    }
    return contentBlocks(point.content).map((block) => {
      if (block.type === "paragraph") return `<p>${mathMarkup(block.text)}</p>`;
      const tag = block.type === "ordered" ? "ol" : "ul";
      return `<${tag} class="knowledge-prose-list">${block.items.map((item) => `<li>${mathMarkup(item)}</li>`).join("")}</${tag}>`;
    }).join("");
  }

  function knowledgeContentMarkup(point) {
    return point.formula && point.display_mode !== "prose" ? formulaMarkup(point) : regularContentMarkup(point);
  }

  function copyTextForPoint(point) {
    return point.formula && point.display_mode !== "prose"
      ? [point.formula, point.formula_notes].filter(Boolean).join("\n")
      : point.content;
  }

  function loadMistakes() {
    try {
      const value = JSON.parse(window.localStorage.getItem(MISTAKE_STORAGE_KEY) || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }

  function saveMistakes() {
    try {
      window.localStorage.setItem(MISTAKE_STORAGE_KEY, JSON.stringify(mistakes));
    } catch {
      // The site still works for the current page if browser storage is disabled.
    }
  }

  let mistakes = loadMistakes();
  let mistakeEntriesCache = null;

  function initialTheme() {
    const current = document.documentElement.dataset.theme;
    return current === "dark" ? "dark" : "light";
  }

  const state = {
    library: "home",
    theme: initialTheme(),
    language: "eng",
    year: 0,
    paper: 0,
    question: 0,
    paper2Section: 1,
    book: 0,
    textbookDirectory: true,
    chapter: "all",
    query: "",
    paperQuery: "",
    paperSearchYear: "all",
    homeKnowledgeQuery: "",
    mistakeView: "questions",
  };

  const copy = {
    eng: {
      heroHome: "DSE Physics",
      subHome: "A focused directory for past papers, textbook knowledge and mistakes.",
      heroPapers: "Past-paper study desk",
      subPapers: "Original questions and official answers, organised by year, paper and question.",
      heroTextbook: "Textbook core knowledge",
      subTextbook: "All 365 yellow-box points from nine books, with formulas, symbols and conditions kept together.",
      collectionPapers: "English papers",
      collectionTextbook: "English textbook knowledge",
      question: "Question",
      answer: "Answer / Marking scheme",
      showAnswer: "Show answer",
      hideAnswer: "Hide answer",
      year: "YEAR",
      paper: "PAPER",
      sectionNav: "PAPER 2 SECTION",
      questionNav: "QUESTION / PAGE",
      books: "9 BOOKS",
      chapters: "CHAPTERS",
      allPoints: "All 365 points",
      allChapters: "All chapters",
      points: "points",
      chaptersWord: "chapters",
      searchPlaceholder: "Search all 365 knowledge points",
      clear: "Clear",
      noResults: "No knowledge point matches this search.",
      searchResults: "Search results",
      copy: "Copy",
      copied: "Copied",
      homeHeading: "Study library",
      homeDescription: "Choose one library. Everything else stays out of the way.",
      homePaperTitle: "Past papers",
      homePaperNote: "Original questions · official answers · related knowledge",
      homeKnowledgeTitle: "Knowledge base",
      homeKnowledgeNote: "Compulsory 1–5 · Elective 1–4",
      homeMistakeTitle: "Mistake book",
      homeMistakeNote: "Marked questions and weak areas",
      browsePapers: "Browse all past papers",
      browseKnowledge: "Browse all knowledge points",
      textbookDirectoryTitle: "Choose a textbook",
      textbookDirectoryNote: "Five compulsory books and four elective books.",
      backToBooks: "← All textbooks",
      allYears: "All years",
      findQuestion: "Find a question",
      findQuestionNote: "Search by year, question number, chapter or concept",
      paperQueryPlaceholder: "e.g. 2021 momentum Q12",
      noPaperResults: "No past-paper question matches this search.",
      related: "Related textbook knowledge",
      questionsForPoint: "Linked past-paper questions",
      noLinkedQuestions: "No related past-paper question.",
    },
    chn: {
      heroHome: "DSE 物理",
      subHome: "真题、课本知识与错题的简洁学习目录。",
      heroPapers: "DSE 物理真题库",
      subPapers: "按年份、试卷和题号整理的原题与官方评分参考。",
      heroTextbook: "课本黄色框知识库",
      subTextbook: "九册共 365 个核心知识点，中英文平行整理，公式、符号、单位和条件保持在同一知识卡。",
      collectionPapers: "中文试卷",
      collectionTextbook: "中文课本知识",
      question: "题目",
      answer: "答案／评分参考",
      showAnswer: "显示答案",
      hideAnswer: "收起答案",
      year: "年份",
      paper: "试卷",
      sectionNav: "卷二分卷",
      questionNav: "题号／页码",
      books: "9 册课本",
      chapters: "分章",
      allPoints: "全部 365 点",
      allChapters: "本册全部",
      points: "个知识点",
      chaptersWord: "章",
      searchPlaceholder: "搜索全部 365 个知识点",
      clear: "清除",
      noResults: "没有找到匹配的知识点。",
      searchResults: "搜索结果",
      copy: "复制",
      copied: "已复制",
      homeHeading: "学习资料目录",
      homeDescription: "选择一个资料库进入，其余信息保持安静。",
      homePaperTitle: "真题库",
      homePaperNote: "原题 · 官方答案 · 相关知识",
      homeKnowledgeTitle: "课本知识库",
      homeKnowledgeNote: "必修 1–5 · 选修 1–4",
      homeMistakeTitle: "错题库",
      homeMistakeNote: "个人错题、薄弱章节与练习建议",
      browsePapers: "浏览全部真题",
      browseKnowledge: "浏览全部知识点",
      textbookDirectoryTitle: "选择课本",
      textbookDirectoryNote: "必修第一至五册，选修第一至四册。",
      backToBooks: "← 返回课本目录",
      allYears: "全部年份",
      findQuestion: "快速查找真题",
      findQuestionNote: "按年份、题号、章节或概念搜索",
      paperQueryPlaceholder: "例如：2021 动量 Q12",
      noPaperResults: "没有找到匹配的真题。",
      related: "关联课本知识点",
      questionsForPoint: "关联真题",
      noLinkedQuestions: "暂无关联真题。",
    },
  };

  const mistakeCopy = {
    eng: {
      hero: "My mistake book",
      sub: "Original questions, knowledge points and weak chapters.",
      mark: "Mark as mistake",
      marked: "In mistake book",
      remove: "Remove",
      heading: "Marked questions",
      description: "Review each original question and focus on your three weakest chapters.",
      browse: "Browse past papers",
      wrongQuestions: "Wrong questions",
      knowledgePoints: "Knowledge points involved",
      weakestChapter: "Weakest chapters",
      weakChapterKicker: "WEAK CHAPTERS",
      weakChapterTitle: "Mistakes by chapter",
      weakPointKicker: "WEAK KNOWLEDGE",
      weakPointTitle: "Most repeated knowledge points",
      recommendationKicker: "PRACTICE PLAN",
      recommendationTitle: "Recommended next steps",
      listKicker: "ORIGINAL QUESTIONS",
      listTitle: "Marked questions",
      questionsTab: "Original questions",
      analysisTab: "Mistake statistics",
      reportKicker: "MISTAKE ANALYSIS",
      reportTitle: "Detailed mistake report",
      reportNote: "See your weak chapters and knowledge points.",
      reportEmpty: "Mark questions as mistakes to generate your personal analysis.",
      chapterReportKicker: "WEAK CHAPTERS",
      chapterReportTitle: "Mistakes by chapter",
      pointReportKicker: "WRONG KNOWLEDGE POINTS",
      pointReportTitle: "Knowledge points in your mistakes",
      affectedQuestions: "Marked questions",
      shown: "questions shown",
      empty: "No questions have been marked yet. Open a past-paper question and select ‘Mark as mistake’.",
      noSearch: "No marked question matches this search.",
      open: "Open question",
      times: "wrong questions",
      downloadPdf: "Download PDF",
      pdfOrder: "Compulsory 1-5 · Elective 1-4",
      pdfBuilding: "Building PDF: {current}/{total}",
      pdfPrintFallback: "The print dialog is ready. Choose ‘Save as PDF’ to download the file.",
      pdfFailed: "The PDF could not be prepared. Please try again.",
    },
    chn: {
      hero: "我的错题库",
      sub: "集中查看错题原题、知识点与薄弱章节。",
      mark: "标记为错题",
      marked: "已加入错题库",
      remove: "移除",
      heading: "错题库",
      description: "直接查看每道错题的原题，并集中复习三个最薄弱章节。",
      browse: "浏览真题库",
      wrongQuestions: "错题总数",
      knowledgePoints: "涉及知识点",
      weakestChapter: "三个最薄弱章节",
      weakChapterKicker: "薄弱章节",
      weakChapterTitle: "各章节错题数量",
      weakPointKicker: "薄弱知识点",
      weakPointTitle: "重复出现最多的知识点",
      recommendationKicker: "练习计划",
      recommendationTitle: "下一步练习建议",
      listKicker: "错题原题",
      listTitle: "已标记的题目",
      questionsTab: "错题原题",
      analysisTab: "错题统计数据",
      reportKicker: "错题分析",
      reportTitle: "详细错题分析报告",
      reportNote: "查看你的薄弱章节与错题知识点。",
      reportEmpty: "标记错题后，这里会生成你的个人错题分析。",
      chapterReportKicker: "薄弱章节",
      chapterReportTitle: "各章节错题数量",
      pointReportKicker: "错题知识点",
      pointReportTitle: "错题涉及的知识点",
      affectedQuestions: "相关错题",
      shown: "道错题",
      empty: "目前还没有标记错题。请打开一道真题并点击“标记为错题”。",
      noSearch: "没有符合搜索条件的错题。",
      open: "打开题目",
      times: "道错题",
      downloadPdf: "下载错题 PDF",
      pdfOrder: "必修 1-5 · 选修 1-4",
      pdfBuilding: "正在生成 PDF：{current}/{total}",
      pdfPrintFallback: "已打开打印窗口，请选择“另存为 PDF”下载文件。",
      pdfFailed: "暂时无法生成 PDF，请重试。",
    },
  };

  const mistakePdfBookKeys = [
    "compulsory-1", "compulsory-2", "compulsory-3", "compulsory-4", "compulsory-5",
    "elective-1", "elective-2", "elective-3", "elective-4",
  ];

  const bookOrder = {
    eng: [
      "Compulsory Book 1", "Compulsory Book 2", "Compulsory Book 3",
      "Compulsory Book 4", "Compulsory Book 5", "Elective Book 1",
      "Elective Book 2", "Elective Book 3", "Elective Book 4",
    ],
    chn: [
      "必修第一冊", "必修第二冊", "必修第三冊", "必修第四冊", "必修第五冊",
      "選修第一冊", "選修第二冊", "選修第三冊", "選修第四冊",
    ],
  };

  const yearsByLanguage = Object.fromEntries(
    ["eng", "chn"].map((language) => [
      language,
      (paperData?.years || [])
        .filter((year) => year.language === language)
        .sort((a, b) => Number(a.year) - Number(b.year)),
    ])
  );
  const pointsByLanguage = textbookData?.languages || { eng: [], chn: [] };
  const pointByLanguageAndSequence = Object.fromEntries(
    Object.entries(pointsByLanguage).map(([language, points]) => [
      language,
      new Map(points.map((point) => [Number(point.sequence), point])),
    ])
  );
  const booksByLanguage = Object.fromEntries(
    Object.entries(bookOrder).map(([language, names]) => [
      language,
      names.map((name) => ({
        name,
        points: (pointsByLanguage[language] || []).filter((point) => point.book === name),
      })),
    ])
  );
  const chaptersByBook = new WeakMap();

  function questionNumber(question, fallbackIndex) {
    return Number(String(question.label).replace(/\D/g, "")) || fallbackIndex + 1;
  }

  function questionIdentity(question, fallbackIndex) {
    return String(question.id || questionNumber(question, fallbackIndex));
  }

  function knowledgeQuestionNumber(question, fallbackIndex) {
    return Number(question.knowledgeQuestion) || questionNumber(question, fallbackIndex);
  }

  function paper2SectionNumber(question, fallbackIndex = 0) {
    return Number(question?.section)
      || Number(String(question?.id || "").split(".")[0])
      || Math.floor(fallbackIndex / 9) + 1;
  }

  function knowledgeNetworkForQuestion(year, paperIndex, question, fallbackIndex) {
    const individual = knowledgeNetwork[networkKey(year, paperIndex, questionIdentity(question, fallbackIndex))];
    if (individual) return individual;
    return knowledgeNetwork[networkKey(year, paperIndex, knowledgeQuestionNumber(question, fallbackIndex))];
  }

  const paperEntriesByLanguage = Object.fromEntries(
    Object.entries(yearsByLanguage).map(([language, years]) => {
      const entries = [];
      years.forEach((year, yearIndex) => {
        year.papers.slice(0, 3).forEach((paper, paperIndex) => {
          paper.questions.forEach((question, questionIndex) => {
            const number = knowledgeQuestionNumber(question, questionIndex);
            const network = knowledgeNetworkForQuestion(year.year, paperIndex, question, questionIndex);
            if (!network) return;
            const key = networkKey(year.year, paperIndex, questionIdentity(question, questionIndex));
            const primary = network.links.find((link) => link.type === "primary") || network.links[0];
            entries.push({
              year, yearIndex, paper, paperIndex, question, questionIndex,
              key,
              questionNumber: number,
              network,
              chapter: primary ? (language === "eng" ? primary.chapterEn : primary.chapterZh) : "",
            });
          });
        });
      });
      return [language, entries];
    })
  );
  const paperEntryByLanguageAndKey = Object.fromEntries(
    Object.entries(paperEntriesByLanguage).map(([language, entries]) => [
      language,
      new Map(entries.map((entry) => [
        entry.key,
        entry,
      ])),
    ])
  );

  function currentCopy() {
    return copy[state.language];
  }

  function currentMistakeCopy() {
    return mistakeCopy[state.language];
  }

  function visibleYears() {
    return yearsByLanguage[state.language];
  }

  function currentPaper() {
    const years = visibleYears();
    const year = years[Math.min(state.year, years.length - 1)];
    const paper = year.papers[Math.min(state.paper, year.papers.length - 1)];
    const question = paper.questions[Math.min(state.question, paper.questions.length - 1)];
    return { years, year, paper, question };
  }

  function paperIdAt(index) {
    return ["paper-1a", "paper-1b", "paper-2"][index] || null;
  }

  function networkKey(year, paperIndex, questionNumber) {
    const paperId = paperIdAt(paperIndex);
    return paperId ? `${year}|${paperId}|${questionNumber}` : "";
  }

  function bookToneClass(bookKey) {
    return /^((compulsory|elective)-[1-5])$/.test(String(bookKey || ""))
      ? `book-${bookKey}`
      : "book-elective-1";
  }

  function categoryLabel(point) {
    return state.language === "eng" ? point.category_en : point.category;
  }

  function paperSearchEntries() {
    return paperEntriesByLanguage[state.language];
  }

  function matchingPaperEntries(yearValue, query, limit = 12) {
    const normalized = searchable(query);
    const terms = normalized.split(" ").filter(Boolean);
    let entries = paperSearchEntries().filter((entry) => {
      if (yearValue !== "all" && String(entry.year.year) !== String(yearValue)) return false;
      const haystack = searchable([
        entry.year.year, entry.paper.title, entry.question.label,
        entry.network.keywords, entry.chapter,
      ].join(" "));
      return terms.every((term) => haystack.includes(term));
    });
    if (!terms.length && yearValue === "all") entries = entries.slice(-3).reverse();
    return entries.slice(0, limit);
  }

  function paperResultMarkup(entry, className = "paper-search-result") {
    return `<button type="button" class="${className}" data-year-index="${entry.yearIndex}" data-paper-index="${entry.paperIndex}" data-question-index="${entry.questionIndex}">
      <span>${escapeHtml(`${entry.year.year} · ${paperTitle(entry.paper, entry.paperIndex)} · ${entry.question.label}`)}</span>
      <small>${escapeHtml(entry.chapter)}</small>
    </button>`;
  }

  function openPaperEntry(button) {
    state.year = Number(button.dataset.yearIndex);
    state.paper = Number(button.dataset.paperIndex);
    state.question = Number(button.dataset.questionIndex);
    const paper = visibleYears()[state.year]?.papers[state.paper];
    if (state.paper === 2 && paper) state.paper2Section = paper2SectionNumber(paper.questions[state.question], state.question);
    state.library = "papers";
    updateTopLevel();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const questionsByKnowledge = new Map();
  Object.values(paperEntriesByLanguage).flat().forEach((entry) => {
    (entry.network.links || []).forEach((link) => {
      if (!questionsByKnowledge.has(link.sequence)) questionsByKnowledge.set(link.sequence, []);
      if (!questionsByKnowledge.get(link.sequence).includes(entry.key)) {
        questionsByKnowledge.get(link.sequence).push(entry.key);
      }
    });
  });

  function questionKeyLabel(key) {
    const [year, paperId, question] = key.split("|");
    const paper = paperId === "paper-1a" ? "1A" : (paperId === "paper-1b" ? "1B" : "P2");
    return `${year} · ${paper} · Q${question}`;
  }

  const statisticsPointBySequence = new Map(
    (statistics.points || []).map((point) => [Number(point.sequence), point])
  );

  function currentQuestionKey() {
    const { year, question } = currentPaper();
    const key = networkKey(year.year, state.paper, questionIdentity(question, state.question));
    return paperEntryForKey(key) ? key : "";
  }

  function paperEntryForKey(key) {
    return paperEntryByLanguageAndKey[state.language].get(key);
  }

  function setMistake(key, marked) {
    if (!key || !paperEntryForKey(key)) return;
    if (marked) mistakes[key] = { markedAt: new Date().toISOString() };
    else delete mistakes[key];
    mistakeEntriesCache = null;
    saveMistakes();
  }

  function openQuestionKey(key) {
    const entry = paperEntryForKey(key);
    if (!entry) return;
    state.year = entry.yearIndex;
    state.paper = entry.paperIndex;
    state.question = entry.questionIndex;
    if (state.paper === 2) state.paper2Section = paper2SectionNumber(entry.question, entry.questionIndex);
    state.library = "papers";
    updateTopLevel();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function questionLinksMarkup(sequence) {
    const keys = questionsByKnowledge.get(Number(sequence)) || [];
    if (!keys.length) return `<p class="no-point-questions">${escapeHtml(currentCopy().noLinkedQuestions)}</p>`;
    return `<div class="point-question-links">${keys.map((key) => `
      <button type="button" data-question-key="${escapeHtml(key)}">${escapeHtml(questionKeyLabel(key))}</button>
    `).join("")}</div>`;
  }

  function goToKnowledge(sequence) {
    const books = booksWithPoints();
    const bookIndex = books.findIndex((book) => book.points.some((point) => point.sequence === sequence));
    const point = pointByLanguageAndSequence[state.language].get(Number(sequence));
    if (bookIndex < 0 || !point) return;
    state.library = "textbook";
    state.textbookDirectory = false;
    state.book = bookIndex;
    state.chapter = point.code;
    state.query = "";
    element("textbook-search").value = "";
    updateTopLevel();
    window.setTimeout(() => element(`point-${sequence}`)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  function imageUrl(yearId, imagePath) {
    return `assets/${yearId}/${imagePath}`;
  }

  function imageMarkup(yearId, paths, context, eagerFirst = true) {
    if (!paths || paths.length === 0) return "";
    return paths.map((imagePath, index) => (
      `<img class="scan" src="${imageUrl(yearId, imagePath)}" ` +
      `alt="${escapeHtml(context)} scan ${index + 1}" loading="${eagerFirst && index === 0 ? "eager" : "lazy"}" decoding="async">`
    )).join("");
  }

  function navButtons(items, activeIndex, label, className = "") {
    return items.map((item, index) => {
      const text = typeof label === "function" ? label(item, index) : item[label];
      return `<button type="button" class="nav-button ${className} ${index === activeIndex ? "active" : ""}" ` +
        `data-index="${index}">${escapeHtml(text)}</button>`;
    }).join("");
  }

  function paperTitle(paper, index) {
    if (state.language === "eng") return paper.title;
    const isReport = index > 2;
    if (isReport) return "考生表现报告";
    return ["卷一甲部", "卷一乙部", "卷二"][index] || `试卷 ${index + 1}`;
  }

  function paperDescription(paper, index) {
    const isReport = index > 2;
    if (!isReport && paper.description && index === 2) return paper.description;
    if (state.language === "eng") {
      if (isReport) return "Official report";
      return index === 0 ? `${paper.questions.length} questions` : `${paper.questions.length} question groups`;
    }
    if (isReport) return "考生表现报告";
    return index === 0 ? `${paper.questions.length} 道题目` : `${paper.questions.length} 组题目`;
  }

  function resetAnswer() {
    const panel = element("answer-panel");
    const button = element("answer-button");
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    button.querySelector("span").textContent = currentCopy().showAnswer;
  }

  function renderRelatedKnowledge(year, paper, question) {
    const labels = currentCopy();
    const network = knowledgeNetworkForQuestion(year.year, state.paper, question, state.question);
    const panel = element("related-knowledge");
    if (!network) {
      panel.hidden = true;
      return;
    }
    element("related-title").textContent = labels.related;
    if (!network.links?.length) {
      panel.hidden = true;
      return;
    }
    if (network.reviewStatus === "automatic_pending_review") {
      panel.hidden = true;
      return;
    }
    element("related-links").innerHTML = network.links.map((link) => {
      const chapter = state.language === "eng" ? link.chapterEn : link.chapterZh;
      return `<button type="button" class="knowledge-link ${bookToneClass(link.bookKey)} ${link.type === "supporting" ? "supporting" : ""}" data-sequence="${link.sequence}">
        #${String(link.sequence).padStart(3, "0")} · ${escapeHtml(link.code)} · ${escapeHtml(chapter)}
      </button>`;
    }).join("");
    panel.hidden = false;
  }

  function yearOptions(selected) {
    const labels = currentCopy();
    return `<option value="all">${labels.allYears}</option>` + visibleYears().map((year) =>
      `<option value="${year.year}" ${String(selected) === String(year.year) ? "selected" : ""}>${year.year}</option>`
    ).join("");
  }

  function renderPaperSearch() {
    const labels = currentCopy();
    element("paper-search-title").textContent = labels.findQuestion;
    element("paper-search-note").textContent = labels.findQuestionNote;
    element("paper-search-query").placeholder = labels.paperQueryPlaceholder;
    element("paper-search-year").innerHTML = yearOptions(state.paperSearchYear);
    element("paper-search-year").value = state.paperSearchYear;
    element("paper-search-query").value = state.paperQuery;
    element("paper-search-clear").textContent = labels.clear;
    element("paper-search-clear").hidden = !state.paperQuery && state.paperSearchYear === "all";
    const shouldShow = Boolean(state.paperQuery.trim());
    const results = shouldShow ? matchingPaperEntries(state.paperSearchYear, state.paperQuery, 9) : [];
    const resultPanel = element("paper-search-results");
    resultPanel.hidden = !shouldShow;
    resultPanel.innerHTML = shouldShow
      ? (results.length ? results.map((entry) => paperResultMarkup(entry)).join("") : `<div class="empty">${labels.noPaperResults}</div>`)
      : "";
  }

  function renderHome() {
    const labels = currentCopy();
    element("collection-status").textContent = state.language === "eng" ? "619 questions · 365 knowledge points" : "619 道真题 · 365 个知识点";
    element("home-heading").textContent = labels.homeHeading;
    element("home-description").textContent = labels.homeDescription;
    element("home-paper-title").textContent = labels.homePaperTitle;
    element("home-paper-note").textContent = labels.homePaperNote;
    element("home-knowledge-title").textContent = labels.homeKnowledgeTitle;
    element("home-knowledge-note").textContent = labels.homeKnowledgeNote;
    element("home-mistake-title").textContent = labels.homeMistakeTitle;
    element("home-mistake-note").textContent = labels.homeMistakeNote;
    element("home-mistake-count").textContent = mistakeEntries().length;
  }

  function renderPapers() {
    const labels = currentCopy();
    const { years, year, paper, question } = currentPaper();
    state.year = Math.min(state.year, years.length - 1);
    state.paper = Math.min(state.paper, year.papers.length - 1);
    state.question = Math.min(state.question, paper.questions.length - 1);

    element("collection-status").textContent = `${labels.collectionPapers} · ${years.length} years`;
    element("year-list").innerHTML = navButtons(years, state.year, "year");
    element("paper-list").innerHTML = navButtons(year.papers, state.paper, paperTitle);
    const isPaper2 = state.paper === 2 && Array.isArray(paper.sections);
    if (isPaper2) state.paper2Section = paper2SectionNumber(question, state.question);
    element("paper2-section-nav").hidden = !isPaper2;
    if (isPaper2) {
      element("paper2-section-list").innerHTML = paper.sections.map((section) => `
        <button type="button" class="nav-button section-nav-button ${Number(section.id) === state.paper2Section ? "active" : ""}" data-section="${section.id}">
          <strong>${escapeHtml(section.label)}</strong><small>${escapeHtml(section.title)}</small>
        </button>
      `).join("");
      element("question-list").innerHTML = indexedNavButtons(paper2QuestionIndices(paper), state.question, "label");
    } else {
      element("paper2-section-list").innerHTML = "";
      element("question-list").innerHTML = navButtons(paper.questions, state.question, "label");
    }
    document.querySelector('[data-paper-label="year"]').textContent = labels.year;
    document.querySelector('[data-paper-label="paper"]').textContent = labels.paper;
    document.querySelector('[data-paper-label="section"]').textContent = labels.sectionNav;
    document.querySelector('[data-paper-label="question"]').textContent = labels.questionNav;

    const title = paperTitle(paper, state.paper);
    const activeSection = isPaper2 ? paper.sections.find((section) => Number(section.id) === state.paper2Section) : null;
    element("breadcrumb").textContent = [
      state.language === "eng" ? "ENG" : "中文",
      year.year,
      title,
      activeSection ? `${activeSection.label} · ${activeSection.title}` : "",
    ].filter(Boolean).join(" · ");
    element("item-title").textContent = question.label;
    element("paper-description").textContent = activeSection
      ? `${activeSection.label} · ${activeSection.title} · ${state.language === "eng" ? "8 multiple-choice questions and 1 structured question" : "8 道選擇題及 1 道大題"}`
      : paperDescription(paper, state.paper);
    element("question-heading").textContent = labels.question;
    element("answer-heading").textContent = labels.answer;
    element("question-images").innerHTML =
      imageMarkup(year.id, question.question, `${year.year} ${title} ${question.label}`);

    const hasAnswer = Boolean(question.answerText || (question.answer && question.answer.length));
    element("answer-button").hidden = !hasAnswer;
    const answerText = question.answerText === "Deleted"
      ? (state.language === "eng" ? "Question cancelled" : "題目取消")
      : question.answerText;
    const choiceMarkup = answerText
      ? `<div class="choice-answer" aria-label="Answer ${escapeHtml(answerText)}">${escapeHtml(answerText)}</div>`
      : "";
    element("answer-images").innerHTML =
      choiceMarkup +
      imageMarkup(year.id, question.answer, `${year.year} answer`);
    renderRelatedKnowledge(year, paper, question);
    resetAnswer();

    const mistakeLabels = currentMistakeCopy();
    const questionKey = currentQuestionKey();
    const isMarked = Boolean(questionKey && mistakes[questionKey]);
    element("mistake-toggle").hidden = !questionKey;
    element("mistake-toggle").classList.toggle("marked", isMarked);
    element("mistake-toggle").setAttribute("aria-pressed", String(isMarked));
    element("mistake-toggle").dataset.questionKey = questionKey;
    element("mistake-toggle").querySelector(".mistake-toggle-icon").textContent = isMarked ? "★" : "☆";
    element("mistake-toggle-label").textContent = isMarked ? mistakeLabels.marked : mistakeLabels.mark;

    const visibleQuestionIndices = isPaper2
      ? paper2QuestionIndices(paper).map(({ index }) => index)
      : paper.questions.map((_, index) => index);
    const visiblePosition = visibleQuestionIndices.indexOf(state.question);
    element("previous-button").disabled = visiblePosition <= 0;
    element("next-button").disabled = visiblePosition < 0 || visiblePosition === visibleQuestionIndices.length - 1;
  }

  function textbookPoints() {
    return pointsByLanguage[state.language];
  }

  function booksWithPoints() {
    return booksByLanguage[state.language];
  }

  function chaptersForBook(book) {
    if (chaptersByBook.has(book)) return chaptersByBook.get(book);
    const chapters = [];
    const seen = new Set();
    book.points.forEach((point) => {
      if (!seen.has(point.code)) {
        seen.add(point.code);
        chapters.push({ code: point.code, title: point.chapter });
      }
    });
    chaptersByBook.set(book, chapters);
    return chapters;
  }

  function searchable(value) {
    return String(value).toLocaleLowerCase().replace(/\s+/g, " ").trim();
  }

  function pointMatches(point, query) {
    const parallelPoints = ["eng", "chn"]
      .map((language) => pointByLanguageAndSequence[language]?.get(Number(point.sequence)))
      .filter(Boolean);
    const haystack = searchable([
      point.sequence, point.book, point.code, point.chapter,
      point.content, point.formula, point.formula_notes,
      ...parallelPoints.flatMap((parallelPoint) => [
        parallelPoint.book, parallelPoint.chapter, parallelPoint.content,
        parallelPoint.formula, parallelPoint.formula_notes,
      ]),
    ].join(" "));
    return searchable(query).split(" ").filter(Boolean).every((term) => haystack.includes(term));
  }

  function indexedNavButtons(items, activeIndex, label, className = "") {
    return items.map(({ item, index }) => {
      const text = typeof label === "function" ? label(item, index) : item[label];
      return `<button type="button" class="nav-button ${className} ${index === activeIndex ? "active" : ""}" ` +
        `data-index="${index}">${escapeHtml(text)}</button>`;
    }).join("");
  }

  function paper2QuestionIndices(paper, section = state.paper2Section) {
    return paper.questions
      .map((item, index) => ({ item, index }))
      .filter(({ item, index }) => paper2SectionNumber(item, index) === Number(section));
  }

  function pointCard(point) {
    const labels = currentCopy();
    const isLaw = Boolean(point.is_governing_law);
    const questionSection = isLaw
      ? ""
      : `<section class="point-questions">
          <div class="point-questions-heading"><strong>${labels.questionsForPoint}</strong><span>${(questionsByKnowledge.get(point.sequence) || []).length}</span></div>
          ${questionLinksMarkup(point.sequence)}
        </section>`;
    return `
      <article class="knowledge-point ${bookToneClass(point.book_key)} ${isLaw ? "governing-law" : ""}" id="point-${point.sequence}">
        <div class="point-topline">
          <div class="point-identity">
            <span class="sequence">#${String(point.sequence).padStart(3, "0")}</span>
            <span class="chapter-code">${escapeHtml(point.code)}</span>
            <span class="point-chapter">${escapeHtml(point.chapter)}</span>
            <span class="category-badge">${escapeHtml(categoryLabel(point))}</span>
          </div>
          <button class="copy-point" type="button" data-copy="${point.sequence}" aria-label="${labels.copy}">
            ${labels.copy}
          </button>
        </div>
        <div class="knowledge-content ${(point.formula && point.display_mode !== "prose") || point.category_code === "3" ? "has-formula" : ""}">${knowledgeContentMarkup(point)}</div>
        ${questionSection}
      </article>`;
  }

  function renderTextbook() {
    const labels = currentCopy();
    const books = booksWithPoints();
    const query = state.query.trim();
    const directory = element("textbook-directory");
    const browser = element("textbook-browser");

    element("collection-status").textContent = `${labels.collectionTextbook} · 365 ${labels.points}`;
    element("textbook-search").placeholder = labels.searchPlaceholder;
    element("clear-search").textContent = labels.clear;
    element("clear-search").hidden = !query;
    element("textbook-directory-title").textContent = labels.textbookDirectoryTitle;
    element("textbook-directory-note").textContent = labels.textbookDirectoryNote;
    element("back-to-books").textContent = labels.backToBooks;

    if (state.textbookDirectory && !query) {
      directory.hidden = false;
      browser.hidden = true;
      element("book-directory-list").innerHTML = books.map((book, index) => {
        const chapterCount = chaptersForBook(book).length;
        const section = index < 5
          ? (state.language === "eng" ? "COMPULSORY" : "必修")
          : (state.language === "eng" ? "ELECTIVE" : "选修");
        return `<button type="button" class="book-directory-card ${bookToneClass(book.points[0]?.book_key)}" data-directory-book="${index}">
          <span class="book-directory-type">${section}</span>
          <strong>${escapeHtml(book.name)}</strong>
          <small>${book.points.length} ${labels.points} · ${chapterCount} ${labels.chaptersWord}</small>
          <span class="book-directory-arrow">→</span>
        </button>`;
      }).join("");
      return;
    }

    directory.hidden = true;
    browser.hidden = false;
    const selectedBook = books[Math.min(state.book, books.length - 1)];
    const chapters = chaptersForBook(selectedBook);
    let points;
    let heading;
    let breadcrumb;

    if (query) {
      points = textbookPoints().filter((point) => pointMatches(point, query));
      heading = labels.searchResults;
      breadcrumb = `${state.language === "eng" ? "ENG" : "中文"} · “${query}”`;
    } else {
      points = selectedBook.points.filter((point) => state.chapter === "all" || point.code === state.chapter);
      const selectedChapter = chapters.find((chapter) => chapter.code === state.chapter);
      heading = selectedChapter ? `${selectedChapter.code} · ${selectedChapter.title}` : selectedBook.name;
      breadcrumb = `${state.language === "eng" ? "ENG" : "中文"} · ${selectedBook.name}`;
    }

    element("book-nav-label").textContent = labels.books;
    element("chapter-nav-label").textContent = labels.chapters;

    element("book-list").innerHTML = books.map((book, index) => `
      <button type="button" class="book-button ${bookToneClass(book.points[0]?.book_key)} ${!query && index === state.book ? "active" : ""}" data-book="${index}">
        <span>${escapeHtml(book.name)}</span><strong>${book.points.length}</strong>
      </button>`).join("");

    element("chapter-list").innerHTML = `
      <button type="button" class="chapter-button ${!query && state.chapter === "all" ? "active" : ""}" data-chapter="all">
        <span>${labels.allChapters}</span><strong>${selectedBook.points.length}</strong>
      </button>
      ${chapters.map((chapter) => {
        const count = selectedBook.points.filter((point) => point.code === chapter.code).length;
        return `<button type="button" class="chapter-button ${!query && state.chapter === chapter.code ? "active" : ""}" data-chapter="${escapeHtml(chapter.code)}">
          <span><b>${escapeHtml(chapter.code)}</b>${escapeHtml(chapter.title)}</span><strong>${count}</strong>
        </button>`;
      }).join("")}`;

    element("knowledge-breadcrumb").textContent = breadcrumb;
    element("knowledge-title").textContent = heading;
    element("knowledge-description").textContent = `${points.length} ${labels.points} · ${new Set(points.map((point) => point.code)).size} ${labels.chaptersWord}`;
    element("knowledge-points").innerHTML = points.length
      ? points.map(pointCard).join("")
      : `<div class="empty">${labels.noResults}</div>`;
  }

  function mistakeEntries() {
    if (mistakeEntriesCache?.language === state.language) return mistakeEntriesCache.entries;
    const entries = Object.entries(mistakes)
      .map(([key, meta]) => ({ key, meta, entry: paperEntryForKey(key), network: knowledgeNetwork[key] }))
      .filter((item) => item.entry && item.network)
      .sort((a, b) => String(b.meta?.markedAt || "").localeCompare(String(a.meta?.markedAt || "")));
    mistakeEntriesCache = { language: state.language, entries };
    return entries;
  }

  function mistakeBookKey(item) {
    const links = item.network?.links || [];
    const primary = links.find((link) => link.type === "primary" && mistakePdfBookKeys.includes(link.bookKey));
    return primary?.bookKey
      || links.find((link) => mistakePdfBookKeys.includes(link.bookKey))?.bookKey
      || window.DSE_MISTAKE_PDF?.ENTRY_OVERRIDES?.[item.key]?.bookKey
      || "";
  }

  function sortedMistakeEntriesForPdf(entries) {
    const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
    return entries
      .map((item) => ({ ...item, bookKey: mistakeBookKey(item) }))
      .filter((item) => item.bookKey)
      .sort((a, b) => {
        const bookDifference = mistakePdfBookKeys.indexOf(a.bookKey) - mistakePdfBookKeys.indexOf(b.bookKey);
        if (bookDifference) return bookDifference;
        const yearDifference = Number(a.entry.year.year) - Number(b.entry.year.year);
        if (yearDifference) return yearDifference;
        const paperDifference = a.entry.paperIndex - b.entry.paperIndex;
        if (paperDifference) return paperDifference;
        return collator.compare(
          questionIdentity(a.entry.question, a.entry.questionIndex),
          questionIdentity(b.entry.question, b.entry.questionIndex),
        );
      });
  }

  async function loadMistakePdfImage(source) {
    try {
      const response = await window.fetch(source);
      if (!response.ok && response.status !== 0) throw new Error(`Image request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length) throw new Error("Image request returned no data.");
      return bytes;
    } catch (fetchError) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("GET", source, true);
        request.responseType = "arraybuffer";
        request.onload = () => {
          const bytes = new Uint8Array(request.response || new ArrayBuffer(0));
          if (bytes.length) resolve(bytes);
          else reject(fetchError);
        };
        request.onerror = () => reject(fetchError);
        request.send();
      });
    }
  }

  function mistakePdfEntries(entries) {
    return sortedMistakeEntriesForPdf(entries).map((item) => {
      const primary = (item.network.links || []).find((link) => link.type === "primary") || item.network.links?.[0];
      const override = window.DSE_MISTAKE_PDF?.ENTRY_OVERRIDES?.[item.key];
      return {
        bookKey: item.bookKey,
        title: questionKeyLabel(item.key).replaceAll("·", "-"),
        chapterEn: primary?.chapterEn || override?.chapterEn || "",
        images: item.entry.question.question.map((path) => imageUrl(item.entry.year.id, path)),
      };
    });
  }

  function mistakePdfFilename() {
    const now = new Date();
    const date = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, "0"),
      String(now.getDate()).padStart(2, "0"),
    ].join("-");
    return `DSE-Physics-Mistake-Book-${date}.pdf`;
  }

  function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function printMistakeBook(entries) {
    const labels = currentMistakeCopy();
    const sections = window.DSE_MISTAKE_PDF?.BOOK_SECTIONS || [];
    const sectionLabels = state.language === "eng"
      ? mistakePdfBookKeys.map((_, index) => `Compulsory Book ${index + 1}`).slice(0, 5)
        .concat([1, 2, 3, 4].map((number) => `Elective Book ${number}`))
      : ["必修第一册", "必修第二册", "必修第三册", "必修第四册", "必修第五册", "选修第一册", "选修第二册", "选修第三册", "选修第四册"];
    const sorted = sortedMistakeEntriesForPdf(entries);
    const frame = document.createElement("iframe");
    frame.className = "mistake-print-frame";
    frame.setAttribute("aria-hidden", "true");
    document.body.append(frame);
    const printDocument = frame.contentDocument;
    const content = mistakePdfBookKeys.map((bookKey, sectionIndex) => {
      const sectionEntries = sorted.filter((item) => item.bookKey === bookKey);
      if (!sectionEntries.length) return "";
      return `<section class="book-section">
        <h1><b>${escapeHtml(sections[sectionIndex]?.code || bookKey)}</b>${escapeHtml(sectionLabels[sectionIndex])}</h1>
        ${sectionEntries.map((item) => {
          const title = questionKeyLabel(item.key);
          const primary = (item.network.links || []).find((link) => link.type === "primary") || item.network.links?.[0];
          const override = window.DSE_MISTAKE_PDF?.ENTRY_OVERRIDES?.[item.key];
          const chapter = state.language === "eng"
            ? primary?.chapterEn || override?.chapterEn
            : primary?.chapterZh || override?.chapterZh;
          return `<article class="print-question"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(chapter || "")}</p>${item.entry.question.question.map((path) => `<img src="${escapeHtml(new URL(imageUrl(item.entry.year.id, path), window.location.href).href)}" alt="${escapeHtml(title)}">`).join("")}</article>`;
        }).join("")}
      </section>`;
    }).join("");
    printDocument.open();
    printDocument.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(labels.downloadPdf)}</title><style>
      @page { size: A4; margin: 12mm; }
      * { box-sizing: border-box; }
      body { margin: 0; color: #162033; font-family: Arial, "Microsoft JhengHei", sans-serif; }
      .book-section { break-before: page; }
      .book-section:first-child { break-before: auto; }
      h1 { display: flex; align-items: center; gap: 10px; margin: 0 0 8mm; padding: 4mm 5mm; background: #245aa8; color: white; font-size: 17pt; }
      h1 b { display: grid; width: 9mm; height: 9mm; place-items: center; border-radius: 50%; background: rgba(255,255,255,.2); font-size: 9pt; }
      .print-question { break-inside: avoid; margin: 0 0 6mm; padding: 0 0 5mm; border-bottom: .3mm solid #d9dee7; }
      .print-question h2 { margin: 0 0 1mm; font-size: 11pt; }
      .print-question p { margin: 0 0 3mm; color: #677083; font-size: 7.5pt; }
      .print-question img { display: block; max-width: 100%; max-height: 235mm; margin: 0 auto 2mm; object-fit: contain; }
    </style></head><body>${content}</body></html>`);
    printDocument.close();
    const images = [...printDocument.images];
    Promise.all(images.map((image) => image.decode?.().catch(() => undefined))).finally(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      window.setTimeout(() => frame.remove(), 2000);
    });
  }

  async function exportMistakeBookPdf() {
    const button = element("download-mistake-pdf");
    const label = element("download-mistake-pdf-label");
    const status = element("mistake-pdf-status");
    const labels = currentMistakeCopy();
    const entries = mistakeEntries();
    if (!entries.length || button.disabled) return;
    const originalLabel = labels.downloadPdf;
    button.disabled = true;
    button.classList.add("busy");
    status.hidden = true;
    try {
      const pdfEntries = mistakePdfEntries(entries);
      const bytes = await window.DSE_MISTAKE_PDF.createMistakeBookPdf({
        entries: pdfEntries,
        loadImageBytes: loadMistakePdfImage,
        onProgress: ({ current, total }) => {
          label.textContent = labels.pdfBuilding.replace("{current}", current).replace("{total}", total);
        },
      });
      downloadBytes(bytes, mistakePdfFilename());
      label.textContent = originalLabel;
    } catch (error) {
      console.warn("Direct PDF download was unavailable; using the browser print dialog.", error);
      label.textContent = originalLabel;
      status.textContent = labels.pdfPrintFallback;
      status.hidden = false;
      try {
        printMistakeBook(entries);
      } catch (printError) {
        console.error(printError);
        status.textContent = labels.pdfFailed;
      }
    } finally {
      button.disabled = false;
      button.classList.remove("busy");
    }
  }

  function mistakeAnalytics(entries) {
    const points = new Map();
    const chapters = new Map();
    entries.forEach((item) => {
      const seenPoints = new Set();
      const seenChapters = new Set();
      (item.network.links || []).forEach((link) => {
        const sequence = Number(link.sequence);
        if (!seenPoints.has(sequence)) {
          seenPoints.add(sequence);
          points.set(sequence, (points.get(sequence) || 0) + 1);
        }
        if (!seenChapters.has(link.code)) {
          seenChapters.add(link.code);
          const existing = chapters.get(link.code) || {
            code: link.code,
            titleEn: link.chapterEn,
            titleZh: link.chapterZh,
            count: 0,
            sequence,
          };
          existing.count += 1;
          chapters.set(link.code, existing);
        }
      });
    });
    return {
      pointRows: [...points.entries()]
        .map(([sequence, count]) => ({ sequence, count, point: statisticsPointBySequence.get(sequence) }))
        .filter((row) => row.point)
        .sort((a, b) => b.count - a.count || a.sequence - b.sequence),
      chapterRows: [...chapters.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
    };
  }

  function updateMistakeBadge() {
    const count = mistakeEntries().length;
    element("mistake-count-badge").textContent = count;
    element("mistake-count-badge").hidden = count === 0;
    const homeCount = element("home-mistake-count");
    if (homeCount) homeCount.textContent = count;
  }

  function renderMistakes() {
    const labels = currentMistakeCopy();
    const entries = mistakeEntries();
    const analysis = mistakeAnalytics(entries);
    const topChapters = analysis.chapterRows.slice(0, 3);

    updateMistakeBadge();
    element("collection-status").textContent = `${entries.length} ${labels.wrongQuestions}`;
    element("mistakes-heading").textContent = labels.heading;
    element("mistakes-description").textContent = labels.description;
    element("browse-for-mistakes").firstChild.textContent = `${labels.browse} `;
    element("mistake-total").textContent = entries.length;
    element("mistake-point-total").textContent = analysis.pointRows.length;
    element("mistake-top-code").textContent = topChapters.length
      ? topChapters.map((chapter, index) => (
        `${index + 1}. ${chapter.code} · ${state.language === "eng" ? chapter.titleEn : chapter.titleZh}`
      )).join("\n")
      : "—";
    element("mistake-total-label").textContent = labels.wrongQuestions;
    element("mistake-point-label").textContent = labels.knowledgePoints;
    element("mistake-top-code-label").textContent = labels.weakestChapter;
    element("mistake-list-kicker").textContent = labels.listKicker;
    element("mistake-list-title").textContent = labels.listTitle;
    element("download-mistake-pdf-label").textContent = labels.downloadPdf;
    element("mistake-pdf-order").textContent = labels.pdfOrder;
    element("mistake-pdf-status").hidden = true;
    element("download-mistake-pdf").disabled = entries.length === 0;
    element("mistake-questions-tab").textContent = labels.questionsTab;
    element("mistake-analysis-tab").textContent = labels.analysisTab;
    const showingAnalysis = state.mistakeView === "analysis";
    element("mistake-questions-tab").classList.toggle("active", !showingAnalysis);
    element("mistake-analysis-tab").classList.toggle("active", showingAnalysis);
    element("mistake-questions-tab").setAttribute("aria-selected", String(!showingAnalysis));
    element("mistake-analysis-tab").setAttribute("aria-selected", String(showingAnalysis));
    element("mistake-questions-panel").hidden = showingAnalysis;
    element("mistake-analysis-panel").hidden = !showingAnalysis;
    const resultList = element("mistake-question-list");
    resultList.innerHTML = entries.length ? entries.map((item) => {
      const questionTitle = questionKeyLabel(item.key);
      const chapter = item.entry.chapter || (state.language === "eng" ? "Related knowledge" : "相关知识点");
      const questionImages = imageMarkup(
        item.entry.year.id,
        item.entry.question.question,
        `${questionTitle} original question`,
        false,
      );
      return `<article class="mistake-question-card">
        <div class="mistake-card-top">
          <div><span>${escapeHtml(questionTitle)}</span><h4>${escapeHtml(chapter)}</h4></div>
          <button type="button" class="remove-mistake" data-remove-mistake="${escapeHtml(item.key)}">${escapeHtml(labels.remove)}</button>
        </div>
        <button type="button" class="mistake-scan-link" data-question-key="${escapeHtml(item.key)}" aria-label="${escapeHtml(`${labels.open}: ${questionTitle}`)}">
          ${questionImages}
        </button>
        <div class="mistake-card-actions">
          <button type="button" class="open-mistake" data-question-key="${escapeHtml(item.key)}">${escapeHtml(labels.open)}</button>
        </div>
      </article>`;
    }).join("") : `<div class="mistake-empty">${escapeHtml(labels.empty)}</div>`;

    element("mistake-report-kicker").textContent = labels.reportKicker;
    element("mistake-report-title").textContent = labels.reportTitle;
    element("mistake-report-note").textContent = labels.reportNote;
    element("mistake-chapter-kicker").textContent = labels.chapterReportKicker;
    element("mistake-chapter-title").textContent = labels.chapterReportTitle;
    element("mistake-point-kicker").textContent = labels.pointReportKicker;
    element("mistake-point-title").textContent = labels.pointReportTitle;

    const chapterRows = analysis.chapterRows;
    const chapterMax = chapterRows[0]?.count || 1;
    element("mistake-chapter-chart").innerHTML = chapterRows.length ? chapterRows.map((row) => `
      <button type="button" class="bar-row" data-point-sequence="${row.sequence}">
        <span class="bar-label"><b>${escapeHtml(row.code)}</b>${escapeHtml(state.language === "eng" ? row.titleEn : row.titleZh)}</span>
        <span class="bar-track"><i style="width:${row.count / chapterMax * 100}%"></i></span><strong>${row.count}</strong>
      </button>`).join("") : `<div class="mistake-empty-mini">${escapeHtml(labels.reportEmpty)}</div>`;

    const languageKey = state.language === "eng" ? "En" : "Zh";
    element("mistake-point-list").innerHTML = analysis.pointRows.length ? analysis.pointRows.map((row) => {
      const affected = entries
        .filter((item) => (item.network.links || []).some((link) => Number(link.sequence) === row.sequence))
        .map((item) => `<button type="button" data-question-key="${escapeHtml(item.key)}">${escapeHtml(questionKeyLabel(item.key))}</button>`)
        .join("");
      return `<article class="mistake-point-row">
        <button type="button" class="mistake-point-main ${bookToneClass(row.point.bookKey)}" data-point-sequence="${row.sequence}">
          <span><b>#${String(row.sequence).padStart(3, "0")} · ${escapeHtml(row.point.code)}</b><small>${escapeHtml(row.point[`chapter${languageKey}`])}</small></span>
          <strong>${row.count}</strong>
        </button>
        <p>${escapeHtml(row.point[`text${languageKey}`])}</p>
        <div class="mistake-point-questions"><span>${escapeHtml(labels.affectedQuestions)}</span>${affected}</div>
      </article>`;
    }).join("") : `<div class="mistake-empty-mini">${escapeHtml(labels.reportEmpty)}</div>`;
  }

  function applyTheme() {
    const dark = state.theme === "dark";
    document.documentElement.dataset.theme = state.theme;
    element("theme-toggle").setAttribute("aria-pressed", String(dark));
    element("theme-toggle-icon").textContent = dark ? "☀" : "◐";
    const label = dark
      ? (state.language === "eng" ? "Light" : "浅色")
      : (state.language === "eng" ? "Dark" : "暗色");
    element("theme-toggle-label").textContent = label;
    element("theme-toggle").title = state.language === "eng" ? `Switch to ${label.toLowerCase()} mode` : `切换到${label}模式`;
  }

  const libraryViews = ["home", "papers", "textbook", "mistakes"];

  function setLibrary(library, { behavior = "smooth", textbookDirectory } = {}) {
    state.library = library;
    if (typeof textbookDirectory === "boolean") state.textbookDirectory = textbookDirectory;
    updateTopLevel();
    window.scrollTo({ top: 0, behavior });
  }

  function currentPaperIdentity() {
    const { year, paper, question } = currentPaper();
    return {
      year: String(year.year),
      paper: paperIdAt(state.paper),
      question: questionIdentity(question, state.question),
    };
  }

  function restorePaperIdentity(identity) {
    const years = visibleYears();
    const yearIndex = years.findIndex((year) => String(year.year) === identity.year);
    state.year = yearIndex >= 0 ? yearIndex : Math.min(state.year, years.length - 1);
    const year = years[state.year];
    const paperIndex = ["paper-1a", "paper-1b", "paper-2"].indexOf(identity.paper);
    state.paper = paperIndex >= 0 && paperIndex < year.papers.length
      ? paperIndex
      : Math.min(state.paper, year.papers.length - 1);
    const paper = year.papers[state.paper];
    const questionIndex = paper.questions.findIndex((question, index) => (
      questionIdentity(question, index) === String(identity.question)
    ));
    state.question = questionIndex >= 0
      ? questionIndex
      : Math.min(state.question, paper.questions.length - 1);
  }

  function visibleKnowledgeAnchor() {
    if (state.library !== "textbook" || state.textbookDirectory) return null;
    const cards = [...document.querySelectorAll(".knowledge-point")];
    const card = cards.find((item) => item.getBoundingClientRect().bottom > 0) || cards[0];
    if (!card) return null;
    return {
      sequence: card.id.replace("point-", ""),
      top: card.getBoundingClientRect().top,
    };
  }

  function restoreReadingPosition(anchor, scrollTop) {
    window.requestAnimationFrame(() => {
      const card = anchor ? document.getElementById(`point-${anchor.sequence}`) : null;
      const scrollingElement = document.scrollingElement || document.documentElement;
      const previousScrollBehavior = scrollingElement.style.scrollBehavior;
      scrollingElement.style.scrollBehavior = "auto";
      if (card) {
        scrollingElement.scrollTop += card.getBoundingClientRect().top - anchor.top;
      } else {
        scrollingElement.scrollTop = scrollTop;
      }
      window.requestAnimationFrame(() => {
        scrollingElement.style.scrollBehavior = previousScrollBehavior;
      });
    });
  }

  function renderAdjacentQuestion(questionIndex) {
    const questionTop = element("question-heading").getBoundingClientRect().top;
    state.question = questionIndex;
    renderPapers();
    window.requestAnimationFrame(() => {
      const scrollingElement = document.scrollingElement || document.documentElement;
      const previousScrollBehavior = scrollingElement.style.scrollBehavior;
      scrollingElement.style.scrollBehavior = "auto";
      scrollingElement.scrollTop += element("question-heading").getBoundingClientRect().top - questionTop;
      window.requestAnimationFrame(() => {
        scrollingElement.style.scrollBehavior = previousScrollBehavior;
      });
    });
  }

  function updateTopLevel() {
    const labels = currentCopy();
    const isHome = state.library === "home";
    const isPapers = state.library === "papers";
    const isTextbook = state.library === "textbook";
    const isMistakes = state.library === "mistakes";
    document.body.classList.toggle("home-mode", isHome);
    document.body.classList.toggle("section-mode", !isHome);
    libraryViews.forEach((library) => {
      const active = library === state.library;
      element(`${library}-view`).hidden = !active;
      const tab = element(`${library}-tab`);
      tab.setAttribute("aria-selected", String(active));
      tab.classList.toggle("active", active);
    });
    element("eng-button").classList.toggle("active", state.language === "eng");
    element("chn-button").classList.toggle("active", state.language === "chn");
    document.documentElement.lang = state.language === "eng" ? "en" : "zh-Hant";
    applyTheme();
    const mistakeLabels = currentMistakeCopy();
    element("hero-title").textContent = isHome ? labels.heroHome : (isPapers ? labels.heroPapers : (isTextbook ? labels.heroTextbook : mistakeLabels.hero));
    element("hero-subtitle").textContent = isHome ? labels.subHome : (isPapers ? labels.subPapers : (isTextbook ? labels.subTextbook : mistakeLabels.sub));
    updateMistakeBadge();
    if (isHome) renderHome();
    else if (isPapers) { renderPaperSearch(); renderPapers(); }
    else if (isTextbook) renderTextbook();
    else renderMistakes();
  }

  function bindList(id, selector, action, renderAction = updateTopLevel) {
    element(id).addEventListener("click", (event) => {
      const button = event.target.closest(selector);
      if (!button) return;
      action(button);
      renderAction();
    });
  }

  document.querySelector(".library-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-library]");
    if (!button || button.dataset.library === state.library) return;
    state.library = button.dataset.library;
    if (state.library === "textbook") state.textbookDirectory = true;
    updateTopLevel();
    window.scrollTo({ top: 0, behavior: "auto" });
  });

  document.querySelector(".language-switch").addEventListener("click", (event) => {
    const button = event.target.closest("[data-language]");
    if (!button || button.dataset.language === state.language) return;
    const paperIdentity = state.library === "papers" ? currentPaperIdentity() : null;
    const knowledgeAnchor = visibleKnowledgeAnchor();
    const scrollTop = window.scrollY;
    state.language = button.dataset.language;
    if (paperIdentity) restorePaperIdentity(paperIdentity);
    mistakeEntriesCache = null;
    updateTopLevel();
    restoreReadingPosition(knowledgeAnchor, scrollTop);
  });

  element("theme-toggle").addEventListener("click", () => {
    state.theme = state.theme === "dark" ? "light" : "dark";
    try { window.localStorage.setItem(THEME_STORAGE_KEY, state.theme); } catch { /* Keep the current-session theme. */ }
    applyTheme();
  });

  element("open-papers").addEventListener("click", () => {
    setLibrary("papers");
  });
  element("open-textbook").addEventListener("click", () => {
    setLibrary("textbook", { textbookDirectory: true });
  });
  element("open-mistakes").addEventListener("click", () => {
    setLibrary("mistakes");
  });
  element("browse-for-mistakes").addEventListener("click", () => {
    setLibrary("papers");
  });
  element("mistake-toggle").addEventListener("click", () => {
    const key = element("mistake-toggle").dataset.questionKey;
    if (!key) return;
    setMistake(key, !mistakes[key]);
    renderPapers();
    updateMistakeBadge();
  });
  element("paper-search-query").addEventListener("input", (event) => {
    state.paperQuery = event.target.value;
    renderPaperSearch();
  });
  element("paper-search-year").addEventListener("change", (event) => {
    state.paperSearchYear = event.target.value;
    renderPaperSearch();
  });
  element("paper-search-clear").addEventListener("click", () => {
    state.paperQuery = "";
    state.paperSearchYear = "all";
    renderPaperSearch();
    element("paper-search-query").focus();
  });
  element("paper-search-results").addEventListener("click", (event) => {
    const button = event.target.closest("[data-year-index]");
    if (button) openPaperEntry(button);
  });
  element("related-links").addEventListener("click", (event) => {
    const button = event.target.closest("[data-sequence]");
    if (button) goToKnowledge(Number(button.dataset.sequence));
  });

  bindList("year-list", "[data-index]", (button) => {
    state.year = Number(button.dataset.index);
    state.paper = 0;
    state.question = 0;
    state.paper2Section = 1;
  });
  element("download-mistake-pdf").addEventListener("click", exportMistakeBookPdf);
  bindList("paper-list", "[data-index]", (button) => {
    state.paper = Number(button.dataset.index);
    state.question = 0;
    state.paper2Section = 1;
  });
  bindList("paper2-section-list", "[data-section]", (button) => {
    state.paper2Section = Number(button.dataset.section);
    const { paper } = currentPaper();
    state.question = paper2QuestionIndices(paper, state.paper2Section)[0]?.index || 0;
  });
  bindList("question-list", "[data-index]", (button) => {
    state.question = Number(button.dataset.index);
  });
  bindList("book-list", "[data-book]", (button) => {
    state.textbookDirectory = false;
    state.book = Number(button.dataset.book);
    state.chapter = "all";
    state.query = "";
    element("textbook-search").value = "";
  });
  bindList("chapter-list", "[data-chapter]", (button) => {
    state.textbookDirectory = false;
    state.chapter = button.dataset.chapter;
    state.query = "";
    element("textbook-search").value = "";
  });

  element("previous-button").addEventListener("click", () => {
    const { paper } = currentPaper();
    const indices = state.paper === 2 && Array.isArray(paper.sections)
      ? paper2QuestionIndices(paper).map(({ index }) => index)
      : paper.questions.map((_, index) => index);
    const position = indices.indexOf(state.question);
    if (position > 0) {
      renderAdjacentQuestion(indices[position - 1]);
    }
  });
  element("next-button").addEventListener("click", () => {
    const { paper } = currentPaper();
    const indices = state.paper === 2 && Array.isArray(paper.sections)
      ? paper2QuestionIndices(paper).map(({ index }) => index)
      : paper.questions.map((_, index) => index);
    const position = indices.indexOf(state.question);
    if (position >= 0 && position < indices.length - 1) {
      renderAdjacentQuestion(indices[position + 1]);
    }
  });
  element("answer-button").addEventListener("click", () => {
    const panel = element("answer-panel");
    const open = panel.hidden;
    panel.hidden = !open;
    element("answer-button").setAttribute("aria-expanded", String(open));
    element("answer-button").querySelector("span").textContent = open
      ? currentCopy().hideAnswer
      : currentCopy().showAnswer;
  });
  let searchTimer;
  element("textbook-search").addEventListener("input", (event) => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state.query = event.target.value;
      state.textbookDirectory = !state.query.trim();
      renderTextbook();
    }, 100);
  });
  element("clear-search").addEventListener("click", () => {
    state.query = "";
    state.textbookDirectory = true;
    element("textbook-search").value = "";
    renderTextbook();
    element("textbook-search").focus();
  });
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      state.library = "textbook";
      state.textbookDirectory = true;
      updateTopLevel();
      element("textbook-search").focus();
    }
  });
  element("book-directory-list").addEventListener("click", (event) => {
    const button = event.target.closest("[data-directory-book]");
    if (!button) return;
    state.book = Number(button.dataset.directoryBook);
    state.chapter = "all";
    state.query = "";
    state.textbookDirectory = false;
    element("textbook-search").value = "";
    renderTextbook();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  element("back-to-books").addEventListener("click", () => {
    state.query = "";
    state.chapter = "all";
    state.textbookDirectory = true;
    element("textbook-search").value = "";
    renderTextbook();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("button");
    if (!target || target.disabled) return;
    target.classList.remove("tap-feedback");
    void target.offsetWidth;
    target.classList.add("tap-feedback");
    window.setTimeout(() => target.classList.remove("tap-feedback"), 220);
  });
  element("knowledge-points").addEventListener("click", async (event) => {
    const questionButton = event.target.closest("[data-question-key]");
    if (questionButton) {
      openQuestionKey(questionButton.dataset.questionKey);
      return;
    }
    const button = event.target.closest("[data-copy]");
    if (!button) return;
    const point = pointByLanguageAndSequence[state.language].get(Number(button.dataset.copy));
    if (!point) return;
    await navigator.clipboard.writeText(copyTextForPoint(point));
    const original = button.textContent;
    button.textContent = currentCopy().copied;
    window.setTimeout(() => { button.textContent = original; }, 900);
  });

  element("mistakes-view").addEventListener("click", (event) => {
    if (event.target.closest("#mistake-questions-tab")) {
      state.mistakeView = "questions";
      renderMistakes();
      return;
    }
    if (event.target.closest("#mistake-analysis-tab")) {
      state.mistakeView = "analysis";
      renderMistakes();
      return;
    }
    const removeButton = event.target.closest("[data-remove-mistake]");
    if (removeButton) {
      setMistake(removeButton.dataset.removeMistake, false);
      renderMistakes();
      return;
    }
    const questionButton = event.target.closest("[data-question-key]");
    if (questionButton) {
      openQuestionKey(questionButton.dataset.questionKey);
      return;
    }
    const pointButton = event.target.closest("[data-point-sequence]");
    if (pointButton?.dataset.pointSequence) goToKnowledge(Number(pointButton.dataset.pointSequence));
  });


  window.addEventListener("storage", (event) => {
    if (event.key !== MISTAKE_STORAGE_KEY) return;
    mistakes = loadMistakes();
    mistakeEntriesCache = null;
    updateTopLevel();
  });

  if (!paperData?.years?.length || !textbookData?.languages?.eng?.length || !Object.keys(knowledgeNetwork).length || !statistics?.points?.length) {
    document.body.innerHTML = '<p class="empty">Study data could not be loaded.</p>';
    return;
  }
  updateTopLevel();
})();
