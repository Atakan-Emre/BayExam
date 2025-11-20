#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const workspace = '/Users/atakanemre/BayExam';
const sorularDir = path.join(workspace, 'Sorular');
const inputFiles = [
  '1.txt',
  '2.txt',
  '3.txt',
  '4.txt',
  '5.txt',
  'baycikmis1.txt',
  'Baycikmis2.txt',
  'baycikmis3.txt',
  'Baycikmis4.txt',
];
const outputFile = path.join(workspace, 'data', 'questions.json');

const optionPattern = /^([A-ZÇĞİÖŞÜa-zçğıöşü])[.\)\-:]\s*(.*)$/u;
const answerPattern = /^(?:Doğru\s+)?Cevap[:：]?\s*(.*)$/iu;

const normalizeLine = (line) =>
  line.replace(/\u2028/g, ' ').replace(/\r/g, '').trim();

const questionStartRegex = /^\s*\**\s*(?:Soru\s*)?(?:S-)?(\d+)[\)\.]/;
const isLikelyQuestionStart = (line) => {
  const trimmed = line.trimStart();
  // Nokta ile başlayan sorular: "1. Soru metni" veya "Soru 1) Soru metni" veya "S-1) Soru"
  // Boşlukla başlayanlar da: " 5. Soru metni"
  // "•" ile başlayan sorular: "• Soru metni"
  // "1)" ile başlayan sorular (soru numarası olmadan sadece parantez)
  return questionStartRegex.test(trimmed) || 
         /^\s*\d+\.\s+[A-ZÇĞİÖŞÜĞ]/.test(trimmed) ||
         /^\s*S-\d+\)/.test(trimmed) ||
         /^\s*\d+\)/.test(trimmed) ||
         /^\s*[•]\s*[A-ZÇĞİÖŞÜĞ]/.test(trimmed);
};

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
      // Farklı formatları destekle: "1)", "Soru 1)", "1.", "S-1)", " 5.", "•" vb.
      let numberMatch = line.match(questionStartRegex);
      if (!numberMatch) {
        // "1. Soru metni" veya " 5. Soru metni" formatı için
        const dotMatch = line.match(/^\s*(\d+)\.\s+/);
        if (dotMatch) {
          numberMatch = ['', dotMatch[1]];
        }
        // "S-1) Soru" formatı için
        if (!numberMatch) {
          const sFormatMatch = line.match(/^\s*S-(\d+)\)/);
          if (sFormatMatch) {
            numberMatch = ['', sFormatMatch[1]];
          }
        }
        // "1) Soru" formatı için (sadece parantez)
        if (!numberMatch) {
          const parenMatch = line.match(/^\s*(\d+)\)/);
          if (parenMatch) {
            numberMatch = ['', parenMatch[1]];
          }
        }
        // "• Soru" formatı için - blok numarası kullan
        if (!numberMatch && /^\s*[•]/.test(line)) {
          numberMatch = ['', String(blocks.length + 1)];
        }
      }
      const number = numberMatch ? Number(numberMatch[1]) : 0;
      // Soru satırını temizle - tüm formatları destekle
      const cleanedLine = line
        .replace(/^\s*\**\s*(?:Soru\s*)?(?:S-)?\d+[\)\.]\s*/, '')
        .replace(/^\s*\d+\)\s*/, '')  // "1)" formatı için
        .replace(/^\s*[•]\s*/, '')     // "•" formatı için
        .replace(/^ABDULAZİZ\s+BEHÇET\s+/, '')
        .trim();
      current = {
        number,
        questionLine: cleanedLine,
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
  let markedAnswer = null;
  let index = startIndex;

  while (index < lines.length) {
    const raw = normalizeLine(lines[index]);
    if (!raw) {
      index += 1;
      continue;
    }
    
    // Tek satırda birden fazla seçenek olabilir (örn: "A) ... B) ... C) ...")
    const allMatches = [...raw.matchAll(/([A-ZÇĞİÖŞÜa-zçğıöşü])[\).\-:]\s*([^]*?)(?=\s+[A-ZÇĞİÖŞÜa-zçğıöşü][\).\-:]|\s*$)/g)];
    if (allMatches && allMatches.length > 1) {
      for (const match of allMatches) {
        const [, label, text] = match;
        let cleanText = text.trim();
        // Büyük harfe çevir
        const upperLabel = label.toUpperCase();
        
        // * veya ++ işaretlerini kontrol et
        const hasStarMarker = /\*\s*$/.test(cleanText) || cleanText.includes(' * ');
        const hasPlusMarker = /\+\+\s*$/.test(cleanText) || cleanText.includes(' ++ ');
        
        if (hasStarMarker) {
          cleanText = cleanText.replace(/\s*\*\s*/g, ' ').trim();
          options.push({ label: upperLabel, text: cleanText });
          if (!markedAnswer) {
            markedAnswer = { label: upperLabel, text: cleanText };
          }
        } else if (hasPlusMarker) {
          cleanText = cleanText.replace(/\s*\+\+\s*/g, ' ').trim();
          options.push({ label: upperLabel, text: cleanText });
          if (!markedAnswer) {
            markedAnswer = { label: upperLabel, text: cleanText };
          }
        } else {
          options.push({ label: upperLabel, text: cleanText });
        }
      }
      index += 1;
      continue;
    }
    
    const match = raw.match(optionPattern);
    if (!match) {
      break;
    }
    const [, label, text] = match;
    let cleanText = text.trim();
    // Büyük harfe çevir
    const upperLabel = label.toUpperCase();
    
    // * veya ++ işaretlerini kontrol et (satır içinde veya sonunda)
    const hasStarMarker = /\*\s*$/.test(cleanText) || cleanText.includes(' * ');
    const hasPlusMarker = /\+\+\s*$/.test(cleanText) || cleanText.includes(' ++ ');
    
    if (hasStarMarker) {
      cleanText = cleanText.replace(/\s*\*\s*/g, ' ').trim();
      options.push({ label: upperLabel, text: cleanText });
      if (!markedAnswer) {
        markedAnswer = { label: upperLabel, text: cleanText };
      }
    } else if (hasPlusMarker) {
      cleanText = cleanText.replace(/\s*\+\+\s*/g, ' ').trim();
      options.push({ label: upperLabel, text: cleanText });
      if (!markedAnswer) {
        markedAnswer = { label: upperLabel, text: cleanText };
      }
    } else {
      options.push({ label: upperLabel, text: cleanText });
    }
    index += 1;
  }

  return { options, nextIndex: index, markedAnswer };
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

  const letterMatch = cleaned.match(/^([A-ZÇĞİÖŞÜa-zçğıöşü])([\).]|$)\s*(.*)$/u);
  if (letterMatch) {
    const [, rawLabel, punct, rest] = letterMatch;
    const possibleLabel = rawLabel.toUpperCase();
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

  const { options, nextIndex: afterOptions, markedAnswer } = collectOptions(lines, cursor);
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
  
  // PDF'lerdeki * işaretli cevabı kullan (varsa)
  if (markedAnswer && !answerInfo.label && !answerInfo.text) {
    answerInfo.label = markedAnswer.label;
    answerInfo.text = markedAnswer.text;
  }
  
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
  const filePath = path.join(sorularDir, file);
  if (!fs.existsSync(filePath)) {
    console.warn(`Dosya bulunamadı: ${filePath}`);
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

