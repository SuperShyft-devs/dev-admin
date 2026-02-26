# Admin Panel

Minimalistic, responsive admin panel for Supershyft. Built with React, TypeScript, Vite, and Tailwind CSS.

## Features

- **Login**: OTP-based authentication (phone → send OTP → verify)
- **Layout**: Top bar (logo, user info, logout) + collapsible left sidebar
- **Organisations**: List, add, edit, view, deactivate (status update)
- **Engagements**: List, add, edit, view, deactivate (status update)
- **Data tables**: Sortable columns, search, filters, pagination, action icons (view/edit/delete)
- **Modals**: Add/Edit forms open in modals; first column clickable for view

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Runs at `http://localhost:5173` by default. API requests are proxied to `http://localhost:8000` (dev-api). Ensure the backend is running.

### Environment

Create `.env` (optional):

```
VITE_API_URL=/api
```

- `/api` – use Vite proxy (default for dev)
- `http://localhost:8000` – direct API URL

## Build

```bash
npm run build
```

Output in `dist/`.

## API Integration

Uses endpoints from `dev-api`:

- `POST /auth/send-otp`, `POST /auth/verify-otp` – login
- `GET/POST/PUT/PATCH /organizations` – organisations
- `GET/POST/PUT/PATCH /engagements` – engagements
- `GET /assessment-packages` – for engagement form dropdowns

All protected routes require `Authorization: Bearer <access_token>`.
