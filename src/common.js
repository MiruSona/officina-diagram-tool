// 도면 도구 공통 조각. 코드펜스 뽑기와 마크다운 표 읽기.

// ```timeline name="강베기" total=34  ->  { name: '강베기', total: '34' }
function parseHeader(line) {
  const header = {};
  const re = /([\w가-힣]+)=("[^"]*"|\S+)/g;
  let m = re.exec(line);
  while (m) {
    header[m[1]] = m[2].replace(/^"|"$/g, '');
    m = re.exec(line);
  }
  return header;
}

// 마크다운에서 지정한 태그의 코드펜스를 뽑는다.
// 사전(범례·시작자원 같은 것)은 펜스 바로 아래 줄에 적으므로 빈 줄 전까지 같이 담는다.
function parseFenced(text, tags) {
  const wanted = Array.isArray(tags) ? tags : [tags];
  const lines = text.split(/\r?\n/);
  const blocks = [];
  let current = null;
  let justClosed = null;

  for (const line of lines) {
    if (current === null) {
      const m = /^```+\s*(\w+)/.exec(line);
      if (m && wanted.includes(m[1])) {
        current = { tag: m[1], header: parseHeader(line), lines: [] };
        justClosed = null;
        continue;
      }
      if (justClosed && line.trim() !== '') {
        justClosed.lines.push(line);
        continue;
      }
      justClosed = null;
      continue;
    }

    if (/^```+\s*$/.test(line)) {
      blocks.push(current);
      justClosed = current;
      current = null;
      continue;
    }

    current.lines.push(line);
  }

  return blocks;
}

// | 구간 | 프레임 |  ->  { columns: ['구간','프레임'], rows: [{구간:'선딜', 프레임:'1-8'}] }
function parseTable(lines) {
  const rows = [];
  let columns = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) {
      continue;
    }
    if (/^\|[\s:|-]+\|$/.test(trimmed)) {
      continue;
    }

    const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim());
    if (columns === null) {
      columns = cells;
      continue;
    }

    const row = {};
    columns.forEach((name, i) => {
      row[name] = cells[i] === undefined ? '' : cells[i];
    });
    rows.push(row);
  }

  return { columns: columns || [], rows };
}

// 표 아래에 붙는 사전 한 줄. "키워드: 지속=... / 소멸=..." -> { 지속: '...', 소멸: '...' }
function parseDict(lines, name) {
  const found = lines.find((l) => l.trim().startsWith(`${name}:`));
  if (!found) {
    return null;
  }

  const dict = {};
  const body = found.slice(found.indexOf(':') + 1);
  for (const piece of body.split('/')) {
    const at = piece.indexOf('=');
    if (at === -1) {
      continue;
    }
    dict[piece.slice(0, at).trim()] = piece.slice(at + 1).trim();
  }
  return dict;
}

// "밀 2, 물 1" -> [{ 이름: '밀', 개수: 2 }, { 이름: '물', 개수: 1 }]
function parseAmounts(text) {
  if (!text || text === '—' || text === '-') {
    return [];
  }

  const out = [];
  for (const piece of text.split(',')) {
    const parts = piece.trim().split(/\s+/);
    if (parts[0] === '') {
      continue;
    }
    let count = 1;
    if (parts.length > 1) {
      count = Number(parts[parts.length - 1]);
    }
    if (Number.isNaN(count)) {
      count = 1;
    }
    out.push({ 이름: parts[0], 개수: count });
  }
  return out;
}

module.exports = { parseHeader, parseFenced, parseTable, parseDict, parseAmounts };
