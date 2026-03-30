# HireFlow ATS

A full-featured Applicant Tracking System (ATS) built on Replit, adapted from the KW-ATS reference implementation.

## Stack

- **Frontend**: React + Wouter + TanStack Query + Shadcn UI + Recharts + Framer Motion
- **Backend**: Express.js + TypeScript
- **Database**: PostgreSQL via Drizzle ORM
- **Schema**: Drizzle + Drizzle-Zod

## Architecture

```
client/src/
  pages/          Dashboard, Jobs, JobDetails, Candidates, CandidateDetail,
                  Interviews, Offers, Reports
  components/     Layout (sidebar nav), StatusBadge
  hooks/          use-jobs, use-candidates, use-applications, use-stats, use-toast, use-auth
server/
  index.ts        Express entry point
  routes.ts       REST API routes (includes Google OAuth + Calendar routes)
  storage.ts      DatabaseStorage class (IStorage interface)
  db.ts           Drizzle DB connection
  google.ts       Google OAuth2 + Calendar API helpers (googleapis)
  auth.ts         Session-based requireAuth / requireAdmin middleware
shared/
  schema.ts       Drizzle tables + types + APPLICATION_STAGES + STAGE_LABELS + REQUIRED_DOCUMENTS
  routes.ts       Shared API path constants
```

## Google OAuth + Calendar Integration

- **Client ID/Secret**: stored as `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` env secrets
- **Flow**: `GET /api/auth/google` → returns `{ url }` → frontend navigates user → Google callback → `GET /api/auth/google/callback` → creates/links user → HTML meta-refresh to dashboard
- **Scopes**: `userinfo.email`, `userinfo.profile`, `calendar.events`
- **Two modes**: (1) Sign in with Google (creates/links account), (2) Link Google Calendar to existing session (`?link=1`)
- **Tokens stored**: `google_access_token`, `google_refresh_token`, `google_token_expiry` on `users` table
- **Calendar sync**: `POST /api/interviews/:id/calendar` — creates a Google Calendar event and stores `calendar_event_id` on the interview
- **Users table** now has: `google_id`, `google_access_token`, `google_refresh_token`, `google_token_expiry`
- **Interviews table** now has: `calendar_event_id`
- **`hasGoogleCalendar`**: exposed on `PublicUser` (true if `google_access_token` is set)

## KW Turkey Candidate Categories
- **K0** — New to real estate (no license, no sales)
- **K1** — Licensed agent with limited or no sales
- **K2** — Productive agent with active sales record

### KW-Specific Candidate Fields
`category` (K0/K1/K2), `currentBrand` (RE/MAX, Century21, ERA…), `licenseStatus` (unlicensed/pending/licensed), `licenseNumber`, `city` (Turkey cities), `district`, `specialization[]` (Konut/Ticari/Arsa/Lüks…), `languages[]`, `socialMedia`, `referredBy`, `experience`

## Features

### Dashboard
- KPI cards: Open Jobs, In Pipeline, Interviews, Hired (with offer acceptance rate)
- Recruitment funnel bar chart (recharts)
- Scheduled Interviews panel (from the interviews table, with date/time)
- Recent Applications list
- Stale Jobs alert panel

### Jobs
- Grid of job cards with department, salary range, status filter
- Create / delete jobs
- Job detail Kanban board with 6 pipeline stages
- Per-card dropdown: Move to stage, Schedule Interview, Create Offer, View Profile

### Candidates
- Searchable table with tags, experience badges, Profile link
- Create candidate with tag input
- Apply candidate to job
- **Candidate Profile page** (`/candidates/:id`):
  - Overview tab (resume/background)
  - Applications tab (all jobs applied to with status)
  - Notes tab (CRUD — add/delete per-candidate notes)

### Interviews (`/interviews`)
- List of all interviews with status filter tabs
- KPI cards: Upcoming, Today, Completed
- Schedule interview (linked to any application)
- Complete / Cancel / Delete actions per interview
- Overdue badge for past-scheduled interviews

### Offers (`/offers`)
- List of all offers with status workflow: Draft → Pending Approval → Approved → Sent → Accepted/Rejected
- KPI cards: Total Offers, Pending, Accepted, Total Accepted Value
- Create offer (amount, currency, notes) linked to any application
- Status progression buttons per offer

### Reports
- 6 metric cards: Total Applications, Hired, Avg Time to Hire, Interviews, Offers, Offer Acceptance Rate
- Horizontal funnel bar chart
- Applications over time area chart (8 weeks)
- Avg time per stage table
- Date range filter: 7d / 30d / 90d

## Schema Tables

| Table | Key fields |
|---|---|
| `jobs` | id, title, department, company, location, description, requirements, salaryRange, status |
| `candidates` | id, name, email, phone, resumeText, experience, tags[] |
| `applications` | id, jobId, candidateId, status, notes, appliedAt |
| `stage_history` | id, applicationId, candidateId, jobId, fromStatus, toStatus, enteredAt |
| `interviews` | id, applicationId, jobId, candidateId, title, startTime, endTime, location, status, notes |
| `offers` | id, applicationId, jobId, candidateId, amount, currency, status, notes |
| `candidate_notes` | id, candidateId, content, authorName, createdAt |

## API Endpoints

- `GET/POST/PUT/DELETE /api/jobs`
- `GET/POST/PUT/DELETE /api/candidates`
- `GET/POST /api/candidates/:id/notes`, `DELETE /api/notes/:id`
- `GET/POST /api/applications`, `PATCH /api/applications/:id/status`
- `GET/POST /api/interviews`, `PATCH /api/interviews/:id`, `DELETE /api/interviews/:id`
- `GET/POST /api/offers`, `PATCH /api/offers/:id`, `DELETE /api/offers/:id`
- `GET /api/stats/dashboard`, `GET /api/stats/reports`

## Running

The workflow `Start application` runs `npm run dev` which starts both the Express API and Vite dev server together on port 5000.

## Seed Data

If jobs table is empty on startup, the app seeds 2 jobs, 2 candidates, 2 applications, and 1 interview.
