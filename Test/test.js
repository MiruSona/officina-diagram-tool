// 도면 도구 회귀 시험. 검사가 "잡아야 할 것을 잡나" 와 "안 잡아야 할 것을 안 잡나" 를 둘 다 본다.
// 쓰는 법 : node Tools/Draw/test.js
//
// 견본을 눈으로 보는 것만으로는 검사가 조용히 죽어도 모른다. 그래서 기대값을 여기 적어 둔다.

const fs = require('fs');
const path = require('path');
const tilemap = require('../Tools/Draw/tilemap');
const timeline = require('../Tools/Draw/timeline');
const lint = require('../Tools/Draw/lint');
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

const 정상도면 = [...타일맵검사('견본.md'), ...타일맵검사('견본-중력.md')];
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
