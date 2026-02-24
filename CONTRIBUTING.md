# Contributing

Thanks for your interest in contributing to this project.

## Development Setup

1. Install dependencies:

```bash
npm install
```

2. Validate changes before opening a PR:

```bash
npm run typecheck
npm run build
npm run test
```

## Branch and Commit Guidance

- Create a feature branch from `main`.
- Keep changes focused and small where possible.
- Use clear commit messages that explain intent.

## Pull Request Checklist

- [ ] Scope is clear and limited.
- [ ] Documentation updated when behavior changes.
- [ ] Tests added or updated for new behavior.
- [ ] `typecheck`, `build`, and `test` pass locally.
- [ ] Security implications reviewed for exposed methods and policies.

## Security-Related Changes

For changes affecting auth, allowlists, rate limits, or session routing:

- Describe the threat model impact in the PR.
- Include at least one negative test case.
- Reference `docs/security.md` and keep it updated when needed.

## Questions

If requirements are unclear, open an issue with context and expected behavior before implementing major changes.
