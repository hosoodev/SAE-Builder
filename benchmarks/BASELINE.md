# Local benchmark baseline

Measured on 2026-08-27 with Node.js 24.14.0, Windows x64, and 8 logical CPUs.
The command was:

```bash
corepack pnpm benchmark -- --pages 100,1000 --require-incremental-mtimes
```

| Pages | Cold | Unchanged warm | One-content change | Sampled peak heap |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 610.734 ms | 554.826 ms | 655.732 ms | 61.4 MB |
| 1,000 | 4,906.547 ms | 5,367.683 ms | 5,119.639 ms | 109.9 MB |

Incremental evidence:

- 100-page warm: 0 rendered, 100 reused, 0 written, 104 unchanged files.
- 100-page single change: 1 rendered, 99 reused, 1 written; 99/99 unaffected page mtimes preserved.
- 1,000-page warm: 0 rendered, 1,000 reused, 0 written, 1,004 unchanged files.
- 1,000-page single change: 1 rendered, 999 reused, 1 written; 999/999 unaffected page mtimes preserved.
- Cold and unchanged-warm output tree hashes matched at both sizes.

These numbers are a machine-specific comparison point, not universal pass/fail
thresholds. The harness itself enforces deterministic hashes, the changed page,
unchanged page bytes, and unchanged page mtimes.
