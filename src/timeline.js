// 엔진 B — 표를 막대로 바꾼다.
// 쓰는 법 : node timeline.js <파일.md> [--html 결과.html]
// 표 서식은 Docs/Guide 아래 도면서식.md 에 있다.

const fs = require('fs');
const { parseFenced, parseTable, escapeHtml, parseArgs, isExample } = require('./common');

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

// 빈 칸을 Number() 로 읽으면 ''  -> 0 이라 못 적은 값이 0 으로 둔갑한다.
// 못 읽은 것은 0 이 아니라 못 읽은 것이다. 읽었으면 숫자, 못 읽었으면 null 을 돌려준다.
function 숫자읽기(text) {
  if (text === undefined || text === null) {
    return null;
  }
  const 다듬은 = String(text).trim();
  if (다듬은 === '') {
    return null;
  }
  const value = Number(다듬은);
  if (Number.isNaN(value)) {
    return null;
  }
  return value;
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
  let total = 0;
  if (block.header.total !== undefined) {
    const 읽은값 = 숫자읽기(block.header.total);
    if (읽은값 === null || 읽은값 < 1) {
      errors.push(`총 길이 '${block.header.total}' 을 못 읽었다. 제일 큰 프레임 번호로 쟀다.`);
    }
    if (읽은값 !== null && 읽은값 >= 1) {
      total = 읽은값;
    }
  }

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

// 검사 11 — 쉼터 없음. 강도 4 이상이 몇 칸까지 이어져도 되나.
const HARD_LEVEL = 4;
const DEFAULT_REST_GAP = 3;

function drawPacing(block, errors) {
  const table = parseTable(block.lines);
  const unitCol = table.columns[0];
  const kindCol = table.columns[1];
  const levelCol = table.columns[2];
  const lines = [];
  lines.push(`${block.header.name || '페이싱'} (${block.header.unit || unitCol})`);

  let sameCount = 1;
  let last = null;

  // 검사 11. 센 구간이 몇 개 이어졌나. 한도를 넘는 순간 한 번만 알리고 그 줄기가 끝날 때까지 입을 닫는다.
  let restGap = DEFAULT_REST_GAP;
  const 적은값 = block.header.쉼터간격;
  if (적은값 !== undefined) {
    restGap = Number(적은값);
    if (Number.isNaN(restGap) || restGap < 1) {
      errors.push(`쉼터간격 '${적은값}' 은 1 이상 숫자가 아니다. 기본값 ${DEFAULT_REST_GAP} 으로 쟀다.`);
      restGap = DEFAULT_REST_GAP;
    }
  }
  let hardRun = 0;
  let toldRest = false;

  for (const row of table.rows) {
    const level = 숫자읽기(row[levelCol]);
    if (level === null) {
      errors.push(`${row[unitCol]} 의 강도 '${row[levelCol]}' 를 못 읽었다.`);
      hardRun = 0;
      toldRest = false;
      continue;
    }
    if (level < 0 || level > 5) {
      errors.push(`${row[unitCol]} 의 강도 '${row[levelCol]}' 는 0~5 가 아니다.`);
      hardRun = 0;
      toldRest = false;
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

    if (level < HARD_LEVEL) {
      hardRun = 0;
      toldRest = false;
      continue;
    }
    hardRun += 1;
    if (hardRun <= restGap || toldRest) {
      continue;
    }
    toldRest = true;
    errors.push(
      `강도 ${HARD_LEVEL} 이상이 ${hardRun}구간 이어진다. 쉼터간격 ${restGap} 을 넘었다. 쉴 틈을 넣는다.`
    );
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
  if (block.header.목표 !== undefined) {
    goals = block.header.목표.split(',').map(숫자읽기);
    if (goals.some((v) => v === null)) {
      errors.push(`목표 '${block.header.목표}' 를 못 읽었다. 목표 없이 그렸다.`);
      goals = [];
    }
  }
  if (goals.length > 0 && goals.length !== rows.length) {
    errors.push(`목표 개수(${goals.length})가 표 줄 수(${rows.length})와 다르다.`);
  }

  const counts = rows.map((r) => 숫자읽기(r[countCol])).filter((v) => v !== null);
  const biggest = Math.max(...counts, 1);
  let step = 1;
  if (biggest > COUNT_WIDTH) {
    step = Math.ceil(biggest / COUNT_WIDTH);
  }

  const labelWidth = Math.max(...rows.map((r) => visualWidth(r[slotCol])), 3);
  const lines = [];
  lines.push(`${block.header.name || '분포'}`);

  rows.forEach((row, i) => {
    const count = 숫자읽기(row[countCol]);
    if (count === null) {
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

// 한 블록을 그리고 검사한다. `예시=참` 이면 그리기만 하고 알림은 버린다.
function checkBlock(block) {
  const errors = [];
  const drawn = draw(block, errors);
  if (isExample(block.header)) {
    return { text: drawn.text, errors: [], 예시: true };
  }
  return { text: drawn.text, errors, 예시: false };
}

function run(files, flags) {
  const results = [];
  let bad = 0;
  let 예시수 = 0;
  let 블록수 = 0;

  for (const file of files) {
    const blocks = parseFenced(fs.readFileSync(file, 'utf8'), ['timeline', 'pacing', 'count']);
    블록수 += blocks.length;

    for (const block of blocks) {
      const checked = checkBlock(block);
      const title = `${block.header.name || block.tag} (${block.tag})`;
      results.push({ title, text: checked.text, errors: checked.errors });
      bad += checked.errors.length;
      if (checked.예시) {
        예시수 += 1;
      }

      console.log(`
[${title}]`);
      console.log(checked.text);
      if (checked.예시) {
        console.log('  예시 블록이라 검사를 건너뛴다');
      }
      for (const e of checked.errors) {
        console.log(`  ! ${e}`);
      }
    }
  }

  if (블록수 === 0) {
    console.log('timeline · pacing · count 블록을 못 찾았다.');
  }

  if (flags['--html']) {
    fs.writeFileSync(flags['--html'], renderHtml(results), 'utf8');
    console.log(`
HTML 저장 : ${flags['--html']}`);
  }

  let 꼬리 = '';
  if (예시수 > 0) {
    꼬리 = ` · 예시 ${예시수}개 건너뜀`;
  }
  console.log(`
알림 ${bad}개${꼬리}`);
  return { bad, 블록수 };
}

function main() {
  const { files, flags } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.log('쓰는 법 : node timeline.js <파일.md ...> [--html 결과.html]');
    process.exit(2);
  }

  const 결과 = run(files, flags);

  // 블록이 하나도 없으면 검사한 것이 없다. tilemap·lint 와 같이 exit 2 다.
  if (결과.블록수 === 0) {
    process.exit(2);
  }

  if (결과.bad > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  // 모르는 프로필·안 닫힌 펜스 같은 쓰는 법 오류는 스택 대신 한 줄로 알린다.
  try {
    main();
  } catch (e) {
    console.log(e.message);
    process.exit(2);
  }
}

module.exports = { parseRanges, buildTimeline, drawTimeline, drawPacing, drawCount, draw, checkBlock };
