// 도면 도구 회귀 시험. 검사가 "잡아야 할 것을 잡나" 와 "안 잡아야 할 것을 안 잡나" 를 둘 다 본다.
// 쓰는 법 : node Tools/Draw/test.js
//
// 견본을 눈으로 보는 것만으로는 검사가 조용히 죽어도 모른다. 그래서 기대값을 여기 적어 둔다.

const fs = require('fs');
const path = require('path');
const tilemap = require('../Tools/Draw/tilemap');
const timeline = require('../Tools/Draw/timeline');
const lint = require('../Tools/Draw/lint');
const all = require('../Tools/Draw/all');
const { parseFenced, parseAmounts, mermaidId } = require('../Tools/Draw/common');

const HERE = path.join(__dirname, 'Draw');
let 통과 = 0;
const 실패 = [];

function 확인(이름, 조건, 덧붙임) {
  if (조건) {
    통과 += 1;
    return;
  }
  실패.push(덧붙임 ? `${이름} — ${덧붙임}` : 이름);
}

function read(name) {
  return fs.readFileSync(path.join(HERE, name), 'utf8');
}

// 타일맵 파일을 검사해 [{name, codes}] 로 돌려준다.
function 타일맵검사(name) {
  const text = read(name);
  const profiles = tilemap.loadProfiles();
  return tilemap.parseBlocks(text).map((block) => {
    const baseline = tilemap.loadBaseline(text, block.header.baseline, block.header.move);
    const result = tilemap.validate(block, profiles, baseline);
    return {
      name: block.header.name || '',
      codes: result.errors.map((e) => e.검사),
      글: result.errors.map((e) => e.글),
    };
  });
}

function 린트검사(name) {
  const text = read(name);
  const profiles = lint.loadProfiles();
  const techs = lint.readTech(parseFenced(text, ['tech']));
  return parseFenced(text, ['chain', 'cards']).map((block) => {
    const profile = lint.getProfile(profiles, block.header.profile || block.tag);
    const on = profile.검사 || [];
    const found = [];
    const report = (code, 글) => found.push({ code, 글 });
    if (block.tag === 'chain') {
      lint.lintChain(lint.readChain(block), techs, on, report);
    } else {
      lint.lintCards(lint.readCards(block), on, report, profile.한도);
    }
    return { name: block.header.name || '', codes: found.map((f) => f.code), 글: found.map((f) => f.글) };
  });
}

function 시간축검사(name) {
  return parseFenced(read(name), ['timeline', 'pacing', 'count']).map((block) => {
    const errors = [];
    const drawn = timeline.draw(block, errors);
    return { name: block.header.name || block.tag, text: drawn.text, errors };
  });
}

// ---------------------------------------------------------------- 엔진 A

const 정상도면 = [
  ...타일맵검사('견본.md'),
  ...타일맵검사('견본-중력.md'),
  ...타일맵검사('견본-크리티컬패스.md'),
];
for (const block of 정상도면) {
  확인(`A-정상 [${block.name}] 은 조용해야 한다`, block.codes.length === 0, block.글.join(' / '));
}

const 시험 = 타일맵검사('시험견본.md');
const 시험별 = {};
for (const block of 시험) {
  시험별[block.name] = block.codes;
}

확인('A1 줄 길이 어긋남', (시험별['시험1 줄 길이'] || []).includes('1'));
확인('A2 모르는 문자', (시험별['시험2 모르는 문자'] || []).includes('2'));
확인('A3 시작점 2개', (시험별['시험3 시작점'] || []).includes('3'));
확인('A4b 못 가는 섬', (시험별['시험4 섬'] || []).includes('4b'));
확인('A4b 열쇠가 문 뒤', (시험별['시험5 열쇠 순서'] || []).includes('4b'));
확인('A-정상 시험6 은 조용하다', (시험별['시험6 정상'] || []).length === 0);
확인('A4a 못 오르는 발판', (시험별['시험7 못 오르는 발판'] || []).includes('4a'));
확인('A4a 넓은 구덩이 — 낙하 중에도 가로 예산이 산다', (시험별['시험8 넓은 구덩이'] || []).includes('4a'));

// 점프 곡선 — 높이와 거리를 동시에 최대로 쓸 수는 없다.
function 점프도면(그리드) {
  const profiles = tilemap.loadProfiles();
  const block = { header: { move: 'gravity' }, grid: 그리드, legend: {} };
  const baseline = { 점프높이: 4, 점프거리: 5, 정점거리: 2.5 };
  return tilemap
    .validate(block, profiles, baseline)
    .errors.filter((e) => e.검사 === '4a')
    .length;
}

// 정점까지 거리(2.5) 안쪽에 있는 3칸 위 발판 — 닿는다.
확인(
  'A4a 가까운 발판은 안 잡는다',
  점프도면([
    '..........',
    '....###...',
    '..........',
    '..........',
    '..P.......',
    '###.......',
    '..........',
    '##########',
  ]) === 0
);

// 같은 높이인데 가로로 더 먼 발판 — 포물선 밖이라 못 닿는다.
확인(
  'A4a 먼 발판은 잡는다',
  점프도면([
    '...............',
    '.............##',
    '...............',
    '...............',
    '..P............',
    '###............',
    '...............',
    '###############',
  ]) > 0
);

// ---- 검사 10. 크리티컬 패스 ----

const 패스시험 = 타일맵검사('시험견본-크리티컬패스.md');
const 패스별 = {};
for (const block of 패스시험) {
  패스별[block.name] = block.codes;
}

확인('A10 열쇠가 3번 뒤 — 순서 뒤집힘', (패스별['시험10-1 열쇠 순서 뒤집힘'] || []).includes('10'));
확인(
  'A10 열쇠 순서 뒤집힘은 4b 가 아니라 10 이 잡는다',
  !(패스별['시험10-1 열쇠 순서 뒤집힘'] || []).includes('4b'),
  (패스시험.find((b) => b.name === '시험10-1 열쇠 순서 뒤집힘') || {}).글
);
확인('A10 지리가 거꾸로', (패스별['시험10-2 지리가 거꾸로'] || []).includes('10'));
확인('A10 번호 빠짐', (패스별['시험10-3 번호 빠짐'] || []).includes('10'));
확인('A10 번호 겹침', (패스별['시험10-4 번호 겹침'] || []).includes('10'));

// 온전한 크리티컬 패스를 안 잡는 것이 진짜 시험이다.
const 패스정상 = 타일맵검사('견본-크리티컬패스.md');
for (const block of 패스정상) {
  확인(`A10-정상 [${block.name}] 은 조용해야 한다`, block.codes.length === 0, block.글.join(' / '));
}
확인('A10 비트가 없으면 조용히 넘어간다', (패스정상.find((b) => b.name === '비트 없음') || {}).codes.length === 0);

// ---------------------------------------------------------------- 엔진 B

const 시간축 = 시간축검사('견본-타임라인.md');
확인('B 타임라인 막대가 나온다', 시간축[0].text.includes('█'));
확인('B 정상 타임라인은 조용하다', 시간축[0].errors.length === 0, 시간축[0].errors.join(' / '));
확인(
  'B 판정 구간이 제 자리에 찍힌다',
  (() => {
    const 판정 = 시간축[0].text.split('\n').find((l) => l.includes('판정'));
    return /판정\s+·{8}█{4}·/.test(판정);
  })()
);
확인(
  'B 같은 강도 3연속을 잡는다',
  시간축.some((r) => r.errors.some((e) => e.includes('이어진다')))
);
확인(
  'B 0인 칸을 잡는다',
  시간축.some((r) => r.errors.some((e) => e.includes('0개다')))
);

// total 을 적어 두면 넘는 구간을 잡는다.
const 넘침 = [];
timeline.draw(
  { tag: 'timeline', header: { name: '넘침', total: '10' }, lines: ['| 구간 | 프레임 |', '|---|---|', '| 후딜 | 9-40 |'] },
  넘침
);
확인('B total 을 넘는 구간을 잡는다', 넘침.some((e) => e.includes('넘는다')));

// 개수 막대는 너비를 넘지 않는다.
const 큰수 = [];
const 그려진 = timeline.draw(
  { tag: 'count', header: { name: '큰수' }, lines: ['| 칸 | 개수 |', '|---|---|', '| 1 | 300 |'] },
  큰수
);
확인(
  'B 큰 개수도 막대가 안 넘친다',
  그려진.text.split('\n').every((l) => l.length < 80),
  그려진.text
);

// ---------------------------------------------------------------- 엔진 C

const 정상사슬 = 린트검사('견본-사슬.md');
for (const block of 정상사슬) {
  확인(`C-정상 [${block.name}] 은 조용해야 한다`, block.codes.length === 0, block.글.join(' / '));
}
확인(
  'C-2 생산 사슬의 정상 순환을 안 잡는다',
  정상사슬.every((b) => !b.codes.includes('C6'))
);

const 시험사슬 = 린트검사('시험견본-사슬.md');
const 사슬별 = {};
for (const block of 시험사슬) {
  사슬별[block.name] = block.codes;
}

확인('C-1 닭-달걀', (사슬별['시험 테크 트리'] || []).includes('C5'));
확인('C4 도달 불가', (사슬별['시험 테크 트리'] || []).includes('C4'));
확인('C6 자원 순환', (사슬별['시험 테크 트리'] || []).includes('C6'));
확인('C-3 고아 카드', (사슬별['시험 덱'] || []).includes('C8'));
확인('C9 아키타입 장수 미달', (사슬별['시험 덱'] || []).includes('C9'));
확인('C10 사문화 키워드', (사슬별['시험 덱'] || []).includes('C10'));
확인('C11 비용 곡선 구멍', (사슬별['시험 덱'] || []).includes('C11'));
확인('C12 너무 긴 텍스트', (사슬별['시험 덱'] || []).includes('C12'));
확인('C13 뼈대 슬롯 미충족', (사슬별['시험 덱'] || []).includes('C13'));
확인('C1 사전에 없는 이름', (사슬별['시험 덱'] || []).includes('C1'));

// 희귀도 — 낮은 희귀도일수록 규칙 텍스트가 짧아야 한다 (MTG New World Order)
const 덱 = lint.readCards(parseFenced(read('시험견본-사슬.md'), ['cards'])[0]);
const 덱한도 = { 텍스트한도: { 일반: 40, 전설: 130, 기본: 60 }, 사문화한도: 1 };
const 희귀도결과 = [];
lint.lintCards(덱, ['C1', 'C12'], (code, 글) => 희귀도결과.push(`${code} ${글}`), 덱한도);
확인('C12 가 희귀도별 한도를 쓴다', 희귀도결과.some((m) => m.includes('(일반)') && m.includes('한도 40자')));
확인(
  'C12 가 높은 희귀도는 봐준다',
  !희귀도결과.some((m) => m.startsWith('C12') && m.includes('폭발'))
);
확인('C1 이 사전에 없는 희귀도를 잡는다', 희귀도결과.some((m) => m.includes("희귀도 '신화'")));
확인('희귀도 열을 읽는다', 덱.cards[0].희귀도 === '일반');
확인('C2 재료를 못 구한다', (사슬별['시험 수지'] || []).includes('C2'));
확인('C3 아무도 안 쓴다', (사슬별['시험 수지'] || []).includes('C3'));
확인('C7 수지가 안 맞는다', (사슬별['시험 수지'] || []).includes('C7'));

// 채수 — 건물이 몇 채 도는지가 수지에 곱해진다
const 수지사슬 = lint.readChain(parseFenced(read('시험견본-사슬.md'), ['chain'])[1]);
확인('채수 열을 읽는다', 수지사슬.buildings[0].채수 === 2);
const 채수결과 = [];
lint.lintChain(수지사슬, [], ['C7'], (code, 글) => 채수결과.push(글));
확인('C7 이 채수를 곱해서 잰다', 채수결과.some((m) => m.includes('+5')), 채수결과.join(' / '));
확인('채수를 안 적으면 1채다', lint.readChain(parseFenced(read('견본-사슬.md'), ['chain'])[0]).buildings[2].채수 === 1);

// 테크 앞뒤 순환 — 자원 사슬이 아니라 테크 그래프 쪽이다.
const 테크순환 = [];
lint.lintChain(
  { buildings: [], 시작자원: [], 시작테크: [], 최종재: [] },
  [
    { 이름: '야금', 필요자원: [], 앞테크: ['기계공학'] },
    { 이름: '기계공학', 필요자원: [], 앞테크: ['야금'] },
  ],
  ['C6'],
  (code, 글) => 테크순환.push(`${code} ${글}`)
);
확인('C6 테크 앞뒤 순환', 테크순환.some((m) => m.includes('테크 순환')));

// ---- 검사 11. 쉼터 없음 ----

const 쉼터 = 시간축검사('시험견본-페이싱.md');
const 쉼터별 = {};
for (const r of 쉼터) {
  쉼터별[r.name] = r.errors;
}
const 쉼터알림 = (name) => (쉼터별[name] || []).filter((e) => e.includes('쉼터간격'));

확인('B11 5 4 5 4 5 를 쉼터 없음으로 잡는다', 쉼터알림('시험11-1 쉼터 없음').length === 1);
확인(
  'B11 한 줄기에 한 번만 알린다',
  (쉼터별['시험11-1 쉼터 없음'] || []).length === 1,
  (쉼터별['시험11-1 쉼터 없음'] || []).join(' / ')
);
확인(
  'B11 5 4 1 5 4 는 안 잡는다',
  (쉼터별['시험11-2 쉼터 있음'] || []).length === 0,
  (쉼터별['시험11-2 쉼터 있음'] || []).join(' / ')
);
확인(
  'B11 쉼터간격 머리말로 한도를 늘린다',
  (쉼터별['시험11-3 한도 늘림'] || []).length === 0,
  (쉼터별['시험11-3 한도 늘림'] || []).join(' / ')
);
확인(
  'B11 은 같은 강도 3연속 검사를 안 건드린다',
  시간축.some((r) => r.errors.some((e) => e.includes('이어진다') && !e.includes('쉼터간격')))
);

// ---- 예시=참 건너뛰기 ----

// 같은 블록을 예시 표시만 붙였다 뗐다 하며 잰다.
function 예시비교(만들기) {
  const 그냥 = 만들기({});
  const 예시 = 만들기({ 예시: '참' });
  return { 그냥, 예시 };
}

const A예시 = 예시비교((extra) => {
  const profiles = tilemap.loadProfiles();
  const block = {
    header: Object.assign({ move: 'flat' }, extra),
    grid: ['#####', '#.Z.#', '#####'],
    legend: {},
  };
  return tilemap.validate(block, profiles, { 점프높이: 4, 점프거리: 5, 정점거리: 2.5 });
});
확인('예시 A — 표시가 없으면 잡는다', A예시.그냥.errors.length > 0);
확인('예시 A — 표시가 있으면 안 잡는다', A예시.예시.errors.length === 0);
확인('예시 A — 건너뛴 것을 알려준다', A예시.예시.예시 === true);

const B예시 = 예시비교((extra) =>
  timeline.checkBlock({
    tag: 'pacing',
    header: Object.assign({ name: '예시 페이싱' }, extra),
    lines: ['| 구간 | 종류 | 강도 |', '|---|---|---|', '| 1 | 전투 | 9 |'],
  })
);
확인('예시 B — 표시가 없으면 잡는다', B예시.그냥.errors.length > 0);
확인('예시 B — 표시가 있으면 안 잡는다', B예시.예시.errors.length === 0);
확인('예시 B — 그림은 그대로 그린다', B예시.예시.text.includes('예시 페이싱'));

// ---- 가이드 두 문서 · 폴더 훑기 ----

const GUIDE = path.join(__dirname, '..', 'Docs', 'Guide');
for (const 이름 of ['타일기호.md', '도면서식.md']) {
  const found = all.checkFile(path.join(GUIDE, 이름));
  확인(`훑기 [${이름}] 는 오류 0 이다`, found.errors.length === 0, found.errors.join(' / '));
  확인(`훑기 [${이름}] 는 예시를 건너뛴다`, found.예시 > 0);
}

const 훑은파일 = all.findMarkdown(GUIDE, []);
확인('훑기가 폴더 아래 .md 를 찾는다', 훑은파일.length >= 2);
확인('훑기가 도면 없는 글은 거른다', all.hasBlock('# 그냥 글\n\n표도 격자도 없다.') === false);
확인('훑기가 도면 든 글은 고른다', all.hasBlock('```pacing name="x"\n```') === true);

// 문서 하나의 프로필 오타 때문에 훑기가 통째로 멎으면 안 된다.
const 임시 = fs.mkdtempSync(path.join(require('os').tmpdir(), 'draw-'));
const 오타파일 = path.join(임시, '오타.md');
fs.writeFileSync(
  오타파일,
  '```tilemap name="오타" profile="없는프로필"\n###\n#P#\n###\n```\n범례: P=시작 #=벽\n',
  'utf8'
);
let 훑기결과 = null;
let 터졌나 = false;
try {
  훑기결과 = all.checkFile(오타파일);
} catch (e) {
  터졌나 = true;
}
확인('훑기는 프로필 오타에 안 터진다', 터졌나 === false);
확인(
  '훑기가 프로필 오타를 오류 한 줄로 알린다',
  훑기결과 !== null && 훑기결과.errors.some((e) => e.includes('없는프로필')),
  훑기결과 === null ? '터짐' : 훑기결과.errors.join(' / ')
);
fs.rmSync(임시, { recursive: true, force: true });

// ---------------------------------------------------------------- 손으로 짠 격자

// 격자 몇 줄만 넣어 바로 검사한다. 견본 파일을 만들 만큼 크지 않은 것들이다.
function 격자검사(grid, legend, header) {
  const profiles = tilemap.loadProfiles();
  const block = {
    header: Object.assign({ profile: '던전' }, header || {}),
    grid,
    legend: legend || {},
  };
  return tilemap.validate(block, profiles, { 점프높이: 4, 점프거리: 5, 정점거리: 2.5 }).errors;
}

const 막힌비트 = 격자검사(
  ['#########', '#P.1#2#3#', '#########'],
  { P: '시작', '#': '벽', '.': '바닥', 1: '비트', 2: '비트', 3: '비트' }
);
확인(
  'A10 막히면 거기서 멈춘다 (한 번만 알린다)',
  막힌비트.filter((e) => e.검사 === '10').length === 1,
  막힌비트.map((e) => e.글).join(' / ')
);

const 빠진번호 = 격자검사(
  ['#########', '#P.1.2#4#', '#########'],
  { P: '시작', '#': '벽', '.': '바닥', 1: '비트', 2: '비트', 4: '비트' }
);
확인(
  'A10 못 간 자리를 실제 앞 비트로 짚는다',
  빠진번호.some((e) => e.글.includes('비트 2 에서 비트 4')),
  빠진번호.map((e) => e.글).join(' / ')
);
확인('A10 빠진 번호를 짚는다', 빠진번호.some((e) => e.글.includes('빠진 비트 번호 : 3')));

const 줄끝공백 = 격자검사(['#####', '#P..#  ', '#####'], { P: '시작', '#': '벽', '.': '바닥' });
확인(
  'A2 줄 끝 공백을 알아듣게 알린다',
  줄끝공백.some((e) => e.글.includes('공백')),
  줄끝공백.map((e) => e.글).join(' / ')
);

const 쉼터오타 = timeline.checkBlock({
  tag: 'pacing',
  header: { name: '쉼터 오타', 쉼터간격: '셋' },
  lines: ['| 구간 | 종류 | 강도 |', '|---|---|---|', '| 1 | 전투 | 2 |'],
});
확인(
  'B11 쉼터간격 오타를 조용히 넘기지 않는다',
  쉼터오타.errors.some((e) => e.includes('쉼터간격')),
  쉼터오타.errors.join(' / ')
);

// ---------------------------------------------------------------- 공통 읽기

확인(
  '공백이 든 자원 이름이 안 잘린다',
  parseAmounts('철 광석 2')[0].이름 === '철 광석' && parseAmounts('철 광석 2')[0].개수 === 2
);
확인('개수를 안 적으면 1개다', parseAmounts('밀')[0].개수 === 1);
확인('Mermaid id 에 공백이 안 들어간다', !mermaidId('R_', '철 광석').includes(' '));

const 사슬그림 = lint.chainToMermaid(lint.readChain(parseFenced(read('견본-사슬.md'), ['chain'])[0]));
확인('Mermaid 가 flowchart 로 시작한다', 사슬그림.startsWith('flowchart LR'));
const 선언줄 = 사슬그림.split('\n').filter((l) => l.startsWith('    ') && !l.includes('-->'));
const 성한선언 = (l) => /^ {4}[A-Za-z_][\w가-힣]*(\[|\(\[)"/.test(l);
확인('Mermaid 선언이 나온다', 선언줄.length > 0);
확인('Mermaid 노드 id 에 빈칸이 없다', 선언줄.every(성한선언), 선언줄.find((l) => !성한선언(l)));

// ---------------------------------------------------------------- 결과

console.log(`\n통과 ${통과}개 · 실패 ${실패.length}개`);
for (const f of 실패) {
  console.log(`  x ${f}`);
}
if (실패.length > 0) {
  process.exit(1);
}
