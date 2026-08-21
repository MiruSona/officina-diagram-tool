# ToolTest — 도구 시험 한자리

**`Tools/` 에 있는 도구를 시험하는 곳이다.** 견본과 기대값을 여기 몰아 둔다.

```
node ToolTest/test.js        <- 이것 하나면 된다. 회귀 시험 전부
```

## 폴더

| 어디 | 무엇 |
| --- | --- |
| `ToolTest/test.js` | 회귀 시험. **기대값이 여기 적혀 있다** |
| `ToolTest/Draw/` | 설명용 그림 툴 견본 |

앞으로 다른 툴(그림·사운드)이 생기면 `ToolTest/` 아래에 폴더를 하나씩 더한다.

## 견본 두 갈래

| 이름 | 무엇 | 돌리면 |
| --- | --- | --- |
| `견본*.md` | **통과해야 하는 것.** 제대로 된 도면·표 | 오류 0개 |
| `시험견본*.md` | **잡아야 하는 것.** 일부러 틀리게 만든 것 | 오류가 나와야 정상 |

**검사를 새로 만들면 두 갈래에 다 넣는다.** 잡는 것만 확인하고 안 잡는 것을 확인 안 하면,
멀쩡한 설계를 오류로 뱉는 도구가 된다.

## 눈으로 보는 것

| 파일 | 어떻게 |
| --- | --- |
| `Draw/견본.html` · `Draw/견본-타임라인.html` | 브라우저로 연다 |
| `Docs/Design/Wireframe/견본-HUD.html` | 〃 (CSS 를 링크로 물고 있어 저장소 안에서 열어야 한다) |
| `Docs/Design/Wireframe/견본-머메이드.md` | 마크다운 미리보기로 연다 |

## 다시 뽑는 법

```
node Tools/Draw/tilemap.js  ToolTest/Draw/견본.md ToolTest/Draw/견본-중력.md --html ToolTest/Draw/견본.html
node Tools/Draw/timeline.js ToolTest/Draw/견본-타임라인.md --html ToolTest/Draw/견본-타임라인.html
```
