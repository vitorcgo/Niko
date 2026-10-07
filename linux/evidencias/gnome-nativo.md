# GNOME native evidence 2026-10-06

Agent scope: only linux/gnome/native new test files, no production edits.
Revision base: b5ff7425a3abbc0fbf7ef4b4ed655385348aea5f + current integrated working tree.
Production extension SHA256: b2f5a3b14fefe4023daab92f3e8a281eb1abeaf419ba00881448a42c07024f29.
GNOME Shell 46.0 / Mutter 46.2 / GTK3 via Python GI.

Isolation: custom private D-Bus config with no service activation directories; private runtime/config/data/cache/state; gsettings keyfile; outer Wayland connected via absolute address only for creating nested compositor window; mock app id/title; fake single-instance D-Bus. No real Niko process, media, database, credentials, connectivity or session configuration modified. Shell warnings about absent CalendarServer/portals/a11y are expected missing capabilities of minimal nested laboratory, not app exceptions.

Commands:
- bash -n linux/gnome/native/run.sh — PASS
- Python ast.parse(client.py) — PASS
- linux/gnome/native/run.sh — sandbox socket denial; escalated private lab allowed
- GNOME real production extension with GTK4 — map timing/decorations fixture faults, changed fixture to GTK3 frameless matching Tauri GTK generation
- Canonical GTK3 show+present production run: /tmp/niko-native.fiRQDD — functional assertions PASS, exit1 due repeated native Mutter stack_position criticals
- NIKO_NATIVE_BASELINE=1 linux/gnome/native/run.sh: /tmp/niko-native.r5T2PJ — baseline no production extension, functional assertions PASS, exit1 same criticals. Hence not evidence of extension-specific defect.
- Show-only GTK3 baseline diagnosis: /tmp/niko-native.3Zpq5Q — exit0, no stack_position criticals
- Show-only GTK3 production diagnosis: /tmp/niko-native.2D0d2D — exit0; five hide/remap cycles, actual Mutter anchors, tablist, focus, attention, disable/enable, service disappearance all assertions PASS.

Canonical fixture reuses GTK window and calls show_all+present (equivalent class of synchronous GTK raise). Optional SHOW_ONLY omits present and is diagnostic only, not proof of Tauri focus/show behavior. Critical gate is maintained; canonical stage cannot be marked complete while failing.

Final runs with integrated fixture/probe permissions denial and missing-service cases pending below.
Manual pending: installed Niko/Tauri/WebKit lifecycle, render/UX, monitor changes/fractional scaling, fullscreen/session lock. No Windows native evidence from this agent.

Final integrated native runs:
- linux/gnome/native/run.sh — /tmp/niko-native.eANGtG, EXIT1. Functional assertions PASS including fake AccessDenied, missing service with no pending timers; canonical native Mutter stack_position critical repeated five times, result file explicitly appends FAIL native critical.
- NIKO_NATIVE_SHOW_ONLY=1 linux/gnome/native/run.sh — /tmp/niko-native.wP5eCc, EXIT0. Same functional assertions and real Mutter/GTK3/Wayland without synchronous GTK present; no critical gate matches. DIAGNOSTIC ONLY, does not complete canonical stage.
Logs retained in each evidence directory: shell.log, client.log, result, revision.sha256. Expected AccessDenied and missing service errors are visible in shell.log under Niko: falha D-Bus. No production patch justified because baseline reproduces.
- Final integrated NIKO_NATIVE_BASELINE=1 linux/gnome/native/run.sh — /tmp/niko-native.e2yk3G, EXIT1, functional GTK cycles PASS and native stack_position critical four times. Reproduces with final fixture and zero production extension loaded.
- git diff --check — PASS.

Interpretation: canonical native integration remains PENDING due real critical in GTK3/Mutter nested. Differential does not justify production extension patch. Reproduction and diagnostic are delivered; final manual installed-app validation remains required.
