// 엔진 B — 표를 막대로 바꾼다.
// 쓰는 법 : node timeline.js <파일.md> [--html 결과.html]
// 표 서식은 Docs/Guide/도면서식.md 에 있다.

const fs = require('fs');
const { parseFenced, parseTable, escapeHtml, parseArgs } = require('./common');

const FULL = '█';
const EMPTY = '·';
const MAX_WIDTH = 72;

// "1-8, 20-24" -> [[1,8],[20,24]]
function parseRanges(text) {
  const out = [];
  for (const piece of String(text).split(',')) {
    const m = /^\s*(\d+)\s*(?:-\s*(\d+))?\s*$/.exec(piece);
    if (!m) {
      continue;
    }
    const from = Number(m[1]);
    let to = from;
    if (m[2] !== undefined) {
      to = Number(m[2]);
    }
    out.push([from, to]);
  }
  return out;
}

function padRight(text, width) {
  let out = text;
  while (visualWidth(out) < width) {
    out += ' ';
  }
  return out;
}

// 한글은 터미널에서 두 칸을 먹는다. 막대 문자(█ ·)는 한 칸이다.
function visualWidth(text) {
  let width = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    const wide =
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0xa4cf) ||
      (code >= 0xac00 && code <= 0xd7a3) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff00 && code <= 0xff60);
    if (wide) {
      width += 2;
      continue;
    }
    width += 1;
  }
  return width;
}

function buildTimeline(block, errors) {
  const table = parseTable(block.lines);
  const nameCol = table.columns[0];
  const rangeCol = table.columns[1];
  const bars = [];
  let total = Number(block.header.total || 0);

  for (const row of table.rows) {
    const ranges = parseRanges(row[rangeCol]);
    if (ranges.length === 0) {
      errors.push(`'${row[nameCol]}' 의 프레임 '${row[rangeCol]}' 을 못 읽었다.`);
      continue;
    }
    for (const r of ranges) {
      if (r[1] >= r[0]) {
        continue;
      }
      errors.push(`'${row[nameCol]}' 구간 ${r[0]}-${r[1]} 은 끝이 시작보다 앞이다.`);
    }
    bars.push({ label: row[nameCol], ranges });
  }

  // total 을 적었으면 그 값이 기준이다. 넘는 구간은 오류로 잡고, 그림은 넘는 데까지 그린다.
  const declared = total;
  for (const bar of bars) {
    for (const r of bar.ranges) {
      total = Math.max(total, r[1]);
      if (declared === 0 || r[1] <= declared) {
        continue;
      }
      errors.push(`'${bar.label}' 구간 ${r[0]}-${r[1]} 이 적어 둔 총 길이 ${declared} 를 넘는다.`);
    }
  }

  return { bars, total };
}

function drawTimeline(block, errors) {
  const built = buildTimeline(block, errors);
  const total = built.total;
  let step = 1;
  if (total > MAX_WIDTH) {
    step = Math.ceil(total / MAX_WIDTH);
  }

  const labelWidth = Math.max(...built.bars.map((b) => visualWidth(b.label)), 4);
  const lines = [];
  lines.push(`${block.header.name || '이름 없음'} (${total}F)`);

  for (const bar of built.bars) {
    let out = '';
    for (let f = 1; f <= total; f += step) {
      const on = bar.ranges.some((r) => f >= r[0] && f <= r[1]);
      if (on) {
        out += FULL;
        continue;
      }
      out += EMPTY;
    }
    lines.push(`  ${padRight(bar.label, labelWidth)}  ${out}`);
  }

  if (step > 1) {
    lines.push(`  (한 칸 = ${step}프레임)`);
  }
  return { text: lines.join('\n'), built };
}

function drawPacing(block, errors) {
  const table = parseTable(block.lines);
  const unitCol = table.columns[0];
  const kindCol = table.columns[1];
  const levelCol = table.columns[2];
  const lines = [];
  lines.push(`${block.header.name || '페이싱'} (${block.header.unit || unitCol})`);

  let sameCount = 1;
  let last = null;

  for (const row of table.rows) {
    const level = Number(row[levelCol]);
    if (Number.isNaN(level) || level < 0 || level > 5) {
      errors.push(`${row[unitCol]} 의 강도 '${row[levelCol]}' 는 0~5 가 아니다.`);
      continue;
    }

    let bar = '';
    for (let i = 0; i < 5; i += 1) {
      if (i < level) {
        bar += FULL;
        continue;
      }
      bar += EMPTY;
    }
    lines.push(`  ${padRight(row[unitCol], 4)} ${padRight(row[kindCol], 6)} ${bar} ${level}`);

    if (level === last) {
      sameCount += 1;
    }
    if (level !== last) {
      sameCount = 1;
    }
    if (sameCount >= 3) {
      errors.push(`강도 ${level} 이 ${sameCount}번 이어진다. 높낮이를 번갈아 놓는다.`);
    }
    last = level;
  }

  return { text: lines.join('\n') };
}

const COUNT_WIDTH = 24;

function drawCount(block, errors) {
  const table = parseTable(block.lines);
  const slotCol = table.columns[0];
  const countCol = table.columns[1];
  const rows = table.rows;

  let goals = [];
  if (block.header.목표) {
    goals = block.header.목표.split(',').map(Number);
  }
  if (goals.length > 0 && goals.length !== rows.length) {
    errors.push(`목표 개수(${goals.length})가 표 줄 수(${rows.length})와 다르다.`);
  }

  const counts = rows.map((r) => Number(r[countCol])).filter((v) => !Number.isNaN(v));
  const biggest = Math.max(...counts, 1);
  let step = 1;
  if (biggest > COUNT_WIDTH) {
    step = Math.ceil(biggest / COUNT_WIDTH);
  }

  const labelWidth = Math.max(...rows.map((r) => visualWidth(r[slotCol])), 3);
  const lines = [];
  lines.push(`${block.header.name || '분포'}`);

  rows.forEach((row, i) => {
    const count = Number(row[countCol]);
    if (Number.isNaN(count)) {
      errors.push(`'${row[slotCol]}' 의 개수 '${row[countCol]}' 를 못 읽었다.`);
      return;
    }
    let bar = '';
    for (let i2 = 0; i2 < Math.round(count / step); i2 += 1) {
      bar += FULL;
    }

    let tail = String(count);
    if (goals.length > 0) {
      tail = `${count} / ${goals[i]}`;
    }
    const goalIsZero = goals.length > 0 && goals[i] === 0;
    let note = '';
    if (count === 0 && !goalIsZero) {
      note = '   <- 구멍';
    }
    if (goals.length > 0 && count !== goals[i] && count !== 0) {
      let diff = String(count - goals[i]);
      if (count > goals[i]) {
        diff = `+${diff}`;
      }
      note = `   <- 목표와 ${diff}`;
    }
    lines.push(`  ${padRight(row[slotCol], labelWidth)} ${padRight(bar, COUNT_WIDTH)} ${tail}${note}`);

    if (count !== 0 || goalIsZero) {
      return;
    }
    errors.push(`'${row[slotCol]}' 칸이 0개다.`);
  });

  if (step > 1) {
    lines.push(`  (한 칸 = ${step}개)`);
  }

  return { text: lines.join('\n') };
}

function renderHtml(results) {
  const parts = [];
  parts.push('<!doctype html><meta charset="utf-8"><title>타임라인</title>');
  parts.push(`<style>
    body { background:#0f1013; color:#e8e8ea; font-family:"Malgun Gothic",sans-serif; padding:24px; }
    h2 { font-size:16px; margin:24px 0 8px; }
    pre { background:#15161a; border:1px solid #2a2b31; border-radius:4px; padding:12px;
          font:13px/1.5 Consolas,monospace; color:#cfd1d8; overflow-x:auto; }
    .bad { color:#ff8a8a; font-size:13px; }
    ul { margin:4px 0 0 18px; padding:0; }
  </style>`);

  for (const r of results) {
    parts.push(`<h2>${escapeHtml(r.title)}</h2>`);
    parts.push(`<pre>${escapeHtml(r.text)}</pre>`);
    if (r.errors.length === 0) {
      continue;
    }
    parts.push('<ul class="bad">');
    for (const e of r.errors) {
      parts.push(`<li>${escapeHtml(e)}</li>`);
    }
    parts.push('</ul>');
  }

  return parts.join('\n');
}

function draw(block, errors) {
  if (block.tag === 'timeline') {
    return drawTimeline(block, errors);
  }
  if (block.tag === 'pacing') {
    return drawPacing(block, errors);
  }
  return drawCount(block, errors);
}

function run(files, flags) {
  const results = [];
  let bad = 0;

  for (const file of files) {
    const blocks = parseFenced(fs.readFileSync(file, 'utf8'), ['timeline', 'pacing', 'count']);
    if (blocks.length === 0 && files.length === 1) {
      console.log('timeline · pacing · count 블록을 못 찾았다.');
    }

    for (const block of blocks) {
      const errors = [];
      const drawn = draw(block, errors);
      const title = `${block.header.name || block.tag} (${block.tag})`;
      results.push({ title, text: drawn.text, errors });
      bad += errors.length;

      console.log(`
[${title}]`);
      console.log(drawn.text);
      for (const e of errors) {
        console.log(`  ! ${e}`);
      }
    }
  }

  if (flags['--html']) {
    fs.writeFileSync(flags['--html'], renderHtml(results), 'utf8');
    console.log(`
HTML 저장 : ${flags['--html']}`);
  }

  console.log(`
알림 ${bad}개`);
  return bad;
}

function main() {
  const { files, flags } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.log('쓰는 법 : node timeline.js <파일.md ...> [--html 결과.html]');
    process.exit(2);
  }

  if (run(files, flags) > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseRanges, buildTimeline, drawTimeline, drawPacing, drawCount, draw };
