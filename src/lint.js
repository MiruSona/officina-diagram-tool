// 엔진 C — 관계 표 린터. 그림 도구가 아니라 검사 도구다.
// 쓰는 법 : node lint.js <파일.md> [--mermaid]
// 표 서식은 Docs/Guide/도면서식.md, 켤 검사는 profiles.json 에 있다.

const fs = require('fs');
const path = require('path');
const { parseFenced, parseTable, parseDict, parseAmounts } = require('./common');

const PROFILE_PATH = path.join(__dirname, 'profiles.json');

function loadProfiles() {
  return JSON.parse(fs.readFileSync(PROFILE_PATH, 'utf8'));
}

// "시작자원: 밀,물" 처럼 표 아래 한 줄로 적는 목록
function parseList(lines, name) {
  const found = lines.find((l) => l.trim().startsWith(`${name}:`));
  if (!found) {
    return [];
  }
  return found
    .slice(found.indexOf(':') + 1)
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '' && s !== '—');
}

// "화력(최소 12장) 방어(최소 8장)" -> { 화력: 12, 방어: 8 }
function parseQuota(lines, name) {
  const found = lines.find((l) => l.trim().startsWith(`${name}:`));
  if (!found) {
    return {};
  }

  const quota = {};
  const re = /([^\s(]+)\s*\(\s*최소\s*(\d+)/g;
  let m = re.exec(found);
  while (m) {
    quota[m[1]] = Number(m[2]);
    m = re.exec(found);
  }
  if (Object.keys(quota).length > 0) {
    return quota;
  }

  for (const name2 of parseList(lines, name)) {
    quota[name2.split('(')[0].trim()] = 0;
  }
  return quota;
}

function readChain(block) {
  const table = parseTable(block.lines);
  const buildings = table.rows.map((row) => ({
    이름: row['건물'],
    넣는것: parseAmounts(row['넣는 것']),
    나오는것: parseAmounts(row['나오는 것']),
    초당: Number(row['초당'] || 1),
    테크: (row['해금 테크'] || '—').trim(),
  }));

  return {
    buildings,
    시작자원: parseList(block.lines, '시작자원'),
    시작테크: parseList(block.lines, '시작테크'),
    최종재: parseList(block.lines, '최종재'),
  };
}

function readTech(blocks) {
  const techs = [];
  for (const block of blocks) {
    for (const row of parseTable(block.lines).rows) {
      techs.push({
        이름: row['테크'],
        필요자원: parseAmounts(row['필요 자원']).map((a) => a.이름),
        앞테크: parseList([`앞테크: ${row['앞 테크'] || ''}`], '앞테크'),
      });
    }
  }
  return techs;
}

// 시작 자원·테크에서 만들 수 있는 것을 계속 넓혀 나간다. 더 안 늘면 멈춘다.
function spread(chain, techs) {
  const haveRes = new Set(chain.시작자원);
  const haveTech = new Set(chain.시작테크);
  let grew = true;

  while (grew) {
    grew = false;

    for (const tech of techs) {
      if (haveTech.has(tech.이름)) {
        continue;
      }
      if (!tech.앞테크.every((t) => haveTech.has(t))) {
        continue;
      }
      if (!tech.필요자원.every((r) => haveRes.has(r))) {
        continue;
      }
      haveTech.add(tech.이름);
      grew = true;
    }

    for (const b of chain.buildings) {
      if (b.테크 !== '—' && !haveTech.has(b.테크)) {
        continue;
      }
      if (!b.넣는것.every((a) => haveRes.has(a.이름))) {
        continue;
      }
      for (const out of b.나오는것) {
        if (haveRes.has(out.이름)) {
          continue;
        }
        haveRes.add(out.이름);
        grew = true;
      }
    }
  }

  return { haveRes, haveTech };
}

function findCycle(edges) {
  const state = new Map();
  const stack = [];
  let found = null;

  const walk = (node) => {
    if (found) {
      return;
    }
    if (state.get(node) === 'done') {
      return;
    }
    if (state.get(node) === 'walking') {
      found = stack.slice(stack.indexOf(node)).concat(node);
      return;
    }

    state.set(node, 'walking');
    stack.push(node);
    for (const next of edges.get(node) || []) {
      walk(next);
    }
    stack.pop();
    state.set(node, 'done');
  };

  for (const node of edges.keys()) {
    walk(node);
  }
  return found;
}

function lintChain(chain, techs, on, report) {
  const produced = new Map();
  const consumed = new Map();
  const balance = new Map();

  for (const b of chain.buildings) {
    for (const a of b.넣는것) {
      consumed.set(a.이름, (consumed.get(a.이름) || 0) + a.개수 * b.초당);
      balance.set(a.이름, (balance.get(a.이름) || 0) - a.개수 * b.초당);
    }
    for (const a of b.나오는것) {
      produced.set(a.이름, (produced.get(a.이름) || 0) + a.개수 * b.초당);
      balance.set(a.이름, (balance.get(a.이름) || 0) + a.개수 * b.초당);
    }
  }

  const techNames = new Set(techs.map((t) => t.이름));
  if (on.includes('C1')) {
    for (const b of chain.buildings) {
      if (b.테크 === '—' || techNames.has(b.테크) || chain.시작테크.includes(b.테크)) {
        continue;
      }
      report('C1', `건물 '${b.이름}' 의 해금 테크 '${b.테크}' 가 테크 표에 없다.`);
    }
  }

  if (on.includes('C2')) {
    for (const name of consumed.keys()) {
      if (produced.has(name) || chain.시작자원.includes(name)) {
        continue;
      }
      report('C2', `'${name}' 은 아무데서도 안 나온다. 재료로 쓰이기만 한다.`);
    }
  }

  if (on.includes('C3')) {
    for (const name of produced.keys()) {
      if (consumed.has(name) || chain.최종재.includes(name)) {
        continue;
      }
      report('C3', `'${name}' 은 아무도 안 쓴다. 쌓이기만 한다.`);
    }
  }

  const reach = spread(chain, techs);
  if (on.includes('C4')) {
    for (const name of produced.keys()) {
      if (reach.haveRes.has(name)) {
        continue;
      }
      report('C4', `'${name}' 은 시작 자원·테크에서 못 만든다.`);
    }
    for (const tech of techs) {
      if (reach.haveTech.has(tech.이름)) {
        continue;
      }
      report('C4', `테크 '${tech.이름}' 은 영영 못 연다.`);
    }
  }

  if (on.includes('C5')) {
    for (const tech of techs) {
      for (const need of tech.필요자원) {
        const makers = chain.buildings.filter((b) => b.나오는것.some((a) => a.이름 === need));
        if (makers.length === 0) {
          continue;
        }
        if (makers.some((b) => b.테크 !== tech.이름)) {
          continue;
        }
        report('C5', `닭-달걀 — 테크 '${tech.이름}' 이 '${need}' 을 요구하는데 '${need}' 은 그 테크로 열리는 건물에서만 나온다.`);
      }
    }
  }

  if (on.includes('C6')) {
    const edges = new Map();
    for (const b of chain.buildings) {
      for (const out of b.나오는것) {
        const from = out.이름;
        if (!edges.has(from)) {
          edges.set(from, []);
        }
        for (const need of b.넣는것) {
          edges.get(from).push(need.이름);
        }
      }
    }
    const cycle = findCycle(edges);
    if (cycle) {
      report('C6', `순환이 있다 — ${cycle.join(' -> ')}`);
    }
  }

  // C7 은 양쪽에 다 걸린 중간재만 본다. 한쪽만 있는 것은 C2·C3 이 잡는다.
  if (on.includes('C7')) {
    for (const [name, value] of balance) {
      if (Math.abs(value) < 0.001) {
        continue;
      }
      if (!produced.has(name) || !consumed.has(name)) {
        continue;
      }
      if (chain.시작자원.includes(name)) {
        continue;
      }
      let word = '남는다';
      let sign = '+';
      if (value < 0) {
        word = '모자란다';
        sign = '';
      }
      report('C7', `'${name}' 수지가 ${sign}${Number(value.toFixed(2))} 다. 초당 ${word}.`);
    }
  }
}

function readCards(block) {
  const cards = parseTable(block.lines).rows.map((row) => ({
    id: row['id'],
    이름: row['이름'],
    비용: row['비용'],
    종류: row['종류'],
    아키타입: parseList([`x: ${row['아키타입'] || ''}`], 'x'),
    키워드: parseList([`x: ${row['키워드'] || ''}`], 'x'),
    텍스트: row['텍스트'] || '',
  }));

  return {
    cards,
    키워드사전: parseDict(block.lines, '키워드') || {},
    아키타입: parseQuota(block.lines, '아키타입'),
    슬롯: parseQuota(block.lines, '슬롯'),
  };
}

function lintCards(deck, on, report) {
  const archetypeCount = {};
  for (const name of Object.keys(deck.아키타입)) {
    archetypeCount[name] = 0;
  }
  const keywordCount = {};
  for (const name of Object.keys(deck.키워드사전)) {
    keywordCount[name] = 0;
  }

  for (const card of deck.cards) {
    for (const name of card.아키타입) {
      if (archetypeCount[name] === undefined) {
        if (on.includes('C1')) {
          report('C1', `카드 '${card.이름}' 의 아키타입 '${name}' 이 사전에 없다.`);
        }
        continue;
      }
      archetypeCount[name] += 1;
    }

    for (const name of card.키워드) {
      if (keywordCount[name] === undefined) {
        if (on.includes('C1')) {
          report('C1', `카드 '${card.이름}' 의 키워드 '${name}' 이 사전에 없다.`);
        }
        continue;
      }
      keywordCount[name] += 1;
    }

    if (on.includes('C8') && card.아키타입.length === 0) {
      report('C8', `고아 카드 — '${card.이름}' (${card.id}) 은 어느 아키타입에도 안 낀다.`);
    }
    if (on.includes('C12') && card.텍스트.length > 40) {
      report('C12', `'${card.이름}' 의 규칙 텍스트가 ${card.텍스트.length}자다. 너무 길다.`);
    }
  }

  if (on.includes('C9')) {
    for (const [name, need] of Object.entries(deck.아키타입)) {
      if (archetypeCount[name] >= need) {
        continue;
      }
      report('C9', `아키타입 '${name}' 이 ${archetypeCount[name]}장이다. 최소 ${need}장이 필요하다.`);
    }
  }

  if (on.includes('C10')) {
    for (const [name, count] of Object.entries(keywordCount)) {
      if (count > 1) {
        continue;
      }
      report('C10', `키워드 '${name}' 을 쓰는 카드가 ${count}장이다. 규칙만 는다.`);
    }
  }

  if (on.includes('C11')) {
    const byCost = {};
    for (const card of deck.cards) {
      byCost[card.비용] = (byCost[card.비용] || 0) + 1;
    }
    const costs = Object.keys(byCost).map(Number).filter((n) => !Number.isNaN(n));
    for (let c = Math.min(...costs); c <= Math.max(...costs); c += 1) {
      if (byCost[String(c)]) {
        continue;
      }
      report('C11', `비용 ${c} 짜리 카드가 0장이다. 곡선에 구멍이 있다.`);
    }
  }

  if (on.includes('C13')) {
    const byKind = {};
    for (const card of deck.cards) {
      byKind[card.종류] = (byKind[card.종류] || 0) + 1;
    }
    for (const [kind, need] of Object.entries(deck.슬롯)) {
      const have = byKind[kind] || 0;
      if (have >= need) {
        continue;
      }
      report('C13', `뼈대 슬롯 '${kind}' 이 ${have}/${need} 장이다. 자리가 비어 있다.`);
    }
  }
}

function chainToMermaid(chain) {
  const lines = ['flowchart LR'];
  const seen = new Set();

  chain.buildings.forEach((b, i) => {
    lines.push(`    B${i}["${b.이름}"]`);
  });

  chain.buildings.forEach((b, i) => {
    for (const need of b.넣는것) {
      const key = `R_${need.이름}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`    ${key}(["${need.이름}"])`);
      }
      lines.push(`    ${key} -->|"${need.개수}"| B${i}`);
    }
    for (const out of b.나오는것) {
      const key = `R_${out.이름}`;
      if (!seen.has(key)) {
        seen.add(key);
        lines.push(`    ${key}(["${out.이름}"])`);
      }
      lines.push(`    B${i} -->|"${out.개수}"| ${key}`);
    }
  });

  return lines.join('\n');
}

function cardsToMermaid(deck, archetype) {
  const lines = ['flowchart LR', `    A["${archetype}"]`];
  const members = deck.cards.filter((c) => c.아키타입.includes(archetype));

  members.forEach((card, i) => {
    lines.push(`    C${i}["${card.이름} (${card.비용})"]`);
    lines.push(`    A --> C${i}`);
  });

  return lines.join('\n');
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.log('쓰는 법 : node lint.js <파일.md> [--mermaid]');
    process.exit(2);
  }

  const profiles = loadProfiles();
  const text = fs.readFileSync(file, 'utf8');
  const techBlocks = parseFenced(text, ['tech']);
  const techs = readTech(techBlocks);
  const blocks = parseFenced(text, ['chain', 'cards']);
  if (blocks.length === 0) {
    console.log('chain · cards 블록을 못 찾았다.');
    process.exit(2);
  }

  let bad = 0;

  for (const block of blocks) {
    const profileName = block.header.profile || block.tag;
    const profile = profiles[profileName];
    if (!profile) {
      console.log(`\n프로필 '${profileName}' 이 profiles.json 에 없다.`);
      bad += 1;
      continue;
    }

    const on = profile.검사 || [];
    const found = [];
    const report = (code, 글) => found.push({ code, 글 });

    console.log(`\n[${block.header.name || block.tag}] 프로필 ${profileName} · 켠 검사 ${on.join(' ')}`);

    if (block.tag === 'chain') {
      const chain = readChain(block);
      lintChain(chain, techs, on, report);
      if (args.includes('--mermaid')) {
        console.log('```mermaid');
        console.log(chainToMermaid(chain));
        console.log('```');
      }
    }

    if (block.tag === 'cards') {
      const deck = readCards(block);
      lintCards(deck, on, report);
      if (args.includes('--mermaid')) {
        for (const name of Object.keys(deck.아키타입)) {
          console.log('```mermaid');
          console.log(cardsToMermaid(deck, name));
          console.log('```');
        }
      }
    }

    if (found.length === 0) {
      console.log('  문제 없음');
      continue;
    }
    bad += found.length;
    for (const f of found) {
      console.log(`  [${f.code}] ${f.글}`);
    }
  }

  console.log(`\n오류 ${bad}개`);
  if (bad > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { readChain, readCards, lintChain, lintCards, chainToMermaid, cardsToMermaid, spread };
