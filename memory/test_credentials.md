# NHAA 14566 - Test Credentials

## Officer Demo Accounts (seeded on backend startup)

| Officer ID | Password | Name | Role |
|---|---|---|---|
| OFF-2001 | demo123 | Nodal Officer Priya Sharma | officer |
| OFF-2002 | demo123 | District Collector R. Iyer | admin |
| OFF-2003 | demo123 | AI Auditor Anjali Rao | counselor |

Login endpoint: `POST /api/auth/login`  body: `{"officer_id":"OFF-2001","password":"demo123"}`

## Victim
Anonymous — no login. `POST /api/auth/victim-session` issues an anonymous session token.
