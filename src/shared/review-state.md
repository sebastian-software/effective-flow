## Review memory and cache reference

### Content

```json
{
  "lastFindingNumber": 42,
  "configMigration": {
    "review": {
      "version": "review-speed-profiles-v1",
      "appliedAt": "YYYY-MM-DDTHH:mm:ssZ",
      "addedKeys": ["review.profile"]
    }
  }
}
```

`configMigration` is an object with area-specific sub-keys (`review`, `applyReview`, `tracker`, `worktree`). Each workflow area writes only its own sub-key.

All updates use the “Shared memory-state mutation” contract loaded through the runtime-directory
prerequisite. No review phase directly rewrites this file.

### Cache file

Persistent cache data lives exclusively in `.effective-flow/cache.json`, not in `.effective-flow/memory.json` and not permanently in wisdom files.

`review` may use these cache areas:

| Area               | Content                                                               | Invalidation                                            |
| ------------------ | --------------------------------------------------------------------- | ------------------------------------------------------- |
| `designDecisions`  | Extracted design decisions per source                                 | Hash or mtime of the source files, cache schema version |
| `scopeIndex`       | File list, routing buckets, and reviewer split for whole-code reviews | Git HEAD, dirty state, and relevant file changes        |
| `validatorScripts` | Detected check scripts and last usable validation profile             | Changes to package/build configuration files            |

Rules:

- Every cache entry needs `version`, `createdAt`, and `sourceHash` or equivalent invalidation data.
- In case of uncertainty, a missing file, invalid JSON, a version change, or invalidation that cannot be checked unambiguously: ignore the cache and recompute normally.
- Do not overwrite invalid cache files; briefly inform the user and continue without the cache.
- Never take final review findings from the cache or replace them with cached results.
- Wisdom files remain temporary in-run storage and are deleted at the end.
