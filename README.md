# SALROM PPT

찬양 가사 전체를 붙여넣고 슬라이드 초안을 만든 다음, 카드에서 바로 수정해 PPTX로 받거나 웹 화면으로 송출하는 정적 웹 앱입니다. PC에서 제작하는 흐름을 우선했고, 태블릿 화면에서도 기본 편집을 할 수 있습니다.

## 시작하기

Node.js 24와 npm이 필요합니다.

```bash
npm ci
npm run dev
```

개발 주소는 기본적으로 `http://localhost:5173/salrom-ppt/`입니다. 실제 배포 파일은 다음 명령으로 `dist/`에 생성됩니다.

```bash
npm run test
npm run build
npm run preview
```

## 매주 사용하는 방법

1. 사이트의 **편집 시작**을 누르고 `153`을 입력합니다.
2. **이번 주 PPT 만들기**에서 날짜와 예배 이름을 확인합니다.
3. **새 찬양 추가**에서 제목과 가사 전체를 붙여넣고 **자동으로 슬라이드 나누기**를 누릅니다. 이미 만든 곡은 **보관함에서 추가**에서 검색합니다. 제목의 공백이나 문장부호가 달라도 검색됩니다.
4. 슬라이드 카드의 가사를 클릭하여 바로 수정합니다. Enter는 줄바꿈, Ctrl+Enter는 커서 위치에서 새 슬라이드로 분리합니다. 카드 사이의 `+`, 합치기, 복제, 삭제, 드래그로 정리할 수 있습니다. Ctrl/Shift 클릭으로 여러 장을 선택하여 일괄 복제·삭제할 수 있습니다. 미리보기의 **글꼴 메뉴**에서 원하는 글꼴도 바로 고를 수 있습니다.
5. **전체 미리보기**로 모든 장을 확인한 뒤 **PPTX 다운로드**를 누릅니다. 파일명은 `날짜_예배이름_찬양.pptx`입니다.
6. 컴퓨터에서 바로 송출하려면 **예배 화면으로 보기**를 누릅니다. 화면의 **전체화면** 버튼 또는 `F`로 전체화면을 켭니다.

편집은 자동 저장됩니다. 상단의 **저장됨** 표시를 확인한 뒤 브라우저를 닫으세요. 저장 중 탭을 닫으면 경고가 나타납니다.

### 편집 단축키

| 키 | 동작 |
| --- | --- |
| Enter | 가사 줄바꿈 |
| Ctrl+Enter | 커서 위치에서 다음 슬라이드로 분리 |
| Ctrl+Z / Ctrl+Shift+Z | 실행 취소 / 다시 실행 |
| Ctrl+D | 선택한 슬라이드 복제 |
| Delete | 선택한 슬라이드 삭제 |
| ↑ / ↓ | 카드에 포커스가 있을 때 선택 이동 |

Mac에서는 Ctrl 대신 Command도 사용할 수 있습니다. 슬라이드 목록에는 실행 취소·다시 실행 버튼도 있습니다.

### 예배 화면 조작

| 키 | 동작 |
| --- | --- |
| → / Space | 다음 장 |
| ← | 이전 장 |
| Home / End | 첫 장 / 마지막 장 |
| F | 브라우저 전체화면 전환 |
| Esc | 전체화면 종료. 전체화면 밖에서는 예배 화면 종료 |

마우스를 움직이면 잠깐 조작 버튼이 나타나고 잠시 후 커서와 함께 사라집니다. 터치 화면에서는 좌우 스와이프를 사용할 수 있습니다. 페이지 번호 표시와 화면 클릭으로 다음 장 이동은 관리자 설정에서 켤 수 있으며, 기본값은 둘 다 꺼져 있습니다. 예배 화면 진입 시 슬라이드를 메모리에 고정하므로, 이미 열린 예배 자료는 인터넷이 순간적으로 끊겨도 넘길 수 있습니다.

## 보기·편집·관리자 접근

사이트는 보기 화면으로 시작합니다. 편집을 시작할 때만 `153`을 묻고, 현재 브라우저 세션 동안 유지합니다. 편집 중 왼쪽 위 **SALROM PPT** 로고를 빠르게 두 번 클릭하고 `1221`을 입력하면 관리자 화면이 열립니다. 관리자에서는 찬양과 주간 자료 수정·삭제·복제, 글꼴·기본 글자 크기·안전 여백·송출 옵션 설정, JSON 백업·복원·전체 초기화를 할 수 있습니다. 전체 초기화에는 `전체 삭제`를 직접 입력해야 합니다.

**두 비밀번호는 실제 보안용 인증이 아닙니다.** 정적 프런트엔드에 포함되어 개발자 도구로 확인할 수 있습니다. 편집 화면에 실수로 들어가는 일을 막는 수준입니다. 다른 사람이 데이터를 변경하지 못하게 해야 한다면 서버 인증과 권한 검사를 추가해야 합니다. 비밀번호 판정은 `src/lib/auth.ts`에 분리했습니다.

## 저장과 백업

- 찬양, 주간 자료, 설정과 추가한 글꼴은 브라우저 **IndexedDB**에 저장됩니다. 글꼴 파일은 별도 저장소에 두어 가사를 수정할 때마다 큰 파일을 다시 쓰지 않습니다. IndexedDB가 불가능할 때는 긴급 복구용 `localStorage`를 사용합니다.
- 편집 잠금 상태는 `sessionStorage`에 저장되어 브라우저 세션 동안 유지됩니다.
- 주간 자료의 각 곡은 추가 당시 슬라이드의 **독립 복사본(Snapshot)**을 담습니다. 보관함의 원본 찬양을 나중에 수정해도 지난 주간 자료는 바뀌지 않습니다.
- 다른 브라우저나 PC에는 로컬 자료가 자동으로 옮겨지지 않습니다. 관리자에서 **JSON 백업 다운로드** 후 대상 PC에서 **JSON 복원**을 하세요. 직접 추가한 글꼴 파일도 JSON에 포함됩니다. 복원 전 현재 데이터는 앱 내부 백업으로 남깁니다. 중요한 주간 자료는 예배 전에 별도 JSON과 PPTX로 백업하는 것을 권장합니다.
- **전체 초기화**는 확인 문구와 재확인을 거친 뒤, 초기화 전 자료를 별도의 IndexedDB 복구 저장소에 먼저 기록합니다. JSON 다운로드가 차단되더라도 관리자 **백업과 복원 → 초기화 전 복구 백업**에서 되돌릴 수 있습니다. 브라우저 저장소를 지우면 이 복구본도 사라지므로 정기적으로 JSON 파일을 보관하세요.
- 관리자 **상태** 탭에서 저장 위치, 마지막 백업, GitHub 동기화 상태를 확인할 수 있습니다.

데이터 구조는 `src/types.ts`, 입력 검증·저장 코드는 `src/lib/storage.ts`, 샘플은 `schema/backup.example.json`에 있습니다.

```text
AppData
├── songs[]: id, title, normalizedTitle, rawLyrics, slides[], createdAt, updatedAt, lastUsedAt, version
├── weeks[]: id, date, name, items[] { id, type, title, songId?, slides[] Snapshot }, createdAt, updatedAt
├── settings: fontFamily, fontSize, minFontSize, maxLines, safeMargin, titleSlides, showCounter, clickToAdvance
├── customFonts[]: id, name, family, fileName, dataUrl, weight, createdAt
└── backups[]: createdAt과 당시 songs/weeks/settings/customFonts의 복사본
```

`safeMargin`은 한쪽 여백 비율입니다. 기본값 `0.08`은 각 가장자리의 8%입니다. 보관함의 `section`은 슬라이드별 Verse/Chorus/Bridge 등 구간 이름입니다. 같은 제목의 곡은 등록 중 경고하고, 관리자에서 중복 후보를 확인할 수 있습니다.

## GitHub 저장과 배포

이 저장소는 [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)용 Vite 정적 앱입니다. `.github/workflows/deploy.yml`이 `main`에 푸시될 때 테스트·빌드 후 `dist/`를 배포합니다. 저장소 **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정하세요. 배포가 성공하면 기본 주소는 `https://habin5725-prog.github.io/salrom-ppt/`입니다.

`vite.config.ts`의 `base: '/salrom-ppt/'`는 이 저장소의 Pages 하위 경로에 맞춘 설정입니다. 다른 저장소명이나 루트 도메인으로 배포하면 함께 바꿔야 합니다.

향후 자료 보관용 경로를 준비해 두었습니다.

```text
data/songs/
data/weeks/2026/2026-10-11.json
exports/2026/2026-10-11_주일예배_찬양.pptx
public/data/published.json
```

현재 앱에서 내보낸 주간 JSON과 PPTX를 위 경로에 수동으로 추가할 수 있습니다. **다른 방문자가 주간 자료를 보기 화면에서 열어야 한다면**, 관리자 JSON 백업 중 공개해도 되는 자료만 골라 `public/data/published.json`에 배포하고 다시 빌드해야 합니다. 이 파일은 누구나 다운로드할 수 있습니다. 실제 찬양 가사에는 저작권이 있을 수 있으므로 공개 저장소에 올리기 전에 사용 권한과 저장소 공개 범위를 확인하세요. 현재 저장소의 예시 가사는 직접 작성한 짧은 더미 문구입니다.

GitHub Pages만으로 브라우저에서 안전하게 GitHub에 쓰는 인증은 제공할 수 없습니다. **GitHub 자동 저장은 아직 연결하지 않았습니다.** 토큰이나 비밀키를 프런트엔드에 넣지 않았습니다. 향후 OAuth 또는 안전한 중계 서버를 연결할 자리는 `src/lib/githubSync.ts`의 `GitHubSyncService` 인터페이스입니다. 지금은 IndexedDB 자동 저장과 JSON 백업·복원을 사용하세요.

## 글꼴과 화면 디자인

모든 송출 슬라이드는 16:9, 완전한 검정 배경, 흰 글씨, 중앙 정렬입니다. 새 기본 글꼴은 **Pretendard**이며, 차분한 **나눔명조**, 기존 **Paperlogy**, **맑은 고딕·굴림·바탕·Arial·Georgia**도 선택할 수 있습니다. Pretendard·나눔명조·Paperlogy는 사이트에 파일을 포함하므로 별도 설치 없이 웹 미리보기와 송출에 사용됩니다. 나머지 글꼴은 사용 중인 기기에 설치되어 있어야 합니다.

편집 미리보기의 글꼴 메뉴 또는 **관리자 → 설정 → 가사 글꼴**에서 변경하세요. 선택은 자동 저장되며 미리보기, 예배 화면, PPTX 출력에 적용됩니다. 원하는 글꼴은 다음 방법으로 추가할 수 있습니다.

- **글꼴 이름 입력:** PC에 설치된 글꼴의 정확한 이름을 입력하고 **적용**을 누릅니다.
- **내 PC 글꼴에서 고르기:** 지원하는 데스크톱 Chrome·Edge에서는 브라우저의 글꼴 접근을 허용하면 설치된 글꼴을 검색하고 선택할 수 있습니다. 지원하지 않는 브라우저에서는 이름 입력이나 파일 추가를 사용하세요.
- **글꼴 파일 선택:** 사용 권한이 있는 TTF·OTF·WOFF·WOFF2 파일을 추가합니다. 파일당 **15MB 이하**이며 이 브라우저에 저장됩니다. 다른 PC의 웹 송출에서도 사용하려면 JSON 백업·복원으로 함께 옮기세요.

**PPTX에는 글꼴 파일을 내장하지 않습니다.** PowerPoint에서 같은 모습으로 보려면 PPTX를 여는 PC에도 선택한 글꼴을 설치하세요. 업로드한 글꼴 이름을 PowerPoint가 다르게 인식하면 글꼴 메뉴의 **PowerPoint 글꼴 이름 확인**에서 실제 이름을 지정할 수 있습니다. 웹에서 선택한 글꼴을 찾지 못하면 한국어 시스템 글꼴로 표시됩니다.

포함한 글꼴의 공식 출처는 [Pretendard](https://github.com/orioncactus/pretendard), [나눔명조](https://github.com/google/fonts/tree/main/ofl/nanummyeongjo), [Paperlogy](https://github.com/Freesentation/paperlogy)입니다. 모두 SIL Open Font License 1.1이며, 각 라이선스와 파일 출처·검증 정보는 [`public/fonts/`](public/fonts/)의 `Pretendard-OFL.txt`, `NanumMyeongjo-OFL.txt`, `OFL-license.txt`, `font-sources.txt`에 포함했습니다.

긴 가사는 안전 영역 안에서 글자 크기를 줄이되 설정한 최소 크기 아래로 내리지 않습니다. 너무 긴 줄이나 줄 수 초과 항목은 카드에 경고와 자동 정리 버튼을 보여 줍니다. 웹 미리보기와 PPTX 출력은 `src/lib/fit.ts`의 같은 계산을 사용합니다. 최종 송출 PC의 글꼴 설치와 PowerPoint 렌더링 차이를 고려하여 예배 전에 PPTX 전체 화면을 한 번 확인하세요.

## 코드 구조

```text
src/App.tsx                    화면 흐름, 주간 Setlist, 보관함
src/components/SlideEditor.tsx 슬라이드 카드 편집, 선택, DnD, Undo/Redo
src/components/SlideCanvas.tsx 편집 화면 16:9 미리보기
src/components/Presentation.tsx 웹 예배 송출 화면
src/components/AdminPanel.tsx  관리자 설정·백업·복원
src/components/FontPicker.tsx  글꼴 선택, PC 글꼴 목록, 파일 추가
src/lib/fonts.ts               글꼴 로딩·검증, PPTX 글꼴 이름
src/lib/split.ts               자동 분할 및 반복 후보 감지
src/lib/fit.ts                 글자 크기와 안전 영역 계산
src/lib/pptx.ts                클라이언트 PPTX 생성
src/lib/storage.ts             IndexedDB 저장, 검증, JSON 백업
src/lib/auth.ts                편집·관리자 접근 장치
src/lib/githubSync.ts          향후 GitHub 동기화 인터페이스
```

## 현재 한계

- 다른 기기와 실시간 자동 동기화는 없습니다. JSON 백업·복원 또는 수동 공개 데이터 배포가 필요합니다.
- 관리자·편집 비밀번호는 보안 인증이 아닙니다.
- 별도 운영자 창, 연결된 후렴 반복 참조, 오프라인 재방문용 PWA는 아직 제공하지 않습니다. 현재 열린 송출 화면은 네트워크 없이도 계속 넘길 수 있습니다.
- 슬라이드의 매우 긴 한 줄은 최소 글자 크기에서 경고합니다. 제작자가 그대로 유지할 수 있으나 예배용 PC에서 시각 검수를 권장합니다.

## 검증

`npm run test`는 가사 분할, 긴 줄 감지, 반복 구절, Snapshot/JSON, PPTX 생성, 자동 저장 순서 관련 테스트를 실행합니다. `npm run build`는 TypeScript 검사와 실제 정적 배포 파일 생성을 확인합니다. 브라우저 점검에서는 새 찬양 입력부터 자동 분할, 카드 수정과 Ctrl+Enter/Undo, 새로고침 복구, 관리자 진입, 웹 송출 단축키와 전체화면, PPTX 다운로드 요청, 초기화 전 복구본의 새로고침 후 복원을 확인합니다.
