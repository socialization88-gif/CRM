# Backend Structure

```text
server/
├── app.js
├── config/
│   ├── database.js
│   └── env.js
├── controllers/
├── middlewares/
├── models/
├── routes/
├── services/
└── legacy/
```

The first split keeps current handler behavior intact by moving route registration into domain route modules and shared monolith helpers into an explicit context. Controllers and models are scaffolded for the next endpoint-by-endpoint cleanup pass.
