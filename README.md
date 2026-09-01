# DiagramTool — 설명용 그림 툴

**기획·설계 문서에 넣는 그림을 마크다운 코드펜스로 그리고, 그 그림이 말이 되는지 검사한다.**
글로 길게 풀어 쓰던 레벨·페이싱·생산 사슬을 도면 한 장으로 바꾸고, 도면이 틀리면 도구가 잡아 준다.

이 폴더 하나로 완결된다. 바깥 폴더를 가리키는 경로는 없다. 폴더째 떼어 다른 프로젝트에 넣어도 돈다.
필요한 것은 **Node.js** 뿐이다. 설치할 패키지는 없다.

## 폴더 지도

| 어디 | 무엇 |
| --- | --- |
| `src/` | 도구 본체 |
| `Test/` | 견본과 회귀 시험 |
| `Docs/Guide/` | **쓰기 전에 읽을 것.** 문자 약속·표 서식·Mermaid 규칙 |
| `Docs/Research/` · `Docs/Design/` | 왜 이렇게 만들었나 |
| `Docs/Todo/` · `Docs/History/` | 남은 일 · 지난 수정 내역 |

`src/` 안은 이렇다.

| 파일 | 무엇 |
| --- | --- |
| `tilemap.js` | 엔진 A. 레벨·맵 격자 도면을 검사하고 HTML 로 그린다 |
| `timeline.js` | 엔진 B. 프레임·페이싱·개수 분포 표를 막대로 그린다 |
| `lint.js` | 엔진 C. 생산 사슬·카드·테크 표를 검사하고 Mermaid 로 뽑는다 |
| `all.js` | 폴더를 통째로 훑어 위 셋을 한꺼번에 돌린다 |
| `profiles.json` | 도면 프로필 (문자표 + 켤 검사 목록). **장르가 늘면 여기에 더한다** |
| `common.js` | 코드펜스·표 읽기 공통 |
| `wireframe.css` | 와이어프레임 HTML 이 무는 클래스 |

## 쓰는 법

문서 안에 코드펜스로 도면을 적고, 그 문서에 도구를 돌린다.

**명령 앞자리가 두 벌이다.** 이 저장소를 단독으로 열었으면 `node src/…`,
스튜디오(Officina)에 서브모듈로 물린 상태면 `node DiagramTool/src/…` 로 부른다.
아래 표는 단독 기준이다.

| 그리려는 것 | 코드펜스 | 명령 |
| --- | --- | --- |
| 레벨·맵 | `tilemap` | `node src/tilemap.js <파일.md>` |
| 프레임·페이싱·개수 분포 | `timeline` `pacing` `count` | `node src/timeline.js <파일.md>` |
| 생산 사슬·카드·테크 | `chain` `cards` `tech` | `node src/lint.js <파일.md>` |
| 상태도·흐름도 | `mermaid` | 도구 없음. `Docs/Guide` 의 `그림그리기.md` 규칙만 지킨다 |

```
# 단독 저장소에서
node src/tilemap.js  <파일.md ...> [--preview] [--html 결과.html]
node src/timeline.js <파일.md ...> [--html 결과.html]
node src/lint.js     <파일.md ...> [--mermaid]
node src/all.js      [폴더 ...]

# 스튜디오에서 (서브모듈로 물린 상태)
node DiagramTool/src/tilemap.js  <파일.md ...> [--preview] [--html 결과.html]
node DiagramTool/src/timeline.js <파일.md ...> [--html 결과.html]
node DiagramTool/src/lint.js     <파일.md ...> [--mermaid]
node DiagramTool/src/all.js      [폴더 ...]
```

- 파일은 여러 개 넘길 수 있다. 잡힌 게 있으면 **exit 1** 로 끝난다.
- `--html` 은 결과를 브라우저로 볼 수 있는 그림으로 뽑는다. `--preview` 는 터미널에 바로 그린다.
- `all.js` 는 **폴더를 안 적으면 지금 있는 폴더**를 통째로 훑는다. 검사만 하고 HTML 은 안 뽑는다.
- 가이드 문서의 예시 조각처럼 일부러 틀린 도면은 머리말에 `예시=참` 을 붙여 건너뛴다.

**도면을 넣었으면 그 문서에 검사를 돌리고 오류 0 을 확인한 뒤에 보고한다.**

## 시험 돌리는 법

```
node DiagramTool/Test/test.js
```

`통과 83개 · 실패 0개` 가 나오면 정상이다. 자세한 것은 `Test/README.md` 를 본다.

## 먼저 읽을 문서

| 문서 | 무엇 |
| --- | --- |
| `Docs/Guide` 의 `타일기호.md` | 타일맵에서 쓰는 문자 약속 |
| `Docs/Guide` 의 `도면서식.md` | 표 서식과 검사 목록 |
| `Docs/Guide` 의 `그림그리기.md` | Mermaid 를 언제 어떻게 쓰나 |
