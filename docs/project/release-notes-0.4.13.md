# Croki 0.4.13 — Croki Branding Restored

Status: stable release
Date: August 12, 2026

Croki 0.4.13 corrects the visible branding regression in 0.4.12. The persistent
sidebar header once again uses Croki's canonical mark and name instead of the
inherited T3 Code wordmark.

All T3-derived 0.4.12 behavior remains in place, including the current sidebar
layout, pull-request entry point, updater controls, themes, composer, desktop
runtime, provider behavior, and per-turn Codex host instructions.

The release also extends `npm run check:croki` with a required-brand-surface
guard. Future upstream syncs now fail verification if the sidebar loses
`CrokiMark` or `APP_BASE_NAME`, or regains the inherited T3 wordmark.
