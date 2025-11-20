const questionListEl = document.getElementById('questionList');
const correctCountEl = document.getElementById('correctCount');
const wrongCountEl = document.getElementById('wrongCount');
const answeredCountEl = document.getElementById('answeredCount');
const totalCountEl = document.getElementById('totalCount');
const searchInput = document.getElementById('searchInput');
const sourceFilter = document.getElementById('sourceFilter');
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
};

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
  updateCardMetrics();
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
    btn.disabled = true;
  });

  feedbackEl.hidden = false;
  feedbackEl.classList.toggle('success', storedAnswer.status === 'correct');
  feedbackEl.classList.toggle('error', storedAnswer.status !== 'correct');
  feedbackStatus.textContent = storedAnswer.status === 'correct' ? 'Doğru!' : 'Yanlış cevap';
  feedbackText.textContent =
    question.explanation || 'Bu soru için açıklama henüz eklenmemiş.';
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
      chipEl.hidden = false;
      chipEl.textContent = formatScoreChip();
    };
    chipEl.textContent = formatScoreChip();

    card.dataset.questionId = question.id;
    cardKicker.textContent = `Soru ${idx + 1}`;
    cardTitle.textContent = question.question;
    sourceBadge.textContent = formatSourceLabel(question.source);

    const choices = question.renderOptions;
    choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'option-btn';
      btn.textContent = choice.text;
      btn.dataset.optionLabel = choice.label || '';
      btn.dataset.optionText = choice.text;
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

  state.renderedQuestions = state.questions.filter((question) => {
    const matchesSearch = !term || normalize(question.question).includes(term);
    const matchesSource = !source || question.source === source;
    return matchesSearch && matchesSource;
  });

  renderQuestions();
};

const resetProgress = () => {
  state.answers.clear();
  state.totals.correct = 0;
  state.totals.incorrect = 0;
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
    btn.disabled = true;
  });

  feedbackEl.hidden = false;
  feedbackEl.classList.toggle('success', isCorrect);
  feedbackEl.classList.toggle('error', !isCorrect);
  feedbackStatus.textContent = isCorrect ? 'Doğru!' : 'Yanlış cevap';
  feedbackText.textContent =
    question.explanation || 'Bu soru için açıklama henüz eklenmemiş.';
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

    state.questions = data.map((question) => ({
      ...question,
      renderOptions: buildOptionSet(question, answersPool),
    }));
    state.renderedQuestions = [...state.questions];
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

initTheme();
bootstrap();

