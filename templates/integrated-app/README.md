# Integrated App Template

Use this template only after the new application has its own stable local data
model. Replace every `__APP_*__` token and keep the canonical app id in lowercase
kebab-case.

Files:

- `manifest.template.js`: host catalog and integration metadata;
- `view.template.js`: iframe mount, UID scope and theme bridge;
- `app-data-adapter.template.js`: sync, backup and restore contract.

The application still needs its own `index.html`, storage implementation,
Firebase repository and tests. Register only the host manifest in
`src/apps/registry.js`; the Sync Center and unified backup discover the app from
the manifest and runtime capabilities.

Run `npm run test:integration-kit` before integrating the real application.
Application-specific tests can import
`scripts/testing/integrated-app-contract.mjs` and call
`verifyIntegratedAppDataContract` with the generated handlers and a valid sample
backup.
