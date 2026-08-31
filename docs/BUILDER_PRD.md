# PRD — SEO/AEO Static Site Builder

## 1. 제품 개요

### 제품명(가칭)
`SAE Builder` — SEO/AEO Static Builder

### 목적

계산기, 변환기, 정보형 도구, 지역/업종 디렉터리, 콘텐츠 허브처럼 SEO 유입을 핵심 성장 채널로 사용하는 사이트를 빠르게 제작하기 위한 정적 사이트 빌더를 만든다.

React/Next.js 같은 애플리케이션 프레임워크의 런타임과 hydration을 기본 전제로 하지 않는다. 최종 산출물은 크롤러와 사용자에게 동일하게 전달되는 완전한 HTML 문서이며 필요한 페이지에서만 JavaScript를 로드한다.

### 핵심 원칙

1. HTML First
2. Zero Runtime by Default
3. Progressive Enhancement
4. SEO/AEO Convention over Configuration
5. Fast Build
6. Deterministic Output
7. Privacy by Default
8. Portable Content
9. Framework-independent interactive islands
10. Plugin-extensible architecture

---

## 2. 주요 사용 사례

- 영문주소 변환기
- 환율 계산기
- 영문이름 변환기
- 날짜/단위/세금 계산기
- 복권 정보
- 지역 행사/박람회 정보
- 브랜드 AS 정보
- 데이터 기반 랜딩페이지
- 가이드/FAQ/지식베이스
- 다국어 정보 사이트

---

## 3. 비목표

초기 버전에서 다음은 목표로 하지 않는다.

- React Server Components
- 서버 상태가 중요한 SaaS 대시보드
- 사용자 인증 프레임워크
- DB ORM
- 결제 시스템
- 복잡한 SPA router
- 자체 CMS
- 자체 클라우드 배포 플랫폼

필요한 경우 외부 API 및 별도 백엔드와 결합한다.

---

# 4. 기능 요구사항

## 4.1 HTML Template — Layout / Partial

### 요구사항

다음을 지원한다.

```text
templates/
├── layouts/
│   ├── default.html
│   ├── guide.html
│   └── landing.html
└── partials/
    ├── head.html
    ├── header.html
    ├── footer.html
    ├── breadcrumbs.html
    └── related-content.html
```

문법:

```html
{{title}}
{{site.name}}
{{{content}}}
{{> header}}
```

지원:

- variable escaping
- raw variable
- partial
- nested variable
- layout 선택
- build-time helper
- template cache

초기 버전에서는 조건문/반복문을 최소화한다.
복잡한 로직은 content pipeline 또는 helper에서 처리한다.

---

## 4.2 Markdown / MDX

지원 확장자:

```text
.md
.mdx
```

Markdown은 기본 콘텐츠 형식이다.

MDX는 다음 용도로 제한한다.

- 정적 callout
- 비교표 컴포넌트
- 계산기 placeholder
- CTA
- Schema helper

MDX 내부에서 임의의 서버 코드 실행을 허용하지 않는다.

권장 파이프라인:

```text
remark-parse
remark-gfm
remark-frontmatter
remark-mdx
remark-rehype
rehype-slug
rehype-autolink-headings
rehype-external-links
rehype-stringify
```

---

## 4.3 Front Matter

필수 필드:

```yaml
title:
description:
slug:
```

표준 스키마:

```yaml
---
title: "Address Line 1과 2 차이"
description: "해외 주소 입력란의 차이를 설명합니다."
slug: "/guide/address-line-1-2/"
layout: "guide"
locale: "ko"
translationKey: "address-line"
date: "2026-08-27"
updated: "2026-08-27"
draft: false
noindex: false
canonical:
image:
schemaType: "Article"

tags:
  - 영문주소
  - 해외직구

collection: "guides"

sitemap:
  priority: 0.8
  changefreq: monthly
---
```

Zod 등의 스키마로 build-time validation을 수행한다.

잘못된 Front Matter가 있으면 프로덕션 빌드는 실패한다.

---

# 5. Content Collection

예:

```text
content/
├── pages/
├── guides/
├── tools/
├── faq/
└── data/
```

각 collection에 스키마를 선언한다.

예:

```ts
defineCollection({
  name: "guides",
  schema: guideSchema
})
```

기능:

- 타입 생성
- query
- filter
- sort
- pagination
- related content
- tag index
- category index

API 예:

```ts
const guides = content
  .collection("guides")
  .where({ locale: "ko" })
  .sort("updated", "desc");
```

---

# 6. XML Sitemap

빌드 시 자동 생성:

```text
/sitemap.xml
```

페이지 수 증가 시 Sitemap Index 사용:

```text
/sitemap-index.xml
/sitemap-pages-1.xml
/sitemap-guides-1.xml
```

정책:

- draft 제외
- noindex 제외
- canonical이 외부 URL인 페이지 제외 가능
- redirect 페이지 제외
- locale URL 포함
- lastmod는 실제 콘텐츠 updated 사용
- 허위 current timestamp 금지

---

# 7. RSS / Atom

기본:

```text
/rss.xml
```

선택:

```text
/feed.xml
/guides/rss.xml
```

Front Matter의 title, description, date, updated, author를 기반으로 생성한다.

absolute URL만 출력한다.

---

# 8. robots.txt

자동 생성하며 config에서 제어한다.

```js
robots: {
  rules: [
    { userAgent: "*", allow: "/" },
    { userAgent: "*", disallow: ["/api/", "/search/"] }
  ]
}
```

자동으로 Sitemap URL을 추가한다.

preview build에서는:

```text
User-agent: *
Disallow: /
```

옵션을 제공한다.

---

# 9. Open Graph Image 자동 생성

기본 크기:

```text
1200x630
```

지원:

- 사이트 기본 OG
- collection 템플릿
- 페이지별 제목
- subtitle
- category
- brand logo
- background image

권장 엔진:

- SVG template
- Sharp rasterization

이유:
브라우저/Puppeteer 의존성을 제거하고 빠른 빌드 유지.

Font 정책:
사용자가 제공한 프로젝트 폰트만 사용하며 빌더가 임의로 외부 폰트를 다운로드하지 않는다.

OG 파일도 content hash를 사용한다.

---

# 10. 이미지 최적화

입력:

```text
.jpg
.jpeg
.png
```

출력:

```text
.webp
.avif
```

기본 breakpoint:

```text
480
768
1200
1600
```

원본보다 큰 이미지를 생성하지 않는다.

API:

```html
{{ image("/images/sample.jpg", {
  alt: "...",
  widths: [480, 768, 1200],
  loading: "lazy"
}) }}
```

출력:

```html
<picture>
  <source type="image/avif" ...>
  <source type="image/webp" ...>
  <img ... width height loading="lazy" decoding="async">
</picture>
```

LCP hero 이미지는:

```text
loading=eager
fetchpriority=high
```

허용.

CLS 방지를 위해 width/height 자동 포함.

---

# 11. CSS / JS

CSS:

- Tailwind CSS
- `@apply`
- native CSS
- Lightning CSS
- optional PostCSS

JS:

- TypeScript
- esbuild

최종 결과:

```text
assets/app.ABC123.js
assets/style.XYZ987.css
```

Production:

- minify
- tree shaking
- sourcemap 선택
- content hashing

개발:

- readable output
- sourcemap 활성화 가능

---

# 12. Cache Busting / Manifest

빌드 결과:

```json
{
  "main.js": "/assets/main.f13d8ae1.js",
  "styles.css": "/assets/styles.8dd923ce.css"
}
```

파일명은 content hash 기반.

HTML은 manifest를 통해 최종 URL을 삽입한다.

변하지 않은 파일은 동일한 hash 유지.

---

# 13. Watch Mode

HMR을 목표로 하지 않는다.

목표:

```text
파일 수정
→ debounce
→ 영향받는 파일 판별
→ rebuild
→ 브라우저 새로고침은 사용자 선택
```

감시 대상:

- content
- template
- partial
- src
- public
- config
- plugins

WebSocket Live Reload는 옵션으로 둘 수 있지만 핵심 기능은 아니다.

---

# 14. Incremental Build

핵심 기능이다.

캐시:

```text
.builder-cache/
├── manifest.json
├── dependency-graph.json
└── content/
```

각 파일의 다음을 추적한다.

```text
content hash
dependencies
output paths
plugin dependencies
template dependencies
```

예:

```text
guide-A.mdx
  -> guide layout
  -> header partial
  -> guide schema
```

`guide-A.mdx`만 변경되면 해당 페이지만 재생성한다.

`header.html` 변경 시 모든 페이지 재생성.

`guide layout` 변경 시 guide collection만 재생성.

정적 asset은 content hash가 변경된 경우만 최적화.

---

# 15. i18n

Config:

```js
i18n: {
  defaultLocale: "ko",
  locales: ["ko", "en", "ja"],
  routing: "prefix-except-default"
}
```

결과:

```text
/
 /guide/
 /en/
 /en/guide/
 /ja/
```

Front Matter:

```yaml
locale: ko
translationKey: address-line
```

빌더는 translationKey 기준으로 번역 페이지를 연결한다.

자동 생성:

```html
<link rel="alternate" hreflang="ko" ...>
<link rel="alternate" hreflang="en" ...>
<link rel="alternate" hreflang="x-default" ...>
```

주의:
번역되지 않은 페이지를 자동 기계번역하지 않는다.

---

# 16. Plugin System

Plugin 인터페이스:

```ts
interface BuilderPlugin {
  name: string;

  onConfig?()
  onStart?()
  onContentLoad?()
  onContentTransform?()
  onTemplate?()
  onPage?()
  onAsset?()
  onSitemap?()
  onBuildEnd?()
}
```

플러그인은 명시적으로 config에 등록한다.

예:

```js
plugins: [
  sitemapPlugin(),
  rssPlugin(),
  imagePlugin(),
  minifyPlugin()
]
```

Core 기능 역시 장기적으로 플러그인으로 분리 가능하게 설계한다.

Plugin 실행 순서는 deterministic해야 한다.

각 plugin hook의 입력/출력 타입을 문서화한다.

---

# 17. SEO 기본 가드레일

프로덕션 빌드에서 검사한다.

오류:

- title 없음
- description 없음
- canonical 없음
- H1 없음
- H1 2개 이상
- canonical 중복 충돌
- slug 중복
- broken internal link
- 잘못된 hreflang
- 구조화 데이터 JSON 파싱 오류

경고:

- title 지나치게 길음
- description 너무 짧거나 너무 길음
- 이미지 alt 없음
- heading level jump
- orphan page
- 업데이트 날짜 이상
- 외부 링크 rel 정책

---

# 18. AEO 가드레일

AEO는 특정 AI 크롤러에 맞춘 트릭이 아니라 문서 의미를 명확히 하는 것을 목표로 한다.

권장 검사:

- 질문형 H2/H3 다음에 직접 답변 paragraph 존재
- FAQ 데이터와 화면 콘텐츠 일치
- Article의 dateModified 화면 표시 여부
- Organization / publisher 정보 일관성
- author 존재 여부
- source/citation 링크 존재 가능
- 주요 표에 caption 또는 설명 존재

Schema 자동 생성:

- WebSite
- Organization
- WebPage
- Article
- BreadcrumbList
- WebApplication
- FAQPage (명시적으로 활성화한 경우)

Schema는 Front Matter와 실제 HTML 콘텐츠에서 생성한다.

허위 aggregateRating 등 자동 생성 금지.

---

# 19. HTML Semantic Policy

빌더가 HTML을 강제로 변형하지는 않지만 lint rule을 제공한다.

권장:

```text
header
nav
main
article
section
aside
footer
figure
table
dl
ol
ul
```

`div` 자체를 금지하는 것이 Core 정책은 아니다.
다만 프로젝트별 lint 규칙으로 금지 가능하게 한다.

예:

```js
lint: {
  forbiddenElements: ["div"],
  forbiddenClasses: ["shadow-*"]
}
```

---

# 20. Performance 목표

생성 사이트 목표:

- JS 없는 콘텐츠 페이지 가능
- HTML gzip 크기 최소화
- critical request 수 최소화
- 이미지 width/height 필수
- lazy loading
- font self-host 권장
- third-party script 최소화

Core Web Vitals는 빌더가 직접 보장할 수 없으므로 Lighthouse/Playwright CI 연결을 지원한다.

---

# 21. Build CLI

최종 목표:

```bash
sae dev
sae build
sae check
sae clean
sae inspect
```

추가:

```bash
sae build --production
sae build --locale ko
sae check --seo
sae inspect /guide/address-line/
```

---

# 22. 프로젝트 구조 목표

```text
builder/
├── packages/
│   ├── core/
│   ├── content/
│   ├── template/
│   ├── markdown/
│   ├── assets/
│   ├── seo/
│   ├── i18n/
│   └── cli/
│
├── plugins/
├── examples/
├── tests/
└── docs/
```

초기에는 monorepo가 필요하지 않다.
v1 안정화 이후 package로 분리한다.

---

# 23. 개발 단계

## Phase 0 — Bootstrap

- CLI
- config loader
- file utilities
- logger
- build context
- error model

## Phase 1 — Static Core

- Layout / Partial
- Markdown
- Front Matter
- content routing
- CSS/JS compile
- copy public
- build output

## Phase 2 — SEO Core

- metadata
- canonical
- sitemap
- robots
- RSS
- JSON-LD
- broken-link checker

## Phase 3 — Asset Pipeline

- image optimization
- OG generation
- minification
- hashing
- manifest

## Phase 4 — DX

- watch
- dependency graph
- incremental build
- diagnostics
- inspect command

## Phase 5 — Content Architecture

- collections
- pagination
- tag/category
- related content
- typed schemas

## Phase 6 — i18n

- locale routing
- translationKey
- hreflang
- localized sitemap

## Phase 7 — Plugin API

- lifecycle hooks
- plugin context
- ordering
- plugin error isolation
- plugin documentation

---

# 24. Definition of Done v1

- 1,000 콘텐츠 페이지를 정적 빌드 가능
- 변경된 콘텐츠 1개에 대해 incremental rebuild
- Markdown/MDX
- Front Matter validation
- Layout / Partial
- Content Collection
- hashed JS/CSS
- WebP/AVIF
- Sitemap index
- RSS
- robots
- OG
- JSON-LD
- hreflang
- plugin API
- SEO checker
- broken internal links checker
- Windows/macOS/Linux 지원
- Node LTS 지원
- deterministic production output
- unit/integration/E2E test
