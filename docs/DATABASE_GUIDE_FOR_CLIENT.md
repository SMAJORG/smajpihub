# SMAJ CareRoute - Database Deployment & Verification Guide
> **Audience**: Technical Supervisors, Lead Architects, Database Administrators (DBA), and Client Verification Teams.

---

## 1. Architecture Overview

SMAJ CareRoute is designed with **dual-mode persistence**:

1. **Zero-Setup Local Dev & Staging Mode**:
   - Built with self-contained client persistence (`localStorage` + `BroadcastChannel` real-time sync + Node.js `memoryDatabase`).
   - Requires **zero external cloud setup** or credentials to run, demo, test emergency workflows, audio sirens, multi-category bed updates, and on-duty doctor rosters locally.

2. **Cloud Database (Supabase / MongoDB)**:
   - When environment credentials are provided, CareRoute automatically switches to live cloud persistence with real-time syncing.

---

## 2. Supabase Cloud Setup (Recommended by Client)

The frontend is now pre-configured with `@supabase/supabase-js`. Follow these 3 simple steps to connect your Supabase database:

### Step 1: Run the Database Migration Script
* **Script Location**: [`docs/careroute_schema.sql`](./careroute_schema.sql)
1. Go to your **Supabase Dashboard**: [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Select your project -> Click **SQL Editor** in the left navigation menu.
3. Click **New Query**, paste the entire contents of [`docs/careroute_schema.sql`](./careroute_schema.sql), and click **Run** (green button).
4. This will automatically:
   - Create 4 tables: `careroute_hospitals`, `careroute_requests`, `careroute_hospital_staff`, `careroute_request_events`.
   - Configure Row Level Security (RLS) policies for secure public emergency dispatch.
   - Enable Supabase Realtime publication.
   - Seed the initial participating hospitals (Hospital A, B, C, D) with their multi-category beds (ICU, Trauma, Vents) and on-duty physician rosters.

### Step 2: Get Your API Keys
1. In the Supabase Dashboard, go to **Project Settings** (gear icon) -> **API**.
2. Copy the following two values:
   - **Project URL** (e.g. `https://xyzcompany.supabase.co`)
   - **Project API Keys** -> `anon` / `public` key

### Step 3: Add to Environment (`.env`)
In `frontend/.env` (or production environment variables on Render/Vercel):
```env
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
```
*That's it! CareRoute will immediately start reading and writing to your live Supabase cloud database.*

---

## 3. Alternative: MongoDB Setup (Matches Existing SMAJ Backend)

If your architecture team prefers to host CareRoute inside the existing MongoDB Atlas cluster:
* **Script Location**: [`docs/careroute_mongodb_init.js`](./careroute_mongodb_init.js)
* **Execution**:
  - Connect to your cluster in **MongoDB Compass** -> Open **Mongosh** at the bottom -> Paste script contents and execute.
  - Or via CLI: `mongosh "<YOUR_MONGODB_URI>" < docs/careroute_mongodb_init.js`

---

## 4. Tables / Collections Reference

| Table / Collection | Purpose | Key Columns |
|---|---|---|
| `careroute_hospitals` | Facility directory & live capacity | `id`, `name`, `intake_status`, `er_capacity_available`, `bed_breakdown`, `on_duty_doctors`, `trauma_level` |
| `careroute_hospital_staff` | Authenticated staff credentials | `id`, `hospital_id`, `username`, `role`, `email`, `is_active` |
| `careroute_requests` | Patient emergency requests | `id`, `tracking_code`, `patient_name`, `emergency_type`, `severity`, `assigned_hospital_id`, `status`, `eta_minutes` |
| `careroute_request_events` | Real-time audit trail & timeline | `request_id`, `actor_type`, `previous_status`, `new_status`, `created_at` |
