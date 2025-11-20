const ANSWER_STORAGE_KEY = 'bayexam-answers';
const SHUFFLE_STORAGE_KEY = 'bayexam-shuffle';

const questionListEl = document.getElementById('questionList');
const correctCountEl = document.getElementById('correctCount');
const wrongCountEl = document.getElementById('wrongCount');
const answeredCountEl = document.getElementById('answeredCount');
const totalCountEl = document.getElementById('totalCount');
const accuracyLabelEl = document.getElementById('accuracyLabel');
const accuracyProgressEl = document.getElementById('accuracyProgress');
const searchInput = document.getElementById('searchInput');
const sourceFilter = document.getElementById('sourceFilter');
const shuffleToggleBtn = document.getElementById('shuffleToggle');
const themeToggleBtn = document.getElementById('themeToggle');
const resetBtn = document.getElementById('resetProgress');
const template = document.getElementById('questionTemplate');

const state = {
  questions: [],
  renderedQuestions: [],
  answers: new Map(),
  totals: {
    correct: 0,
    incorrect: 0,
  },
  shuffle: false,
};

const escapeHtml = (value = '') =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const wrapBullets = (html) => {
  if (!html.includes('•')) return html;
  const [prefix, ...rest] = html.split('•');
  const items = rest.map((item) => item.trim()).filter(Boolean);
  if (!items.length) return html;
  const list = `<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`;
  const trimmedPrefix = prefix.trim();
  return `${trimmedPrefix ? `<p>${trimmedPrefix}</p>` : ''}${list}`;
};

const formatExplanationHTML = (text) => {
  if (!text) return '';
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.+?)__/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer">$1</a>');
  html = html.replace(/\n+/g, '<br />');
  return wrapBullets(html);
};

const loadStoredAnswers = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(ANSWER_STORAGE_KEY) || '{}');
    return new Map(
      Object.entries(raw).map(([key, value]) => [Number(key), value]),
    );
  } catch (error) {
    console.warn('Cevap verileri yüklenemedi, sıfırdan başlatılıyor.', error);
    return new Map();
  }
};

const persistAnswers = () => {
  const serializable = {};
  state.answers.forEach((value, key) => {
    serializable[key] = value;
  });
  localStorage.setItem(ANSWER_STORAGE_KEY, JSON.stringify(serializable));
};

const clearStoredAnswers = () => {
  localStorage.removeItem(ANSWER_STORAGE_KEY);
};

const syncTotalsFromAnswers = () => {
  state.totals.correct = 0;
  state.totals.incorrect = 0;
  state.answers.forEach((value) => {
    if (value.status === 'correct') {
      state.totals.correct += 1;
    } else if (value.status === 'incorrect') {
      state.totals.incorrect += 1;
    }
  });
};

const refreshShuffleKeys = () => {
  state.questions.forEach((question, index) => {
    question.originalIndex = question.originalIndex ?? index;
    question.shuffleKey = Math.random();
  });
};

state.answers = loadStoredAnswers();
syncTotalsFromAnswers();
state.shuffle = localStorage.getItem(SHUFFLE_STORAGE_KEY) === 'true';

const normalize = (value) =>
  (value || '')
    .toString()
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, ' ');

const shuffle = (array) => {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const buildOptionSet = (question, pool) => {
  if (question.options && question.options.length > 0) {
    return question.options.map((opt) => ({
      label: opt.label,
      text: opt.text,
    }));
  }

  const uniquePool = pool.filter(
    (text) => text && normalize(text) !== normalize(question.answer.text),
  );

  const distractors = shuffle(uniquePool).slice(0, Math.min(3, uniquePool.length));
  const combined = shuffle([question.answer.text, ...distractors]);

  return combined.map((text, idx) => ({
    label: String.fromCharCode(65 + idx),
    text,
  }));
};

const isCorrectChoice = (choice, answer) => {
  const sameLabel = answer.label && choice.label && answer.label === choice.label;
  const sameText = normalize(choice.text) === normalize(answer.text);
  return Boolean(sameLabel || sameText);
};

const formatScoreChip = () => `✔ ${state.totals.correct} · ✖ ${state.totals.incorrect}`;

const updateCardMetrics = () => {
  document.querySelectorAll('.question-card').forEach((card) => {
    const chip = card.querySelector('.card-metrics');
    if (!chip || chip.hidden) return;
    chip.textContent = formatScoreChip();
  });
};

const updateScoreboard = () => {
  correctCountEl.textContent = state.totals.correct;
  wrongCountEl.textContent = state.totals.incorrect;
  answeredCountEl.textContent = state.answers.size;
  totalCountEl.textContent = state.questions.length;

  const answered = state.answers.size;
  const accuracy = answered ? Math.round((state.totals.correct / answered) * 100) : 0;
  if (accuracyLabelEl) {
    accuracyLabelEl.textContent = `${accuracy}%`;
  }
  if (accuracyProgressEl) {
    accuracyProgressEl.style.width = `${accuracy}%`;
  }

  updateCardMetrics();
};

const updateShuffleToggle = () => {
  if (!shuffleToggleBtn) return;
  shuffleToggleBtn.setAttribute('aria-pressed', String(state.shuffle));
  const label = shuffleToggleBtn.querySelector('.shuffle-label');
  if (label) {
    label.textContent = state.shuffle ? 'Karışık sıra açık' : 'Sırayı karıştır';
  }
};

const toggleShuffle = () => {
  state.shuffle = !state.shuffle;
  localStorage.setItem(SHUFFLE_STORAGE_KEY, String(state.shuffle));
  if (state.shuffle) {
    refreshShuffleKeys();
  }
  updateShuffleToggle();
  applyFilters();
};

const formatSourceLabel = (fileName) => {
  if (!fileName) return 'Kaynak yok';
  const base = fileName.replace('.txt', '');
  return `Belge ${base}`;
};

const clearList = () => {
  questionListEl.innerHTML = '';
};

const applyStoredAnswer = (
  card,
  question,
  storedAnswer,
  feedbackEl,
  feedbackStatus,
  feedbackText,
  revealChip,
) => {
  card.dataset.locked = 'true';
  const optionButtons = card.querySelectorAll('.option-btn');

  optionButtons.forEach((btn) => {
    const btnChoice = {
      label: btn.dataset.optionLabel,
      text: btn.dataset.optionText,
    };
    const btnIsCorrect = isCorrectChoice(btnChoice, question.answer);
    const selectionMatches =
      storedAnswer.choice &&
      (storedAnswer.choice.label
        ? storedAnswer.choice.label === btnChoice.label
        : normalize(storedAnswer.choice.text) === normalize(btnChoice.text));
    btn.classList.toggle('is-correct', btnIsCorrect);
    btn.classList.toggle('is-incorrect', !btnIsCorrect && selectionMatches);
    btn.setAttribute('aria-checked', selectionMatches ? 'true' : 'false');
    btn.disabled = true;
  });

  feedbackEl.hidden = false;
  feedbackEl.classList.toggle('success', storedAnswer.status === 'correct');
  feedbackEl.classList.toggle('error', storedAnswer.status !== 'correct');
  feedbackStatus.textContent = storedAnswer.status === 'correct' ? 'Doğru!' : 'Yanlış cevap';
  const explanationHtml =
    formatExplanationHTML(question.explanation) ||
    formatExplanationHTML('Bu soru için açıklama henüz eklenmemiş.');
  feedbackText.innerHTML = explanationHtml;
  revealChip();
};

const renderQuestions = () => {
  clearList();
  state.renderedQuestions.forEach((question, idx) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const cardKicker = card.querySelector('.card-kicker');
    const cardTitle = card.querySelector('.card-title');
    const sourceBadge = card.querySelector('.source-badge');
    const optionsEl = card.querySelector('.options');
    const feedbackEl = card.querySelector('.feedback');
    const feedbackStatus = card.querySelector('.feedback-status');
    const feedbackText = card.querySelector('.feedback-text');
    const chipEl = card.querySelector('.card-metrics');
    const revealChip = () => {
      if (!chipEl) return;
      chipEl.hidden = false;
      chipEl.textContent = formatScoreChip();
    };
    if (chipEl) {
      chipEl.textContent = formatScoreChip();
    }

    card.dataset.questionId = question.id;
    cardKicker.textContent = `Soru ${idx + 1}`;
    cardTitle.textContent = question.question;
    sourceBadge.textContent = formatSourceLabel(question.source);
    optionsEl.setAttribute(
      'aria-label',
      `${question.number || idx + 1}. soru seçenekleri`,
    );

    const choices = question.renderOptions;
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = choice.text;
      btn.dataset.optionLabel = choice.label || '';
      btn.dataset.optionText = choice.text;
       btn.setAttribute('role', 'radio');
       btn.setAttribute('aria-checked', 'false');
       btn.setAttribute('tabindex', '0');
      btn.addEventListener('click', () =>
        handleAnswer(
          question,
          choice,
          btn,
          card,
          feedbackEl,
          feedbackStatus,
          feedbackText,
          revealChip,
        ),
      );
      optionsEl.appendChild(btn);
    });

    const storedAnswer = state.answers.get(question.id);
    if (storedAnswer) {
      applyStoredAnswer(
        card,
        question,
        storedAnswer,
        feedbackEl,
        feedbackStatus,
        feedbackText,
        revealChip,
      );
    }

    questionListEl.appendChild(card);
  });

  questionListEl.setAttribute('aria-busy', 'false');
};

const applyFilters = () => {
  const term = normalize(searchInput.value);
  const source = sourceFilter.value;

  let filtered = state.questions.filter((question) => {
    const matchesSearch = !term || normalize(question.question).includes(term);
    const matchesSource = !source || question.source === source;
    return matchesSearch && matchesSource;
  });

  const sorter = state.shuffle
    ? (a, b) => a.shuffleKey - b.shuffleKey
    : (a, b) => a.originalIndex - b.originalIndex;
  filtered = [...filtered].sort(sorter);

  state.renderedQuestions = filtered;
  renderQuestions();
};

const resetProgress = () => {
  state.answers.clear();
  state.totals.correct = 0;
  state.totals.incorrect = 0;
  clearStoredAnswers();
  updateScoreboard();
  applyFilters();
};

const handleAnswer = (
  question,
  choice,
  button,
  card,
  feedbackEl,
  feedbackStatus,
  feedbackText,
  revealChip,
) => {
  if (card.dataset.locked === 'true') {
    return;
  }

  card.dataset.locked = 'true';
  const isCorrect = isCorrectChoice(choice, question.answer);
  const optionButtons = card.querySelectorAll('.option-btn');

  optionButtons.forEach((btn) => {
    const btnChoice = {
      label: btn.dataset.optionLabel,
      text: btn.dataset.optionText,
    };
    const btnIsCorrect = isCorrectChoice(btnChoice, question.answer);
    btn.classList.toggle('is-correct', btnIsCorrect);
    btn.classList.toggle('is-incorrect', !btnIsCorrect && btn === button);
    btn.setAttribute('aria-checked', btn === button ? 'true' : 'false');
    btn.disabled = true;
  });

  feedbackEl.hidden = false;
  feedbackEl.classList.toggle('success', isCorrect);
  feedbackEl.classList.toggle('error', !isCorrect);
  feedbackStatus.textContent = isCorrect ? 'Doğru!' : 'Yanlış cevap';
  const explanationHtml =
    formatExplanationHTML(question.explanation) ||
    formatExplanationHTML('Bu soru için açıklama henüz eklenmemiş.');
  feedbackText.innerHTML = explanationHtml;
  revealChip();

  state.answers.set(question.id, {
    status: isCorrect ? 'correct' : 'incorrect',
    choice,
  });
  if (isCorrect) {
    state.totals.correct += 1;
  } else {
    state.totals.incorrect += 1;
  }

  persistAnswers();
  updateScoreboard();
};

const initTheme = () => {
  const storedTheme = localStorage.getItem('bayexam-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = storedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeButton(theme);
};

const updateThemeButton = (theme) => {
  const icon = theme === 'dark' ? '☀️' : '🌙';
  const label = theme === 'dark' ? 'Aydınlık' : 'Karanlık';
  themeToggleBtn.querySelector('.toggle-icon').textContent = icon;
  themeToggleBtn.querySelector('.toggle-label').textContent = label;
};

const toggleTheme = () => {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('bayexam-theme', next);
  updateThemeButton(next);
};

const populateSourceFilter = (questions) => {
  const uniqueSources = [...new Set(questions.map((q) => q.source))].sort();
  uniqueSources.forEach((source) => {
    const option = document.createElement('option');
    option.value = source;
    option.textContent = formatSourceLabel(source);
    sourceFilter.appendChild(option);
  });
};

const bootstrap = async () => {
  try {
    const response = await fetch('data/questions.json');
    const data = await response.json();
    const answersPool = data.map((q) => q.answer.text).filter(Boolean);

    state.questions = data.map((question, index) => ({
      ...question,
      originalIndex: index,
      shuffleKey: Math.random(),
      renderOptions: buildOptionSet(question, answersPool),
    }));
    const validIds = new Set(state.questions.map((question) => question.id));
    let hasRemovedStaleAnswer = false;
    state.answers.forEach((_, key) => {
      if (!validIds.has(key)) {
        state.answers.delete(key);
        hasRemovedStaleAnswer = true;
      }
    });
    if (hasRemovedStaleAnswer) {
      syncTotalsFromAnswers();
      persistAnswers();
    }
    populateSourceFilter(state.questions);
    applyFilters();
    updateScoreboard();
  } catch (error) {
    questionListEl.innerHTML =
      '<p>Veri yüklenemedi. Lütfen sayfayı yenileyin veya dosya yolunu doğrulayın.</p>';
    questionListEl.setAttribute('aria-busy', 'false');
    console.error('Soru verisi alınamadı', error);
  }
};

searchInput.addEventListener('input', () => applyFilters());
sourceFilter.addEventListener('change', () => applyFilters());
resetBtn.addEventListener('click', () => resetProgress());
themeToggleBtn.addEventListener('click', () => toggleTheme());
if (shuffleToggleBtn) {
  shuffleToggleBtn.addEventListener('click', () => toggleShuffle());
}

initTheme();
updateShuffleToggle();
bootstrap();

