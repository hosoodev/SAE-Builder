# BUILDER_ARCHITECTURE.md

## package boundary

`@hosoodev/sae-builder`는 HTML-first, zero-runtime-by-default Static Site Builder다. 최종 산출물은 특정 호스팅에 종속되지 않는 `dist/`다.

```text
SAE-Builder/
├── src/
│   ├── cli/
│   ├── core/
│   ├── filesystem/
│   ├── content/
│   ├── markdown/
│   ├── template/
│   ├── routing/
│   ├── assets/
│   ├── seo/
│   ├── og/
│   ├── i18n/
│   ├── plugin/
│   └── build/
├── tests/
└── package.json
```

현재 `scripts/build.mjs`는 reference implementation이며 Codex가 TypeScript 모듈 구조로 재설계할 수 있다.

## Public API

```ts
import { defineConfig } from "@hosoodev/sae-builder";
```

CLI: `sae dev`, `sae build`, `sae check`, `sae clean`, `sae inspect <url>`.

## Build pipeline

```text
config → plugins → discover → validate → dependency graph → Markdown/MDX
→ templates → metadata/schema → CSS/JS/images → hash/manifest
→ HTML → sitemap/RSS/robots → SEO/AEO validation → cache
```

## Incremental graph

Node는 content/layout/partial/asset/plugin을 표현하고 reverse dependency traversal로 invalidation 범위를 계산한다. 콘텐츠 1개 변경 시 해당 output만 재생성하며, shared header 변경 시 이를 사용하는 페이지들만 재생성한다.

## Site boundary

Builder는 주소, 환율, 로또 등의 비즈니스 의미를 모른다. 사이트의 TypeScript entry를 bundle할 뿐이다. API secret이 필요한 runtime도 Builder에 포함하지 않는다.

## Plugin boundary

선택적인 범용 기능은 Core에 누적하지 않고 Plugin으로 분리한다. Plugin 순서는 deterministic해야 하며 오류는 plugin name + hook을 표시한다.

## Security

output root escape, template traversal, symlink, raw HTML 정책을 검증하고 plugin은 trusted local code로 명시한다.
