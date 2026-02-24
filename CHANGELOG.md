# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, and this project uses semantic versioning.

## [0.1.0] - 2026-02-24

### Added

- Monorepo structure for protocol, MCP server, web bridge SDK, extension bridge, and adapters.
- Core MCP tools:
  - `listPageMethods`
  - `invokePageMethod`
- Web-native runtime with:
  - method registration and discovery,
  - lifecycle-safe method cleanup (`dispose`, unregister),
  - event subscription/publish flow.
- Hybrid integration paths:
  - SDK embedding mode,
  - extension bridge mode.
- Governance and reliability defaults:
  - explicit session routing for multi-session scenarios,
  - mutating-method retry disabled by default,
  - per-session/method rate limiting,
  - reconnect and outbound queue behavior.
- Security hardening:
  - token auth support,
  - origin/method allowlists,
  - extension channel secret validation.
- Examples:
  - React legacy integration,
  - Vue legacy integration,
  - Vanilla legacy integration.
- Documentation:
  - architecture overview and simplified diagrams,
  - quick start and security baseline,
  - legacy retrofit prompt package,
  - quick demo runbook.

### Notes

- This repository is currently a reference framework and is evolving quickly.
