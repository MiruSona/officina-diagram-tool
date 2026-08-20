// 타일맵 검증기 + 렌더러.
// 쓰는 법 : node tilemap.js <파일.md> [--html 결과.html] [--preview]
// 문자 약속은 Docs/Guide/타일기호.md, 프로필은 profiles.json 에 있다.

const fs = require('fs');
const path = require('path');

const PROFILE_PATH = path.join(__dirname, 'profiles.json');

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

function getProfile(profiles, name) {
  const found = profiles[name];
  if (!found) {
    throw new Error(`프로필 '${name}' 이 profiles.json 에 없다.`);
  }
  if (!found.상속) {
    return found;
  }

  const parent = getProfile(profiles, found.상속);
  const merged = Object.assign({}, parent, found);
  merged.문자 = Object.assign({}, parent.문자, found.문자 || {});
  return merged;
}

function pickProfileName(header, profiles) {
  if (header.profile) {
    return header.profile;
  }

  const move = header.move || 'flat';
  const names = Object.keys(profiles).filter((n) => !n.startsWith('_'));
  for (const name of names) {
    if (profiles[name].이동 === move && !profiles[name].상속) {
      return name;
    }
  }
  return '기본';
}

// ```tilemap name="첫 구간" move=flat  ->  { name: '첫 구간', move: 'flat' }
function parseHeader(line) {
  const header = {};
  const re = /(\w+)=("[^"]*"|\S+)/g;
  let m = re.exec(line);
  while (m) {
    header[m[1]] = m[2].replace(/^"|"$/g, '');
    m = re.exec(line);
  }
  return header;
}

// 범례: P=시작 #=벽  ->  { P: '시작', '#': '벽' }
function parseLegend(line) {
  const legend = {};
  const body = line.replace(/^범례\s*:?\s*/, '');
  const re = /(\S)=(\S+)/g;
  let m = re.exec(body);
  while (m) {
    legend[m[1]] = m[2];
    m = re.exec(body);
  }
  return legend;
}

// 마크다운에서 tilemap 코드펜스를 뽑는다. 코드펜스가 없으면 파일 전체를 한 블록으로 본다.
function parseBlocks(text) {
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;

  for (const line of lines) {
    if (current === null) {
      if (/^```+\s*tilemap\b/.test(line)) {
        current = { header: parseHeader(line), grid: [], legend: {} };
      }
      continue;
    }

    if (/^```+\s*$/.test(line)) {
      blocks.push(current);
      current = null;
      continue;
    }

    current.grid.push(line);
  }

  if (blocks.length === 0 && !/```/.test(text)) {
    blocks.push({ header: {}, grid: lines, legend: {} });
  }

  // 범례와 해답은 그리드 바로 아래 줄이라 블록 안에 같이 들어온다. 여기서 떼어 낸다.
  for (const block of blocks) {
    const kept = [];
    for (const line of block.grid) {
      if (/^범례/.test(line)) {
        block.legend = parseLegend(line);
        continue;
      }
      if (/^해답/.test(line) || line.trim() === '') {
        continue;
      }
      kept.push(line);
    }
    block.grid = kept;
  }

  return blocks;
}

function checkRowLength(grid, errors) {
  if (grid.length === 0) {
    errors.push({ 검사: '1', 글: '그리드가 비어 있다.' });
    return;
  }

  const width = grid[0].length;
  grid.forEach((row, y) => {
    if (row.length === width) {
      return;
    }
    errors.push({
      검사: '1',
      글: `${y + 1}번째 줄 길이가 ${row.length} 다. 첫 줄(${width})과 다르다.`,
    });
  });
}

function checkKnownChars(grid, profile, legend, errors) {
  const known = profile.문자;
  const seen = new Set();

  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (known[ch] || seen.has(ch)) {
        continue;
      }
      seen.add(ch);
      errors.push({
        검사: '2',
        글: `'${ch}' 는 문자표에 없다. (처음 나온 곳 ${x + 1}열 ${y + 1}행)`,
      });
    }
  });

  for (const ch of Object.keys(legend)) {
    if (known[ch]) {
      continue;
    }
    errors.push({ 검사: '2', 글: `범례에 적힌 '${ch}' 가 문자표에 없다.` });
  }
}

function findChar(grid, ch) {
  const spots = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === ch) {
        spots.push({ x, y });
      }
    }
  });
  return spots;
}

function checkStart(grid, errors) {
  const spots = findChar(grid, 'P');
  if (spots.length === 1) {
    return spots[0];
  }

  errors.push({ 검사: '3', 글: `시작점 P 가 ${spots.length}개다. 정확히 1개여야 한다.` });
  if (spots.length === 0) {
    return null;
  }
  return spots[0];
}

// 검사 4b. 시작점에서 사방으로 번져 나가(flood fill) 닿는 칸을 표시한다.
// 문에 막히면 그때까지 주운 열쇠 수만큼만 연다. 열쇠가 문 뒤에 있으면 여기서 걸린다.
function checkReachable(grid, profile, start, errors) {
  if (!start) {
    return null;
  }

  const chars = profile.문자;
  const seen = new Set();
  const doors = new Set();
  let keysFound = 0;
  let keysUsed = 0;

  const key = (x, y) => `${x},${y}`;
  const at = (x, y) => {
    if (y < 0 || y >= grid.length) {
      return null;
    }
    if (x < 0 || x >= grid[y].length) {
      return null;
    }
    return chars[grid[y][x]];
  };

  const flood = (from) => {
    const queue = [from];
    while (queue.length > 0) {
      const cur = queue.shift();
      const spec = at(cur.x, cur.y);
      if (!spec || seen.has(key(cur.x, cur.y))) {
        continue;
      }
      if (!spec.지나감 && !spec.문) {
        continue;
      }
      if (spec.문 && !cur.opened) {
        doors.add(key(cur.x, cur.y));
        continue;
      }

      seen.add(key(cur.x, cur.y));
      doors.delete(key(cur.x, cur.y));
      if (spec.열쇠) {
        keysFound += 1;
      }

      queue.push({ x: cur.x + 1, y: cur.y });
      queue.push({ x: cur.x - 1, y: cur.y });
      queue.push({ x: cur.x, y: cur.y + 1 });
      queue.push({ x: cur.x, y: cur.y - 1 });
    }
  };

  flood(start);

  while (doors.size > 0 && keysFound - keysUsed > 0) {
    const spot = doors.values().next().value;
    const parts = spot.split(',');
    keysUsed += 1;
    flood({ x: Number(parts[0]), y: Number(parts[1]), opened: true });
  }

  const stuck = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const spec = chars[row[x]];
      if (!spec || !spec.지나감 || seen.has(key(x, y))) {
        continue;
      }
      stuck.push({ x, y, ch: row[x] });
    }
  });

  if (stuck.length > 0) {
    const shown = stuck.slice(0, 8).map((s) => `${s.x + 1}열 ${s.y + 1}행 '${s.ch}'`);
    let 글 = `걸어서 못 가는 칸이 ${stuck.length}개 있다. ${shown.join(', ')}`;
    if (stuck.length > shown.length) {
      글 += ' …';
    }
    errors.push({ 검사: '4b', 글 });
  }

  if (doors.size > 0) {
    errors.push({
      검사: '4b',
      글: `못 여는 문이 ${doors.size}개 있다. 주운 열쇠 ${keysFound}개, 쓴 열쇠 ${keysUsed}개.`,
    });
  }

  for (const exit of findChar(grid, 'X')) {
    if (seen.has(key(exit.x, exit.y))) {
      continue;
    }
    errors.push({ 검사: '4b', 글: `출구 X (${exit.x + 1}열 ${exit.y + 1}행) 에 못 간다.` });
  }

  return seen;
}

function validate(block, profiles) {
  const name = pickProfileName(block.header, profiles);
  const profile = getProfile(profiles, name);
  const on = profile.검사 || [];
  const errors = [];

  if (on.includes('1')) {
    checkRowLength(block.grid, errors);
  }
  if (on.includes('2')) {
    checkKnownChars(block.grid, profile, block.legend, errors);
  }

  let start = null;
  if (on.includes('3')) {
    start = checkStart(block.grid, errors);
  }
  if (on.includes('4b')) {
    checkReachable(block.grid, profile, start, errors);
  }

  return { profileName: name, profile, errors };
}

function renderPreview(grid, profile) {
  const chars = profile.문자;
  const rows = grid.map((row) => {
    let out = '';
    for (let x = 0; x < row.length; x += 1) {
      const spec = chars[row[x]];
      if (spec && spec.보기) {
        out += spec.보기;
        continue;
      }
      out += row[x];
    }
    return out;
  });
  return rows.join('\n');
}

const TILE_COLOR = {
  '#': '#4a4a52',
  '.': '#15161a',
  P: '#4ea1ff',
  E: '#ff5a5a',
  C: '#ffcc4d',
  S: '#7de08a',
  K: '#ffcc4d',
  '+': '#b07a3a',
  X: '#7de08a',
  '^': '#ff5a5a',
  '~': '#b07a3a',
};

function renderHtml(blocks, results) {
  const parts = [];
  parts.push('<!doctype html><meta charset="utf-8"><title>타일맵 도면</title>');
  parts.push(`<style>
    body { background:#0f1013; color:#e8e8ea; font-family:"Malgun Gothic",sans-serif; padding:24px; }
    h2 { font-size:16px; margin:24px 0 8px; }
    .grid { display:grid; gap:1px; background:#0a0a0c; width:max-content;
            border:1px solid #2a2b31; padding:1px; }
    .cell { width:18px; height:18px; font:11px/18px Consolas,monospace;
            text-align:center; color:#0f1013; }
    .meta { color:#8d8f98; font-size:12px; margin-bottom:8px; }
    .bad { color:#ff8a8a; font-size:13px; }
    .ok { color:#7de08a; font-size:13px; }
    ul { margin:4px 0 0 18px; padding:0; }
  </style>`);

  blocks.forEach((block, i) => {
    const result = results[i];
    const width = block.grid[0] ? block.grid[0].length : 0;
    parts.push(`<h2>${block.header.name || `도면 ${i + 1}`}</h2>`);
    parts.push(
      `<div class="meta">프로필 ${result.profileName} · 이동 ${result.profile.이동} · ` +
        `${width}×${block.grid.length}</div>`
    );

    parts.push(`<div class="grid" style="grid-template-columns:repeat(${width},18px)">`);
    for (const row of block.grid) {
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        const color = TILE_COLOR[ch] || '#6b6d77';
        let label = ch;
        if (ch === '.' || ch === '#') {
          label = '';
        }
        parts.push(`<div class="cell" style="background:${color}">${label}</div>`);
      }
    }
    parts.push('</div>');

    if (result.errors.length === 0) {
      parts.push('<p class="ok">문제 없음</p>');
      return;
    }
    parts.push('<ul class="bad">');
    for (const e of result.errors) {
      parts.push(`<li>검사 ${e.검사} — ${e.글}</li>`);
    }
    parts.push('</ul>');
  });

  return parts.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--') && !a.endsWith('.html'));
  if (!file) {
    console.log('쓰는 법 : node tilemap.js <파일.md> [--html 결과.html] [--preview]');
    process.exit(2);
  }

  const profiles = loadProfiles();
  const blocks = parseBlocks(fs.readFileSync(file, 'utf8'));
  if (blocks.length === 0) {
    console.log('tilemap 블록을 못 찾았다.');
    process.exit(2);
  }

  const results = blocks.map((b) => validate(b, profiles));
  let bad = 0;

  blocks.forEach((block, i) => {
    const result = results[i];
    console.log(
      `\n[${block.header.name || `도면 ${i + 1}`}] 프로필 ${result.profileName} · ${block.grid.length}줄`
    );

    if (args.includes('--preview')) {
      console.log(renderPreview(block.grid, result.profile));
    }

    if (result.errors.length === 0) {
      console.log('  문제 없음');
      return;
    }
    bad += result.errors.length;
    for (const e of result.errors) {
      console.log(`  [검사 ${e.검사}] ${e.글}`);
    }
  });

  const htmlAt = args.indexOf('--html');
  if (htmlAt !== -1 && args[htmlAt + 1]) {
    fs.writeFileSync(args[htmlAt + 1], renderHtml(blocks, results), 'utf8');
    console.log(`\nHTML 저장 : ${args[htmlAt + 1]}`);
  }

  console.log(`\n오류 ${bad}개`);
  if (bad > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { parseBlocks, validate, renderHtml, renderPreview, loadProfiles, getProfile };
