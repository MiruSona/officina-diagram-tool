// 타일맵 검증기 + 렌더러.
// 쓰는 법 : node tilemap.js <파일.md> [--html 결과.html] [--preview]
// 문자 약속은 Docs/Guide/타일기호.md, 프로필은 profiles.json 에 있다.

const fs = require('fs');
const path = require('path');
const { parseFenced, parseTable, parseHeader, escapeHtml, parseArgs, isExample } = require('./common');

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
  let justClosed = null;

  for (const line of lines) {
    if (current === null) {
      if (/^```+\s*tilemap\b/.test(line)) {
        current = { header: parseHeader(line), grid: [], legend: {} };
        justClosed = null;
        continue;
      }
      // 범례는 펜스 바로 아래에 적는 일이 많다. 그 줄만 블록에 넣어 준다.
      if (justClosed && /^(범례|해답)/.test(line)) {
        justClosed.grid.push(line);
        continue;
      }
      if (justClosed && line.trim() === '') {
        justClosed = null;
      }
      continue;
    }

    if (/^```+\s*$/.test(line)) {
      blocks.push(current);
      justClosed = current;
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
  const hasLegend = Object.keys(legend).length > 0;
  const badChar = new Set();
  const noLegend = new Set();

  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const ch = row[x];
      if (!known[ch] && !badChar.has(ch)) {
        badChar.add(ch);
        // 공백은 눈에 안 보여서 "문자표에 없다" 만 보면 어디가 틀렸는지 못 찾는다.
        let 글 = `'${ch}' 는 문자표에 없다. (처음 나온 곳 ${x + 1}열 ${y + 1}행)`;
        if (ch === ' ' || ch === '\t' || ch === '\r') {
          글 = `보이지 않는 문자(공백·탭)가 ${x + 1}열 ${y + 1}행 에 있다. 줄 끝 공백을 지운다.`;
        }
        errors.push({ 검사: '2', 글 });
        continue;
      }
      if (hasLegend && known[ch] && !legend[ch] && !noLegend.has(ch)) {
        noLegend.add(ch);
        errors.push({
          검사: '2',
          글: `'${ch}' (${known[ch].뜻}) 를 쓰는데 범례에 없다. 범례는 그리드 바로 아래 적는다.`,
        });
      }
    }
  });

  if (!hasLegend) {
    errors.push({ 검사: '2', 글: '범례가 없다. 그리드 바로 아래에 적는다.' });
  }

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

// 격자를 걸어 다니는 일꾼. 검사 4b 와 검사 10 이 같이 쓴다.
// 닿은 칸(seen) · 못 연 문(doors) · 주운 열쇠 칸(keys) · 이미 연 문(opened) 을 들고 다닌다.
// `blocked` 에 넣은 자리는 벽처럼 본다 — 검사 10 이 아직 안 만난 뒤 비트를 막을 때 쓴다.
// **열쇠와 연 문은 `reset()` 을 해도 안 지워진다.** 검사 10 이 단계를 넘어가며 들고 다녀야 한다.
function makeWalker(grid, chars) {
  const seen = new Set();
  const doors = new Set();
  const opened = new Set();
  const keys = new Set();
  const blocked = new Set();

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
      if (blocked.has(key(cur.x, cur.y))) {
        continue;
      }
      if (!spec.지나감 && !spec.문) {
        continue;
      }
      if (spec.문 && !opened.has(key(cur.x, cur.y))) {
        doors.add(key(cur.x, cur.y));
        continue;
      }

      seen.add(key(cur.x, cur.y));
      doors.delete(key(cur.x, cur.y));
      if (spec.열쇠) {
        keys.add(key(cur.x, cur.y));
      }

      queue.push({ x: cur.x + 1, y: cur.y });
      queue.push({ x: cur.x - 1, y: cur.y });
      queue.push({ x: cur.x, y: cur.y + 1 });
      queue.push({ x: cur.x, y: cur.y - 1 });
    }
  };

  // 주운 열쇠가 남아 있는 동안 못 연 문을 하나씩 연다. 먼저 만난 문부터 연다.
  const openDoors = () => {
    while (doors.size > 0 && keys.size - opened.size > 0) {
      const spot = doors.values().next().value;
      const parts = spot.split(',');
      opened.add(spot);
      doors.delete(spot);
      flood({ x: Number(parts[0]), y: Number(parts[1]) });
    }
  };

  // 닿은 칸만 지운다. 열쇠와 연 문은 남는다.
  const reset = () => {
    seen.clear();
    doors.clear();
  };

  return { seen, doors, opened, keys, blocked, key, flood, openDoors, reset };
}

// 검사 4b. 시작점에서 사방으로 번져 나가(flood fill) 닿는 칸을 표시한다.
// 문에 막히면 그때까지 주운 열쇠 수만큼만 연다. 열쇠가 문 뒤에 있으면 여기서 걸린다.
function checkReachable(grid, profile, start, errors) {
  if (!start) {
    return null;
  }

  const chars = profile.문자;
  const walker = makeWalker(grid, chars);
  const { seen, doors, key } = walker;

  walker.flood(start);
  walker.openDoors();

  const keysFound = walker.keys.size;
  const keysUsed = walker.opened.size;

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

// 검사 10. 크리티컬 패스 — 비트 번호를 순서대로 갈 수 있는가.
//
// 4b 는 "어디든 갈 수 있나" 만 본다. 이건 "의도한 순서로 갈 수 있나" 를 본다.
// 단계마다 **아직 안 만난 뒤 비트를 벽으로 놓고** 번져 나간다.
// 그래야 "3번을 지나야만 2번에 갈 수 있다" 는 번호와 지리가 안 맞는 것이 잡힌다.
// 주운 열쇠와 연 문은 단계를 넘어가도 그대로 들고 간다.
function checkCriticalPath(grid, profile, start, errors) {
  const chars = profile.문자;
  const spots = new Map();

  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      const spec = chars[row[x]];
      if (!spec || !spec.비트) {
        continue;
      }
      if (!spots.has(spec.비트)) {
        spots.set(spec.비트, []);
      }
      spots.get(spec.비트).push({ x, y });
    }
  });

  if (spots.size === 0) {
    return;
  }

  const numbers = Array.from(spots.keys()).sort((a, b) => a - b);
  const biggest = numbers[numbers.length - 1];

  for (const n of numbers) {
    if (spots.get(n).length === 1) {
      continue;
    }
    errors.push({ 검사: '10', 글: `번호가 겹쳤다 — 비트 ${n} : ${spots.get(n).length}칸. 한 칸이어야 한다.` });
  }

  const missing = [];
  for (let n = 1; n <= biggest; n += 1) {
    if (spots.has(n)) {
      continue;
    }
    missing.push(n);
  }
  if (missing.length > 0) {
    errors.push({ 검사: '10', 글: `빠진 비트 번호 : ${missing.join(' · ')} — 1부터 이어져야 한다.` });
  }

  if (!start) {
    return;
  }

  const walker = makeWalker(grid, chars);
  let here = start;
  let 앞자리 = '시작점 P';

  for (const n of numbers) {
    walker.reset();
    walker.blocked.clear();
    for (const later of numbers) {
      if (later <= n) {
        continue;
      }
      for (const spot of spots.get(later)) {
        walker.blocked.add(walker.key(spot.x, spot.y));
      }
    }

    walker.flood(here);
    walker.openDoors();

    const goal = spots.get(n)[0];
    if (!walker.seen.has(walker.key(goal.x, goal.y))) {
      errors.push({
        검사: '10',
        글: `${앞자리} 에서 비트 ${n} (${goal.x + 1}열 ${goal.y + 1}행) 으로 못 간다. 번호 순서와 지리가 안 맞는다.`,
      });
      return;
    }
    here = goal;
    앞자리 = `비트 ${n}`;
  }
}

// 검사 4a. 점프로 못 올라가는 발판을 잡는다.
//
// 점프 곡선은 `h`(최고 높이) · `x_h`(정점까지 거리) 두 값이 정한다 (설계 3-2).
// 최고 높이는 가로로 x_h 까지만 유지되고, 그 뒤로는 포물선을 따라 떨어진다.
//   가로 m 칸 갔을 때 올라가 있을 수 있는 최대 높이
//     m <= x_h  ->  h        (달리는 속도를 줄이면 정점이 앞으로 온다)
//     m >  x_h  ->  h * (1 - ((m - x_h) / x_h)^2)
// 내려오는 중에는 높이 한도를 안 본다. 대신 가로 예산은 살아 있다 — 떨어진 칸 수만큼만 늘어난다.
// 더블 점프·대시·벽타기는 아직 안 본다. 공중에서 방향을 되돌리면 실제보다 빡빡하게 잰다.
function checkJump(grid, profile, start, baseline, errors) {
  if (!start) {
    return null;
  }

  const chars = profile.문자;
  const h = baseline.점프높이;
  const dist = baseline.점프거리;
  let xh = baseline.정점거리;
  if (!(xh > 0)) {
    xh = dist / 2;
  }

  const width = Math.max(...grid.map((row) => row.length), 1);
  const height = grid.length;

  const at = (x, y) => {
    if (y < 0 || y >= height) {
      return null;
    }
    if (x < 0 || x >= grid[y].length) {
      return null;
    }
    return chars[grid[y][x]];
  };
  const passable = (x, y) => {
    const spec = at(x, y);
    return Boolean(spec) && Boolean(spec.지나감);
  };
  const solid = (x, y) => {
    const spec = at(x, y);
    if (!spec) {
      return true;
    }
    return !spec.지나감;
  };
  const deadly = (x, y) => Boolean((at(x, y) || {}).죽음) || grid[y][x] === '^';
  const ladder = (x, y) => Boolean((at(x, y) || {}).사다리) || grid[y][x] === '~';
  const onGround = (x, y) => solid(x, y + 1) || ladder(x, y);

  // 가로로 m 칸 갔을 때 올라가 있을 수 있는 최대 높이
  const arcHeight = (m) => {
    if (m <= xh) {
      return h;
    }
    const t = (m - xh) / xh;
    return h * (1 - t * t);
  };
  // 가로 예산은 낙하 중에도 살아 있다. 떨어진 칸 수만큼만 더 간다 (오래 떠 있으니 더 흐른다).
  // 이게 없으면 아무리 넓은 구덩이도 같은 높이로 건너간다고 본다.
  const canBeAt = (risen, moved) => {
    const fallen = Math.max(0, -risen);
    if (moved > dist + fallen) {
      return false;
    }
    if (risen <= 0) {
      return true;
    }
    return risen <= arcHeight(moved) + 1e-9;
  };

  // 상태 = 칸 + 발사 높이에서 올라간 칸 수 + 공중에서 간 가로 칸 수 + 아직 오르는 중인가
  const RISEN_LOW = -height;
  const MOVED_MAX = width;
  const encode = (s) => {
    const risen = Math.max(RISEN_LOW, Math.min(h, s.risen)) - RISEN_LOW;
    const moved = Math.min(MOVED_MAX, s.moved);
    return ((((s.y * width + s.x) * (h - RISEN_LOW + 1) + risen) * (MOVED_MAX + 1)) + moved) * 2 +
      (s.asc ? 1 : 0);
  };

  const seen = new Set();
  const cells = new Set();
  const queue = [{ x: start.x, y: start.y, risen: 0, moved: 0, asc: true }];
  let head = 0;

  const push = (x, y, risen, moved, asc) => {
    if (!passable(x, y)) {
      return;
    }
    if (!canBeAt(risen, moved)) {
      return;
    }
    queue.push({ x, y, risen, moved, asc });
  };

  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const id = encode(cur);
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);
    cells.add(`${cur.x},${cur.y}`);

    if (deadly(cur.x, cur.y)) {
      continue;
    }

    const grounded = onGround(cur.x, cur.y);
    let risen = cur.risen;
    let moved = cur.moved;
    let asc = cur.asc;
    if (grounded) {
      risen = 0;
      moved = 0;
      asc = true;
    }

    if (asc) {
      push(cur.x, cur.y - 1, risen + 1, moved, true);
    }
    if (ladder(cur.x, cur.y)) {
      push(cur.x, cur.y - 1, 0, 0, true);
      push(cur.x, cur.y + 1, 0, 0, true);
    }
    if (!grounded) {
      push(cur.x, cur.y + 1, risen - 1, moved, false);
    }

    for (const dx of [-1, 1]) {
      if (grounded) {
        const landed = onGround(cur.x + dx, cur.y);
        push(cur.x + dx, cur.y, 0, 0, landed);
        continue;
      }
      push(cur.x + dx, cur.y, risen, moved + 1, asc);
    }
  }

  const stuck = [];
  grid.forEach((row, y) => {
    for (let x = 0; x < row.length; x += 1) {
      if (!passable(x, y) || deadly(x, y) || !onGround(x, y)) {
        continue;
      }
      if (cells.has(`${x},${y}`)) {
        continue;
      }
      stuck.push({ x, y, ch: row[x] });
    }
  });

  if (stuck.length > 0) {
    const shown = stuck.slice(0, 8).map((s) => `${s.x + 1}열 ${s.y + 1}행`);
    let 글 = `점프로 못 올라가는 발판이 ${stuck.length}칸 있다. ${shown.join(', ')}`;
    if (stuck.length > shown.length) {
      글 += ' …';
    }
    글 += ` (점프 높이 ${h} · 거리 ${dist} · 정점까지 ${xh} 기준)`;
    errors.push({ 검사: '4a', 글 });
  }

  for (const ch of ['C', 'S', 'E', 'X']) {
    for (const spot of findChar(grid, ch)) {
      if (cells.has(`${spot.x},${spot.y}`)) {
        continue;
      }
      errors.push({ 검사: '4a', 글: `'${ch}' (${spot.x + 1}열 ${spot.y + 1}행) 에 못 간다.` });
    }
  }

  return cells;
}

function validate(block, profiles, baseline) {
  const name = pickProfileName(block.header, profiles);
  const profile = getProfile(profiles, name);
  const on = profile.검사 || [];
  const errors = [];

  // `예시=참` 인 블록은 온전한 도면이 아니라 기호를 보여주는 조각이다. 그리기만 하고 검사는 건너뛴다.
  if (isExample(block.header)) {
    return { profileName: name, profile, errors, 예시: true };
  }

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
  if (on.includes('10')) {
    checkCriticalPath(block.grid, profile, start, errors);
  }
  if (on.includes('4a')) {
    if (baseline.기본값) {
      errors.push({
        검사: '4a',
        글: '이동 기준선(baseline) 표가 없어서 기본값(높이 4 · 거리 5 · 정점 2.5)으로 쟀다.',
      });
    }
    if (baseline.빠진값 && baseline.빠진값.length > 0) {
      errors.push({
        검사: '4a',
        글: `기준선 표에 ${baseline.빠진값.join(' · ')} 가 없어서 기본값으로 쟀다.`,
      });
    }
    checkJump(block.grid, profile, start, baseline, errors);
  }

  return { profileName: name, profile, errors };
}

const DEFAULT_BASELINE = { 점프높이: 4, 점프거리: 5, 정점거리: 2.5 };

const BASELINE_LABEL = {
  '점프 최고 높이': '점프높이',
  '점프 최대 거리': '점프거리',
  '정점까지 거리': '정점거리',
};

// baseline 표에서 점프 값을 뽑는다.
// 고르는 순서 : 머리말 `baseline` 이름 -> 같은 이동 축(move=gravity) 표 -> 첫 표.
// 표가 하나도 없으면 기본값을 쓰고 그렇다고 알린다. 조용히 짐작하면 안 된다.
function loadBaseline(text, wanted, move) {
  const blocks = parseFenced(text, ['baseline']);
  if (blocks.length === 0) {
    return Object.assign({}, DEFAULT_BASELINE, { 기본값: true });
  }

  let block = null;
  if (wanted) {
    block = blocks.find((b) => b.header.name === wanted) || null;
  }
  if (!block && move) {
    block = blocks.find((b) => b.header.move === move) || null;
  }
  if (!block) {
    block = blocks[0];
  }

  const baseline = Object.assign({}, DEFAULT_BASELINE, { 기본값: false, 빠진값: [] });
  const read = new Set();
  for (const row of parseTable(block.lines).rows) {
    const field = BASELINE_LABEL[row['항목']];
    const value = Number(row['값']);
    if (!field || Number.isNaN(value)) {
      continue;
    }
    baseline[field] = value;
    read.add(field);
  }

  for (const field of Object.keys(BASELINE_LABEL)) {
    if (read.has(BASELINE_LABEL[field])) {
      continue;
    }
    baseline.빠진값.push(field);
  }
  return baseline;
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

const UNKNOWN_COLOR = '#6b6d77';

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
    parts.push(`<h2>${escapeHtml(block.header.name || `도면 ${i + 1}`)}</h2>`);
    parts.push(
      `<div class="meta">프로필 ${escapeHtml(result.profileName)} · ` +
        `이동 ${escapeHtml(result.profile.이동)} · ${width}×${block.grid.length}</div>`
    );

    parts.push(`<div class="grid" style="grid-template-columns:repeat(${width},18px)">`);
    for (const row of block.grid) {
      for (let x = 0; x < row.length; x += 1) {
        const ch = row[x];
        const spec = result.profile.문자[ch] || {};
        const color = spec.색 || UNKNOWN_COLOR;
        let label = ch;
        if (spec.지나감 === true && spec.뜻 && /빈칸|허공|바닥/.test(spec.뜻)) {
          label = '';
        }
        if (spec.지나감 === false && !spec.문) {
          label = '';
        }
        const title = spec.뜻 ? ` title="${escapeHtml(spec.뜻)}"` : '';
        parts.push(`<div class="cell" style="background:${color}"${title}>${escapeHtml(label)}</div>`);
      }
    }
    parts.push('</div>');

    if (result.errors.length === 0) {
      parts.push('<p class="ok">문제 없음</p>');
      return;
    }
    parts.push('<ul class="bad">');
    for (const e of result.errors) {
      parts.push(`<li>검사 ${escapeHtml(e.검사)} — ${escapeHtml(e.글)}</li>`);
    }
    parts.push('</ul>');
  });

  return parts.join('\n');
}

function checkFile(file, flags) {
  const profiles = loadProfiles();
  const text = fs.readFileSync(file, 'utf8');
  const blocks = parseBlocks(text);
  const results = blocks.map((b) =>
    validate(b, profiles, loadBaseline(text, b.header.baseline, b.header.move))
  );
  let bad = 0;
  let 예시수 = 0;

  blocks.forEach((block, i) => {
    const result = results[i];
    console.log(
      `
[${block.header.name || `도면 ${i + 1}`}] 프로필 ${result.profileName} · ${block.grid.length}줄`
    );

    if (flags['--preview']) {
      console.log(renderPreview(block.grid, result.profile));
    }

    if (result.예시) {
      예시수 += 1;
      console.log('  예시 블록이라 검사를 건너뛴다');
      return;
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

  return { blocks, results, bad, 예시수 };
}

function main() {
  const { files, flags } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.log('쓰는 법 : node tilemap.js <파일.md ...> [--html 결과.html] [--preview]');
    process.exit(2);
  }

  let bad = 0;
  let 예시수 = 0;
  let allBlocks = [];
  let allResults = [];

  for (const file of files) {
    const out = checkFile(file, flags);
    bad += out.bad;
    예시수 += out.예시수;
    allBlocks = allBlocks.concat(out.blocks);
    allResults = allResults.concat(out.results);
  }

  if (allBlocks.length === 0) {
    console.log('tilemap 블록을 못 찾았다.');
    process.exit(2);
  }

  if (flags['--html']) {
    fs.writeFileSync(flags['--html'], renderHtml(allBlocks, allResults), 'utf8');
    console.log(`
HTML 저장 : ${flags['--html']}`);
  }

  let 꼬리 = '';
  if (예시수 > 0) {
    꼬리 = ` · 예시 ${예시수}개 건너뜀`;
  }
  console.log(`
오류 ${bad}개${꼬리}`);
  if (bad > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseBlocks,
  validate,
  renderHtml,
  renderPreview,
  loadProfiles,
  getProfile,
  loadBaseline,
};
