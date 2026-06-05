# QUANTUM Frontend Modular Structure

This refactor separates the HTML shell, global styles, core browser logic, and feature scripts while preserving the legacy global function names required by existing inline event handlers.

```text
public/
├── index.html                         # Layout shell and script/style wiring only
├── assets/                            # Browser-delivered images and favicons
├── pages/
│   └── auth/                          # Login, password reset, executive request pages
├── features/
│   └── admin/
│       └── admin.html                 # Existing admin modal/drawer fragments loaded at runtime
├── styles/
│   ├── core/
│   │   └── app.css                    # Global tokens, layout shell, shared components, responsive rules
│   └── features/
│       └── admin.css                  # Admin visibility, account drawer, AI drawer feature CSS
└── scripts/
    ├── core/
    │   └── app.js                     # Auth state, API helper, routing/view switching, shared profile/record logic
    └── features/
        ├── admin/
        │   └── admin.js               # Admin feature layer plus legacy shared role feature functions
        └── executive/
            └── executive.js           # Executive compatibility namespace for shared legacy functions
```

## File-by-file breakdown

- `index.html`: Keeps the application shell, view containers, fragment host, and ordered asset references. It now loads feature CSS first and core CSS second to preserve the original cascade order. It loads `scripts/core/app.js` before `scripts/features/admin/admin.js`, matching the previous inline-script-before-admin-script dependency order.
- `styles/core/app.css`: Contains the former top-level inline stylesheet from `index.html`: global variables, reset/base elements, shell layout, sidebar/content views, profile/task/report UI, responsive behavior, and role display rules that were already in the shell.
- `styles/features/admin.css`: Contains the former `features/admin/admin.css` admin feature rules: `.admin-only` display controls, admin grids, account creation drawer, password controls, and AI drawer/floating action button styling.
- `scripts/core/app.js`: Contains the former top-level inline app script: constants, shared state, `apiFetch`, auth boot/login/logout, role class switching, routing via `switchView`, shared rendering, task/report widgets, AI chat, and DOMContentLoaded boot wiring.
- `scripts/features/admin/admin.js`: Contains the former admin feature script exactly: admin fragment loading, permissions/program settings, dashboard overview, bulk assignment, records table, profile/account management, executive overview functions, account task tab, AI settings, and admin-only endpoints.
- `scripts/features/executive/executive.js`: Provides the `window.QuantumExecutive` compatibility namespace over the currently shared Executive functions, including overview, assignments, task report, and summary refresh hooks.

## Preserved contracts

- API endpoints are unchanged.
- Global function names used by inline handlers are unchanged.
- Script execution order is unchanged.
- CSS cascade order is preserved by loading feature CSS before extracted core CSS.
- Runtime admin fragments continue loading from `/features/admin/admin.html`.
