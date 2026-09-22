# Product Requirements Document (PRD)
## Job Application Tracker (AI-Powered & Multi-Device Responsive)

This document contains the complete technical specifications, functional requirements, data schemas, and architectural patterns needed to export and recreate this Job Application Tracker in another workspace (such as Antigravity).

---

## 1. Executive Summary
The **Job Application Tracker** is a full-stack, responsive, and intelligence-driven web application designed for job seekers to organize, update, and manage their job applications. It pairs a highly optimized, high-density spreadsheet-like user interface with a server-side Gemini AI parsing engine that automatically extracts rich metadata (headcount, seniority levels, salary info, and core description summaries) from pasted job posting URLs.

---

## 2. Key Architecture & Technology Stack

- **Frontend Framework**: React (v18+) with Vite as the build tool.
- **Styling & Layout**: Tailwind CSS (utility-first, customized theme with fluid spacing, dynamic system-accent and safe light/dark contrast configurations).
- **Animations**: Framer Motion (`motion` imported from `motion/react`) for smooth transitions (sidebar drawers, modal popups, table-row expansions, list-sorting spring physics).
- **Backend Runtime**: Node.js with Express running on TypeScript (using `tsx` for high-performance development and bundled with `esbuild` to produce a standalone production build in `dist/server.cjs`).
- **Persistence Layer**: Dual-persistence engine. Stores records in a PostgreSQL database via Supabase, with automatic failover to a local `jobs.json` file on the filesystem if database environment variables are missing or connection attempts time out.
- **AI Core**: Google GenAI SDK (`@google/genai`) utilising Gemini models on the backend to parse, classify, and summarize job postings from raw text/URLs securely.
- **Icons**: Lucide React (`lucide-react`) for standard and elegant system iconography.

---

## 3. Detailed Technical Features & Specifications

### 3.1. Spreadsheet UI with Dual View-Modes
- **Full Grid View**: A comprehensive spreadsheet layout displaying columns for:
  1. Company (with brand logo)
  2. Job Title
  3. Location
  4. Salary / Comp
  5. Status (Inline dropdown editor)
  6. Date Applied
  7. Industry
  8. Job Description Summary
- **Compact View (Default)**: Optimized for high data density, combining the Company name and Job Title columns into a single cohesive, visual cell containing the logo, title, seniority tag, headcount, and company name on a unified vertical footprint. Column heights are compacted from `py-3.5` to `py-2` to maximize on-screen records.
- **View Toggle**: An intuitive segmented control bar (pill layout) in the control bar allowing instant switching between `'compact'` and `'full'` modes.

### 3.2. Responsive Touch-First Mobile Views
- **Mobile Adaptive Design**: On screens smaller than `md` (768px), the main table automatically folds into a vertical stacked list.
- **Conditional Mobile Layouts**:
  - **Compact Mobile Card**: A space-saving single-line layout highlighting the logo, role, seniority, company name, inline status pill dropdown, compensation badge, and date applied. Extremely visual-forward with touch targets optimized to meet 44px WCAG criteria.
  - **Full Mobile Card**: A larger layout showing description summaries, full location headers, and extended company meta-cards.

### 3.3. Advanced URL Ingestion & ATS Scraper
- **Scraper Middleware**: Backend endpoint (`POST /api/ingest-url`) extracts raw markup and text. Includes custom heuristics to identify Applicant Tracking Systems (ATS) including **Greenhouse**, **Lever**, and **Darwinbox**.
- **Gemini Parser**: Utilizes Gemini (via server-side environment `GEMINI_API_KEY`) with structured prompts to return clean JSON matching the database schema.
- **Classifications Extracted**:
  - `company` (Official brand name)
  - `jobTitle` (Normalized title)
  - `location` (City, State / Remote)
  - `salary` (Parsed compensation range or "Not Listed")
  - `industry` (Main tech/business domain)
  - `summary` (Concise bulleted or 2-sentence description)
  - `companyMetadata` (Headcount range, headquarters, website)
  - `positionMetadata` (Seniority level, role type e.g., Full-time/Contract)

### 3.4. Database & Dual-Persistence Syncing
- **Primary Source of Truth**: Postgres Database (configured via `SUPABASE_URL` and `SUPABASE_ANON_KEY`).
- **Local Fallback**: Local JSON storage (`/jobs.json` or equivalent local file) loaded automatically at startup if connection to cloud database fails. Sync and write operations mirror both databases securely.
- **Dynamic Status History Timeline**: Each status transition (e.g., *Applied* $\rightarrow$ *Interviewing* $\rightarrow$ *Offer*) is appended to an array with a timestamp. This allows rendering a vertical timeline tracker inside the inspection drawer.

---

## 4. Key Data Models (TypeScript Interfaces)

### 4.1. Job Record Interface (`JobRecord`)
```typescript
export type JobStatus =
  | 'Bookmarked'
  | 'Applied'
  | 'Interviewing'
  | 'Offer'
  | 'Rejected'
  | 'Negotiating'
  | 'Accepted';

export interface StatusHistoryEntry {
  status: JobStatus;
  updatedAt: string; // ISO timestamp
}

export interface CompanyMeta {
  headcount?: string;
  headquarters?: string;
  website?: string;
}

export interface PositionMeta {
  seniority?: string; // e.g. "Senior", "Junior", "Staff", "Lead"
  roleType?: string;  // e.g. "Full-time", "Contract", "Intern"
}

export interface JobRecord {
  id: string;
  company: string;
  jobTitle: string;
  location: string;
  salary: string;
  status: JobStatus;
  dateApplied: string; // YYYY-MM-DD
  url?: string;
  industry?: string;
  summary?: string;
  notes?: string;
  statusHistory: StatusHistoryEntry[];
  companyMetadata?: CompanyMeta;
  positionMetadata?: PositionMeta;
  createdAt: string;
  updatedAt: string;
}
```

---

## 5. Execution, Packaging & Deployment Instructions

### 5.1. Required Environment Variables
Create a `.env` file at the project root with the following declarations:
```env
# Google Gemini API Access (Server-side only)
GEMINI_API_KEY=your_gemini_api_key_here

# Supabase PostgreSQL Configuration (Optional - Falls back to local JSON if undefined)
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

### 5.2. Compilation and Build Configurations
Configure the script block in `package.json` for compilation:
```json
"scripts": {
  "dev": "tsx server.ts",
  "build": "vite build && esbuild server.ts --bundle --platform=node --format=cjs --packages=external --sourcemap --outfile=dist/server.cjs",
  "start": "node dist/server.cjs"
}
```
*Note: The production build uses `esbuild` to compile `server.ts` into a standalone CommonJS bundle at `dist/server.cjs` to resolve runtime typescript path imports natively.*

### 5.3. Directory Structure
```
├── server.ts                 # Full-stack Express server with API routes & Vite middleware
├── index.html                # Client SPA entry point
├── package.json              # Dependency and script management
├── src/
│   ├── main.tsx              # React mounting root
│   ├── App.tsx               # Primary global state coordinator
│   ├── types.ts              # Core Shared Types & JobRecord interfaces
│   ├── index.css             # Tailwind @import entry point and CSS Variables
│   ├── components/
│   │   ├── JobSpreadsheet.tsx   # Spreadsheet Engine (Full Grid, Compact View, Control Bar)
│   │   ├── HeaderActionPanel.tsx # URL Ingestion, manual creation triggers
│   │   ├── JobInspectionDrawer.tsx # Rich inspection details drawer & Timeline history
│   │   └── CompanyLogo.tsx       # Logo resolver using public Clearbit/Favicon proxies
│   └── lib/
│       ├── jobsStore.ts      # Dual-Persistence client adapter
│       └── atsDetect.ts      # Regex patterns for Greenhouse, Lever, & Darwinbox
```

---

## 6. Verification & Porting Best Practices
1. **API Exposure Protection**: Keep `GEMINI_API_KEY` hidden server-side. Never prefix it with `VITE_`.
2. **Viewport Optimization**: Ensure custom scrollbars and responsive wrappers utilize `overflow-x-auto` on the spreadsheet container to avoid broken layouts on lower desktop viewports.
3. **Lazy SDK Initialization**: Allow the local persistence file adapter to initialize dynamically if Postgres environments are unavailable.
