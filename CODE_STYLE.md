# Code conventions

Implementation names and comments are written in English. The application's user interface remains in Brazilian Portuguese.

## Naming

- Use `camelCase` for TypeScript and JavaScript functions, variables and hooks (`useCalendar`).
- Use `PascalCase` for types, interfaces and React components.
- Use `snake_case` for Rust functions, variables and modules; use `PascalCase` for Rust types.
- Use `UPPER_SNAKE_CASE` for constants that represent fixed configuration values.
- Use English file and directory names. Component files use `PascalCase`; utility files use `camelCase`; Rust modules use `snake_case`.
- Write comments and test descriptions in English. Keep user messages and language-dependent test fixtures in the language they exercise.

## Compatibility with existing installations

Existing persisted JSON fields, storage keys, event names, Tauri command names and argument keys remain unchanged. Portuguese data properties in shared types describe these existing contracts and are intentional. Store actions use English names because functions are not serialized. Preserve keys in object shorthand and destructuring with explicit aliases, for example `{ titulo: title }`.

Rust implementations use English names. `src-tauri/src/legacy_commands.rs` exposes the original Tauri commands and argument names. Serialized native fields use explicit `serde` renames where needed. Do not rename these entry points or serialized keys without a coordinated migration and compatibility tests.

Existing window labels, CSS selectors, asset paths, environment variable names and third-party integration formats also remain stable. Use English for new internal APIs. Before changing an existing property, determine whether it crosses a persistence, native, integration or UI boundary.

UI text is maintained in `src/i18n/ptBR.ts` and existing Portuguese messages. This refactor does not change the product language or provide macOS support.

## Source layout

| Directory | Responsibility |
| --- | --- |
| `src/components` | Shared UI components |
| `src/features` | Application features |
| `src/windows` | Desktop windows, island and dock |
| `src/state` | State stores |
| `src/bridge` | Frontend communication with native services |
| `src/services` | Application services |
| `src/utils` | Shared utilities |
| `src/i18n` | UI text |
| `server` | Local Node bridge and Windows integrations |
| `src-tauri/src` | Native Rust application |
| `scripts` | Build, release and automated tests |
| `tests` | Visual test entry points |

## Commands and validation

Use `npm run verify`, `npm test`, `npm run build` and `npm run bridge:build` for TypeScript, tests and bundles. `npm run release:verify` checks version consistency without publishing. The same scripts can be invoked with pnpm.

Canonical scripts use English (`characters:prepare`, `bridge:build`, `release`, `release:verify`, `release:test`, `chat:test`, `media:test`). The previous Portuguese script names remain aliases. Release flags accept `--version`, `--check`, `--rebuild` and `--help`, alongside the existing Portuguese flags.

Native Rust changes must also be compiled and exercised on Windows. TypeScript checks and Node tests do not validate Win32, PowerShell, C# or Tauri runtime behavior.
