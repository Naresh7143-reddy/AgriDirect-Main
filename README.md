# AgriDirect

Full-stack farm-to-buyer marketplace platform — connects farmers, buyers, and delivery agents directly.

## Repository structure

```
AgriDirect-Main/
├── backend/      Spring Boot REST API (Java)
├── web-app/      Next.js web client (TypeScript)
└── mobile-app/   React Native Android app (TypeScript)
```

## Components

### `backend/`
Spring Boot + PostgreSQL + Redis. Handles auth, products, orders, payments, delivery tracking, and AI-based crop disease detection.

### `web-app/`
Next.js app for farmers, buyers, and admins. Deployed to Vercel.

### `mobile-app/`
React Native Android app (`com.agridirect`) for farmers, buyers, and delivery agents.

## CI/CD

See [.github/workflows/](.github/workflows/) — each component has its own test job (backend unit tests, web-app Vitest + Selenium E2E, mobile Jest + Appium), compiled into a single master report published via GitHub Pages.

## Local setup

Each subfolder has its own `README.md` / setup instructions — see `backend/README.md`, `web-app/README.md`, `mobile-app/README.md`.
