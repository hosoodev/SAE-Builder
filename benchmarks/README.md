# Builder benchmark harness

이 하네스는 운영체제 임시 디렉터리에 합성 consumer 사이트를 만들고 공개 `build()`
API를 세 번 호출합니다.

1. cold build
2. 입력이 바뀌지 않은 warm build
3. 콘텐츠 파일 하나만 바꾼 build

기본 page count는 100과 1,000입니다.

```bash
# 저장소 루트에서 기본 측정
corepack pnpm benchmark

# 빠른 확인 또는 원하는 복수 크기
corepack pnpm benchmark -- --pages 10
corepack pnpm benchmark -- --pages 100,1000

# 기본 크기에 10,000 page 측정 추가
corepack pnpm benchmark -- --include-10000
```

`SAE_BENCH_PAGES`와 `SAE_BENCH_INCLUDE_10000=1` 환경 변수도 사용할 수 있습니다.
PowerShell에서는 다음과 같이 설정합니다.

```powershell
$env:SAE_BENCH_PAGES = "100,1000"
corepack pnpm benchmark
```

선택적 출력 보존이 필수인 회귀 검증에서는
`--require-incremental-mtimes` 또는 `SAE_BENCH_REQUIRE_INCREMENTAL_MTIMES=1`을
사용합니다. 이 옵션이 없으면 결과는 다음 세 상태 중 하나를 JSON으로 보고합니다.

- `supported`: 바뀌지 않은 모든 page의 mtime이 보존됨
- `not-supported`: 바뀌지 않은 page의 mtime이 현재 빌드 경로에서 보존되지 않음
- `not-applicable`: 비교할 unchanged page가 없는 1-page fixture

일부 page만 보존되는 `partial-failure`는 일관성 오류이므로 벤치마크 자체가 실패합니다.

## 출력과 검증

stdout에는 고정된 형태의 JSON 한 개만 출력됩니다. 각 실행은 elapsed milliseconds,
실행 전/후 heap used, heap delta, sampled peak heap, output byte/file count와 SHA-256
tree hash를 포함합니다. `incremental` 요약에는 실제 render/reuse page 수,
invalidated output 수, written/unchanged/removed file 수가 포함됩니다. 하네스는 다음
조건도 검증합니다.

- cold와 unchanged warm output tree가 byte-for-byte 결정적임
- 한 콘텐츠 변경이 선택한 page의 output hash를 바꿈
- 다른 page의 byte hash는 바뀌지 않음
- 지원되는 경우 다른 page의 mtime이 보존됨
- warm build는 page를 재사용하고 한 콘텐츠 변경은 해당 page만 렌더함

시간과 메모리 수치는 CPU, 디스크, Node.js 버전, 운영체제, 전원 설정과 동시 부하에
따라 달라집니다. 따라서 결과는 실행 환경별 baseline으로 기록하고 서로 다른 환경의
절대 수치를 직접 비교하지 마십시오.

fixture에는 결정적인 합성 텍스트만 있으며 주소, 사용자 데이터, 애플리케이션 로그를
기록하지 않습니다. 각 page count마다 `mkdtemp`로 자신이 만든 디렉터리만 정리하며,
consumer 저장소나 공용 임시 디렉터리의 다른 항목은 삭제하지 않습니다.

현재 workspace 측정값은 [BASELINE.md](./BASELINE.md)에 기록합니다.
