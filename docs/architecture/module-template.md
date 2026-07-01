# Module Template

Future business modules should use this internal shape when a module becomes large enough to need separation:

```text
module-name/
├── domain/
├── application/
├── infrastructure/
├── presentation/
├── contracts/
└── tests/
```

`domain` contains business language, invariants, and policies. `application` coordinates use cases. `infrastructure` adapts databases, storage, integrations, and external services. `presentation` adapts HTTP, UI-facing, or framework-specific boundaries. `contracts` defines transport DTOs and schemas. `tests` contains focused module tests.

Do not create empty business module folders before a module has approved behavior.
