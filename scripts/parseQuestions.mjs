#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspace = '/Users/atakanemre/BayExam';
const inputFiles = ['1.txt', '2.txt', '3.txt', '4.txt', '5.txt'];
const outputFile = path.join(workspace, 'data', 'questions.json');

const optionPattern = /^([A-ZÇĞİÖŞÜ])[.\)\-:]\s*(.*)$/u;
const answerPattern = /^(?:Doğru\s+)?Cevap[:：]?\s*(.*)$/iu;

const normalizeLine = (line) =>
  line.replace(/\u2028/g, ' ').replace(/\r/g, '').trim();

const questionStartRegex = /^\s*\**\s*(\d+)\)/;
const isLikelyQuestionStart = (line) => questionStartRegex.test(line.trimStart());

const splitBlocks = (content) => {
  const lines = content.split('\n');
  const blocks = [];
  let current = null;

  for (const rawLine of lines) {
    const line = rawLine.replace(/\u2028/g, ' ');
    if (isLikelyQuestionStart(line)) {
      if (current) {
        blocks.push(current);
      }
      const [, number] = line.match(questionStartRegex) || [];
      current = {
        number: Number(number),
        questionLine: line.replace(/^\s*\**\s*/, '').trim(),
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    blocks.push(current);
  }

  return blocks;
};

const collectQuestionText = (lines) => {
  const questionParts = [];
  let index = 0;

  while (index < lines.length) {
    const line = normalizeLine(lines[index]);
    if (!line) {
      index += 1;
      continue;
    }
    if (optionPattern.test(line) || answerPattern.test(line) || /^Yanlış/i.test(line) || /^Açıklama/i.test(line) || /^🟦/u.test(line)) {
      break;
    }
    questionParts.push(line.replace(/^\*\*/g, '').replace(/\*\*$/g, ''));
    index += 1;
  }

  return { text: questionParts.join(' ').trim(), nextIndex: index };
};

const collectOptions = (lines, startIndex) => {
  const options = [];
  let index = startIndex;

  while (index < lines.length) {
    const raw = normalizeLine(lines[index]);
    if (!raw) {
      index += 1;
      continue;
    }
    const match = raw.match(optionPattern);
    if (!match) {
      break;
    }
    const [, label, text] = match;
    options.push({ label, text: text.trim() });
    index += 1;
  }

  return { options, nextIndex: index };
};

const extractAnswer = (line, options) => {
  if (!line) return { text: '', label: '', inlineExplanation: '' };
  const [, answerRaw = ''] = line.match(answerPattern) || [];
  let cleaned = answerRaw.replace(/[_*]/g, '').trim();

  let inlineExplanation = '';
  const explanationSplit = cleaned.split(/Aç(?:ı|i)klama[:：]?\s*/i);
  if (explanationSplit.length > 1) {
    cleaned = explanationSplit.shift().trim();
    inlineExplanation = explanationSplit.join(' ').trim();
  }

  const letterMatch = cleaned.match(/^([A-ZÇĞİÖŞÜ])([\).]|$)\s*(.*)$/u);
  if (letterMatch) {
    const [, possibleLabel, punct, rest] = letterMatch;
    const option = options.find((opt) => opt.label === possibleLabel);
    const hasExplicitPunct = punct && punct.trim().length > 0;
    if (option || hasExplicitPunct) {
      const textPart = rest && rest.trim() ? rest.trim() : option?.text || '';
      return {
        label: possibleLabel,
        text: textPart,
        inlineExplanation,
      };
    }
  }

  return { label: '', text: cleaned, inlineExplanation };
};

const collectExplanation = (lines, startIndex) => {
  const explanationParts = [];
  let index = startIndex;

  while (index < lines.length) {
    const raw = normalizeLine(lines[index]);
    if (!raw) {
      index += 1;
      continue;
    }

    if (/^🟦/u.test(raw) || /^\d+\s*-\s*[A-ZÇĞİÖŞÜ]/u.test(raw)) {
      break;
    }
    if (isLikelyQuestionStart(raw)) {
      break;
    }

    if (/^(Açıklama|AçExplanation)/i.test(raw)) {
      const [, after = ''] = raw.match(/^(?:Açıklama|AçExplanation)\s*[:：]?\s*(.*)$/i) || [];
      if (after) {
        explanationParts.push(after.trim());
      }
    } else if (/^(Yanlış ifade)/i.test(raw)) {
      const [, after = ''] = raw.match(/^Yanlış ifade\s*[:：]?\s*(.*)$/i) || [];
      explanationParts.push(after ? `Yanlış ifade: ${after.trim()}` : raw);
    } else {
      explanationParts.push(raw);
    }

    index += 1;
  }

  return explanationParts.join(' ').trim();
};

const parseBlock = (block, source) => {
  const lines = block.lines;
  const { text: questionText, nextIndex } = collectQuestionText(lines);
  let cursor = nextIndex;

  const { options, nextIndex: afterOptions } = collectOptions(lines, cursor);
  cursor = afterOptions;

  let answerLine = '';
  while (cursor < lines.length) {
    const line = normalizeLine(lines[cursor]);
    if (!line) {
      cursor += 1;
      continue;
    }
    if (answerPattern.test(line)) {
      answerLine = line;
      cursor += 1;
      break;
    }
    cursor += 1;
  }

  const answerInfo = extractAnswer(answerLine, options);
  const explanation = [answerInfo.inlineExplanation, collectExplanation(lines, cursor)]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    source,
    number: block.number,
    question: questionText || block.questionLine.replace(/^\d+\)\s*/, '').trim(),
    options,
    answer: {
      label: answerInfo.label,
      text: answerInfo.text,
    },
    explanation,
  };
};

const allQuestions = [];
let globalId = 1;

for (const file of inputFiles) {
  const filePath = path.join(workspace, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Dosya bulunamadı: ${file}`);
    continue;
  }
  const rawContent = fs.readFileSync(filePath, 'utf8').replace(/\r/g, '').replace(/\u2028/g, '\n');
  const blocks = splitBlocks(rawContent);
  for (const block of blocks) {
    const parsed = parseBlock(block, file);
    if (!parsed.question || !parsed.answer.text) {
      continue;
    }
    allQuestions.push({
      id: globalId++,
      ...parsed,
    });
  }
}

fs.writeFileSync(outputFile, JSON.stringify(allQuestions, null, 2), 'utf8');
console.log(`Toplam ${allQuestions.length} soru ${outputFile} dosyasına kaydedildi.`);

