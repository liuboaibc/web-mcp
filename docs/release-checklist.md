# Release Checklist

Use this checklist before creating a GitHub release.

## 1) Validate Repository State

- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] `npm run test` passes
- [ ] CI workflow is green on `main`

## 2) Verify Core Product Behavior

- [ ] `listPageMethods` works in at least one demo app
- [ ] `invokePageMethod` works for readonly and mutating methods
- [ ] unmount/dispose cleanup behavior verified (`METHOD_NOT_FOUND` after cleanup)
- [ ] governance checks verified (session, allowlist, rate limit)

## 3) Security Review

- [ ] `WEB_MCP_BRIDGE_TOKEN` usage confirmed in docs/examples
- [ ] production recommendation for `WEB_MCP_ALLOW_QUERY_TOKEN=false` documented
- [ ] origin/method allowlist guidance up to date

## 4) Documentation and Metadata

- [ ] `README.md` and `README.zh-CN.md` updated
- [ ] `CHANGELOG.md` includes release notes
- [ ] `LICENSE`, `SECURITY.md`, and contribution docs are present

## 5) GitHub Release

- [ ] Create tag: `vX.Y.Z`
- [ ] Create release notes from `CHANGELOG.md`
- [ ] Attach demo GIF/video link
- [ ] Include migration notes for existing users
