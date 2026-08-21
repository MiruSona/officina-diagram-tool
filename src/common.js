// 도면 도구 공통 조각. 코드펜스 뽑기, 마크다운 표 읽기, 명령줄 인자 읽기.

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

// 머리말에 `예시=참` 이 붙은 블록은 검사를 안 돌린다.
// 가이드 문서의 "기호는 이렇게 씁니다" 조각은 온전한 도면이 아니라서 그냥 돌리면 오류가 뜬다.
// 그리기는 그대로 하고 검사만 건너뛴다.
function isExample(header) {
  const value = header['예시'];
  if (value === undefined) {
    return false;
  }
  return value === '참' || value === 'true' || value === '1';
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

// "밀 2, 철 광석 1" -> [{ 이름: '밀', 개수: 2 }, { 이름: '철 광석', 개수: 1 }]
// 맨 뒤 토막이 숫자면 개수, 아니면 이름 전체다. 이름에 공백이 있어도 안 잘린다.
function parseAmounts(text) {
  if (!text || text === '—' || text === '-') {
    return [];
  }

  const out = [];
  for (const piece of text.split(',')) {
    const parts = piece.trim().split(/\s+/).filter((p) => p !== '');
    if (parts.length === 0) {
      continue;
    }

    let count = 1;
    let nameParts = parts;
    if (parts.length > 1) {
      const tail = Number(parts[parts.length - 1]);
      if (!Number.isNaN(tail)) {
        count = tail;
        nameParts = parts.slice(0, -1);
      }
    }
    out.push({ 이름: nameParts.join(' '), 개수: count });
  }
  return out;
}

// Mermaid 노드 id 로 쓸 수 있게 다듬는다. 공백·괄호·빼기표가 들어가면 파서가 깨진다.
function mermaidId(prefix, name) {
  const safe = String(name).replace(/[^\w가-힣]/g, '_');
  return `${prefix}${safe}`;
}

// HTML 로 뽑을 때 이름·라벨에 태그가 섞여도 안 깨지게 한다.
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// 명령줄 인자를 파일 목록과 깃발로 나눈다. --html 은 뒤따르는 값을 하나 먹는다.
function parseArgs(argv, valueFlags) {
  const takesValue = valueFlags || ['--html'];
  const files = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      files.push(arg);
      continue;
    }
    if (takesValue.includes(arg)) {
      flags[arg] = argv[i + 1];
      i += 1;
      continue;
    }
    flags[arg] = true;
  }

  return { files, flags };
}

module.exports = {
  parseHeader,
  isExample,
  parseFenced,
  parseTable,
  parseDict,
  parseAmounts,
  mermaidId,
  escapeHtml,
  parseArgs,
};
