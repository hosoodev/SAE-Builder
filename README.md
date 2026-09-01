# SAE Builder

HTML-first SEO/AEO 정적 사이트 빌더이며 `@hosoodev/sae-builder` 패키지와
`sae` CLI를 제공합니다.

## 설치

현재 공개 GitHub 릴리스에서 설치할 수 있습니다.

```bash
pnpm add -D github:hosoodev/SAE-Builder#v0.3.5
```

설치 후 사이트의 `package.json`에서 다음 명령을 연결합니다.

```json
{
  "scripts": {
    "dev": "sae dev",
    "build": "sae build",
    "check": "sae check",
    "clean": "sae clean"
  }
}
```

```js
import { defineConfig } from "@hosoodev/sae-builder";
```

npm registry 배포가 시작되면 동일한 패키지명을 버전 범위로 설치할 수 있습니다.

```bash
pnpm add -D @hosoodev/sae-builder
```

## 웹 서비스 키 통합

builder.config.mjs의 integrations에 공개 서비스 키만 지정하면 프로덕션
빌드에서 모든 페이지의 head 태그와 루트 검증 파일을 자동 생성합니다.

    export default defineConfig({
      // ...
      integrations: {
        naverAnalytics: "네이버_애널리틱스_사이트_ID",
        naverSiteVerification: "네이버_사이트_소유확인_키",
        daumSiteVerification: "다음_검증_해시:다음_서명_키",
        googleAnalytics: "G-XXXXXXXXXX",
        googleAdSense: "ca-pub-0000000000000000"
      }
    });

- 네이버·Google 분석 및 AdSense 스크립트와 검증 meta 태그는 모든 프로덕션
  HTML 페이지의 head에 들어갑니다.
- 다음 웹마스터 검증 문자열은 robots.txt 마지막에
  #DaumWebMasterTool:<키> 형식으로 추가됩니다.
- googleAdSense에서 ads.txt의 Google DIRECT 레코드를 자동 생성합니다.
- sae dev 개발 빌드에는 외부 추적·광고 코드와 소유 확인 파일을 넣지 않습니다.
- 이 값들은 브라우저와 공개 파일에 노출되는 공개 식별자입니다. API 비밀키나
  서버 자격 증명은 입력하지 마세요.

HTML을 최종 기준으로 삼는 SEO/AEO 정적 사이트 빌더입니다. Node.js 20.9 이상에서
TypeScript ESM 라이브러리와 `sae` CLI로 사용할 수 있습니다.

현재 공개 API와 CLI에 연결된 범위는 다음과 같습니다.

- Markdown 및 제한된 MDX, Front Matter 기반 콘텐츠 로딩
- layout/partial 렌더링과 정적 경로 출력
- canonical, hreflang, JSON-LD, sitemap, RSS, robots 생성 및 SEO 검사
- CSS/JavaScript 번들링, 파일 해싱, WebP/AVIF helper와 페이지별 자동 OG 생성
- content collection, locale routing, plugin hook
- dependency graph 기반 page render 재사용과 byte-selective output 동기화
- `build`, `check`, `clean`, `dev`, `inspect` CLI 명령

## URL 끝 슬래시

사이트별 `builder.config.mjs`의 `build.trailingSlash`로 비루트 페이지의 출력
형식을 선택합니다.

```js
build: {
  trailingSlash: false
}
```

- 기본값 `true`: `/guide/example/index.html`을 생성해 `/guide/example/` 형식으로 제공합니다.
- `false`: `/guide/example.html`을 생성해 Cloudflare Pages 등의 clean URL
  환경에서 `/guide/example` 형식으로 제공합니다.
- 루트 페이지는 설정과 관계없이 `index.html`입니다.
- canonical, sitemap과 내부 route는 확장자 없이 유지됩니다.

## 개발 명령

저장소 루트에서 의존성을 설치한 뒤 패키지 명령을 실행합니다.

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm test
corepack pnpm check
```

빌드된 CLI로 consumer 사이트를 처리할 수 있습니다.

```bash
pnpm exec sae build --root path/to/site
pnpm exec sae check --root path/to/site
pnpm exec sae inspect /guide/example/ --root path/to/site
pnpm exec sae inspect https://example.com/guide/example/ --root path/to/site --config builder.config.mjs
```

`dev` 명령은 개발 서버와 파일 감시 재빌드를 제공합니다. `inspect`는 production
`check`를 파일 기록 없이 실행한 뒤, 정규화한 route 또는 전체 canonical URL에
해당하는 페이지 근거를 JSON으로만 출력합니다. 출력에는 `source`, `route`,
`layout`, `partials`, `canonical`, `locale`, `hreflangAlternatives`, `jsonLd`,
`dependencies`, `assets.css`, `assets.js`가 포함됩니다. 일치하는 페이지가 없으면
임의의 결과를 선택하지 않고 `INSPECT_NOT_FOUND` 오류로 종료합니다.

## 벤치마크

실제 공개 `build()` 경로의 cold, unchanged warm, one-content-change 빌드를 격리된
합성 consumer로 측정합니다.

```bash
corepack pnpm benchmark
corepack pnpm benchmark -- --pages 10
corepack pnpm benchmark -- --pages 100,1000 --require-incremental-mtimes
```

옵션, 출력 계약, 해석 방법은 [benchmarks/README.md](./benchmarks/README.md)에
정리되어 있습니다.

## 핵심 API

패키지 root는 `build`, `check`, `clean`, `defineConfig`, `defineCollection`,
`ContentRepository`, `image`, `createPluginRunner`와 관련 타입을 공개합니다.
`assets.optimizeImage()`/`image()`는 intrinsic size와 WebP/AVIF `<picture>`를 만들고,
`og.enabled`는 명시적 `image`가 없는 페이지에 해시 OG 파일을 자동 연결합니다.
OG 디자인은 Builder에 내장하지 않습니다. 자동 생성을 사용하려는 소비 사이트는 자신의
`templates` 디렉터리에 SVG를 두고 `og.templates.default: "og/default.svg"`처럼
지정합니다. 사용할 템플릿이 없으면 해당 페이지의 OG 이미지만 생성하지 않고 빌드는
계속됩니다. Builder는 사이트 템플릿의 안전성 검사·변수 치환·래스터 변환·해싱만
담당합니다.

한글처럼 빌드 환경의 기본 폰트에 의존할 수 없는 문자는 사이트가 소유한 폰트를
템플릿 디렉터리 아래에 두고 함께 지정합니다. Builder는 Sharp를 불러오기 전에
해당 파일을 Fontconfig에 등록하므로 Linux CI·Docker에서도 같은 글리프를
찾을 수 있습니다.

```js
og: {
  enabled: true,
  fontFamily: "'Nanum Gothic', sans-serif",
  fonts: [
    { file: "og/fonts/NanumGothic-Regular.ttf", weight: 400 },
    { file: "og/fonts/NanumGothic-Bold.ttf", weight: 700 }
  ],
  templates: { default: "og/default.svg" }
}
```

SVG 템플릿은 원문 `title`, `subtitle` 외에도 `titleLine1`,
`titleLine2`, `subtitleLine1`부터 `subtitleLine3`까지 사용할 수 있습니다.
줄 단위 placeholder를 `tspan`에 배치하면 긴 문구가 이미지 밖으로 넘치지 않습니다.
플러그인 산출물도 Core/public/SEO/OG 산출물과 같은 소유권 검사를 거칩니다.

`BuildResult.incremental`은 `renderedPages`, `reusedPages`, invalidated output과
written/unchanged/removed file을 보고합니다. 현재 플러그인이 등록된 빌드는 외부
의존성 순수성을 추정하지 않고 page render 재사용을 보수적으로 끕니다. 플러그인이
없는 빌드는 변경되지 않은 page의 캐시 hash를 확인한 뒤 template render를 생략합니다.

## 현재 제한

- 콘텐츠 파일은 repository/SEO 전체 검증을 위해 warm build에서도 파싱합니다.
- collection schema별 generic 반환 타입 narrowing은 후속 버전 대상입니다.
- `translationKey` 없는 번역 페이지는 hreflang을 추정하지 않습니다.
- responsive image helper는 공개 async API이며 inline template 표현식 컴파일러는 아직 없습니다.
- 동일 프로젝트에 대한 동시 build process lock은 아직 제공하지 않습니다.
