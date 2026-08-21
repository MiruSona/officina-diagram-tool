// 폴더 전체 훑기. 도면이 든 .md 를 다 찾아 세 도구를 한꺼번에 돌린다.
// 쓰는 법 : node all.js [폴더 ...]        인자가 없으면 Docs/ 를 본다. ToolTest/ 는 test.js 가 본다.
//
// 검사만 한다. HTML 은 안 뽑는다 — 그리려면 도구를 하나씩 부른다.

const fs = require('fs');
const path = require('path');
const tilemap = require('./tilemap');
const timeline = require('./timeline');
const lint = require('./lint');
const { parseFenced, isExample } = require('./common');

const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DIRS = ['Docs'];

const TILE_TAGS = ['tilemap'];
const TIME_TAGS = ['timeline', 'pacing', 'count'];
const LINT_TAGS = ['chain', 'cards'];
const ALL_TAGS = TILE_TAGS.concat(TIME_TAGS, LINT_TAGS, ['tech']);

// 폴더 아래 .md 를 다 모은다. 못 읽은 폴더는 세어 두었다가 끝에 오류로 알린다.
const 못읽은폴더 = [];

function findMarkdown(dir, out) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    못읽은폴더.push(dir);
    return out;
  }

  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
        continue;
      }
      findMarkdown(full, out);
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(full);
    }
  }
  return out;
}

function hasBlock(text) {
  return ALL_TAGS.some((tag) => new RegExp('^```+\\s*' + tag + '\\b', 'm').test(text));
}

// --- 엔진 A. 격자 도면 ---
// tilemap.parseBlocks 는 펜스가 없으면 파일 전체를 한 도면으로 본다. 훑기에서는 그러면 안 된다.
function runTilemap(text, found) {
  if (!/^```+\s*tilemap\b/m.test(text)) {
    return;
  }
  const profiles = tilemap.loadProfiles();
  for (const block of tilemap.parseBlocks(text)) {
    found.blocks += 1;
    const 이름앞 = block.header.name || 'tilemap';
    const baseline = tilemap.loadBaseline(text, block.header.baseline, block.header.move);

    // 프로필 이름 오타는 여기서 예외로 터진다. 훑기가 멎지 않게 오류 한 줄로 바꾼다.
    let result = null;
    try {
      result = tilemap.validate(block, profiles, baseline);
    } catch (e) {
      found.errors.push(`[${이름앞}] ${e.message}`);
      continue;
    }

    if (result.예시) {
      found.예시 += 1;
      continue;
    }
    const 이름 = block.header.name || 'tilemap';
    for (const e of result.errors) {
      found.errors.push(`[${이름}] 검사 ${e.검사} — ${e.글}`);
    }
  }
}

// --- 엔진 B. 시간축·페이싱·개수 ---
function runTimeline(text, found) {
  for (const block of parseFenced(text, TIME_TAGS)) {
    found.blocks += 1;
    const checked = timeline.checkBlock(block);
    if (checked.예시) {
      found.예시 += 1;
      continue;
    }
    const 이름 = block.header.name || block.tag;
    for (const e of checked.errors) {
      found.errors.push(`[${이름}] ${e}`);
    }
  }
}

// --- 엔진 C. 사슬·카드 ---
function runLint(text, found) {
  const blocks = parseFenced(text, LINT_TAGS);
  if (blocks.length === 0) {
    return;
  }

  const profiles = lint.loadProfiles();
  const techs = lint.readTech(parseFenced(text, ['tech']).filter((b) => !isExample(b.header)));

  for (const block of blocks) {
    found.blocks += 1;
    if (isExample(block.header)) {
      found.예시 += 1;
      continue;
    }

    const profileName = block.header.profile || block.tag;
    const 이름 = block.header.name || block.tag;
    const profile = lint.getProfile(profiles, profileName);
    if (!profile) {
      found.errors.push(`[${이름}] 프로필 '${profileName}' 이 profiles.json 에 없다.`);
      continue;
    }

    const on = profile.검사 || [];
    const report = (code, 글) => found.errors.push(`[${이름}] ${code} — ${글}`);
    if (block.tag === 'chain') {
      lint.lintChain(lint.readChain(block), techs, on, report);
      continue;
    }
    lint.lintCards(lint.readCards(block), on, report, profile.한도);
  }
}

// 한 파일이 터져도 훑기는 계속한다. 문서 하나의 오타 때문에 전체가 멎으면 안 된다.
function checkFile(file) {
  const found = { blocks: 0, 예시: 0, errors: [] };
  const text = fs.readFileSync(file, 'utf8');

  for (const 돌리기 of [runTilemap, runTimeline, runLint]) {
    try {
      돌리기(text, found);
    } catch (e) {
      found.errors.push(`읽다가 멈췄다 : ${e.message}`);
    }
  }
  return found;
}

function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  let dirs = args;
  if (dirs.length === 0) {
    dirs = DEFAULT_DIRS.map((d) => path.join(ROOT, d));
  }

  const files = [];
  for (const dir of dirs) {
    findMarkdown(path.resolve(dir), files);
  }

  const 합 = { 파일: 0, 블록: 0, 오류: 0, 예시: 0 };

  for (const file of files.sort()) {
    const text = fs.readFileSync(file, 'utf8');
    if (!hasBlock(text)) {
      continue;
    }

    const found = checkFile(file);
    합.파일 += 1;
    합.블록 += found.blocks;
    합.오류 += found.errors.length;
    합.예시 += found.예시;

    // 저장소 밖 폴더를 훑을 때는 상대 경로가 `../../..` 로 길어진다. 그럴 땐 그냥 전체 경로를 적는다.
    let 쪽 = path.relative(ROOT, file).replace(/\\/g, '/');
    if (쪽.startsWith('..')) {
      쪽 = file.replace(/\\/g, '/');
    }
    let 꼬리 = '';
    if (found.예시 > 0) {
      꼬리 = ` · 예시 ${found.예시}개 건너뜀`;
    }
    console.log(`
[${쪽}] 블록 ${found.blocks}개 · 오류 ${found.errors.length}개${꼬리}`);
    for (const e of found.errors) {
      console.log(`  ${e}`);
    }
  }

  for (const dir of 못읽은폴더) {
    합.오류 += 1;
    console.log(`
폴더를 못 읽었다 : ${dir}`);
  }

  console.log(`
| 항목 | 수 |
| --- | --- |
| 파일 | ${합.파일} |
| 블록 | ${합.블록} |
| 오류 | ${합.오류} |
| 건너뛴 예시 | ${합.예시} |`);

  if (합.오류 > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { findMarkdown, hasBlock, checkFile };
