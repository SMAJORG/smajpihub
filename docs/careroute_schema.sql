-- ======================================================================
-- SMAJ CareRoute - Complete Supabase Database Schema & Seed Script
-- ======================================================================
-- Instructions for Client / Supervisor:
-- 1. Log in to your Supabase Dashboard (https://supabase.com/dashboard)
-- 2. Open your Project -> Click "SQL Editor" in the left sidebar
-- 3. Click "New Query", paste this entire script, and click "Run" (green button)
-- 4. Copy your "Project URL" and "anon / public Key" from:
--    Project Settings -> API -> Project API keys
-- 5. Paste them into your .env file:
--    VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
--    VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
-- ======================================================================

-- 1. CareRoute Hospitals
CREATE TABLE IF NOT EXISTS careroute_hospitals (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    country VARCHAR(100) NOT NULL DEFAULT 'Global',
    phone VARCHAR(50) NOT NULL,
    emergency_contact VARCHAR(50),
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    intake_status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (intake_status IN ('active', 'diverting', 'inactive')),
    capabilities TEXT[] DEFAULT ARRAY['General']::TEXT[],
    er_capacity_total INTEGER NOT NULL DEFAULT 50,
    er_capacity_available INTEGER NOT NULL DEFAULT 20,
    bed_breakdown JSONB DEFAULT '{"icuAvailable": 4, "icuTotal": 10, "traumaBayAvailable": 2, "traumaBayTotal": 6, "generalErAvailable": 8, "generalErTotal": 20, "pediatricAvailable": 2, "pediatricTotal": 4, "ventilatorAvailable": 2, "ventilatorTotal": 6}'::jsonb,
    on_duty_doctors JSONB DEFAULT '[]'::jsonb,
    trauma_level VARCHAR(50) DEFAULT 'Level 1 Trauma Center',
    reported_capacity_timestamp VARCHAR(50) DEFAULT 'Recently',
    capacity_data_source VARCHAR(50) DEFAULT 'hospital_reported',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. CareRoute Hospital Staff
CREATE TABLE IF NOT EXISTS careroute_hospital_staff (
    id VARCHAR(64) PRIMARY KEY,
    hospital_id VARCHAR(64) NOT NULL REFERENCES careroute_hospitals(id) ON DELETE CASCADE,
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'ER Intake Coordinator',
    email VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255) DEFAULT 'password123',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. CareRoute Emergency Requests
CREATE TABLE IF NOT EXISTS careroute_requests (
    id VARCHAR(64) PRIMARY KEY,
    tracking_code VARCHAR(50) UNIQUE NOT NULL,
    access_token VARCHAR(100),
    patient_name VARCHAR(255) NOT NULL,
    patient_phone VARCHAR(50) NOT NULL,
    patient_age VARCHAR(20),
    emergency_contact VARCHAR(50),
    patient_pi_username VARCHAR(100),
    emergency_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'urgent' CHECK (severity IN ('critical', 'urgent', 'moderate', 'low')),
    symptoms_description TEXT,
    pickup_address TEXT NOT NULL,
    pickup_latitude DOUBLE PRECISION NOT NULL,
    pickup_longitude DOUBLE PRECISION NOT NULL,
    assigned_hospital_id VARCHAR(64) NOT NULL REFERENCES careroute_hospitals(id),
    assigned_hospital_name VARCHAR(255),
    assigned_hospital_phone VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'dispatched' CHECK (status IN ('submitted', 'dispatched', 'accepted', 'rejected', 'completed', 'closed')),
    ambulance_assigned VARCHAR(100),
    eta_minutes INTEGER DEFAULT 10,
    response_note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. CareRoute Request Events (Audit Trail & Timeline)
CREATE TABLE IF NOT EXISTS careroute_request_events (
    id BIGSERIAL PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL REFERENCES careroute_requests(id) ON DELETE CASCADE,
    actor_id VARCHAR(64),
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('patient', 'staff', 'system')),
    previous_status VARCHAR(20),
    new_status VARCHAR(20) NOT NULL,
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance & strict hospital isolation filtering
CREATE INDEX IF NOT EXISTS idx_careroute_requests_hospital ON careroute_requests(assigned_hospital_id);
CREATE INDEX IF NOT EXISTS idx_careroute_requests_status ON careroute_requests(status);
CREATE INDEX IF NOT EXISTS idx_careroute_requests_tracking ON careroute_requests(tracking_code);
CREATE INDEX IF NOT EXISTS idx_careroute_requests_created ON careroute_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_careroute_staff_hospital ON careroute_hospital_staff(hospital_id);
CREATE INDEX IF NOT EXISTS idx_careroute_events_request ON careroute_request_events(request_id);

-- Enable Row Level Security (RLS)
ALTER TABLE careroute_hospitals ENABLE ROW LEVEL SECURITY;
ALTER TABLE careroute_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE careroute_hospital_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE careroute_request_events ENABLE ROW LEVEL SECURITY;

-- Public / Anonymous Access Policies (for emergency portal clients)
CREATE POLICY "Allow public read on hospitals" ON careroute_hospitals FOR SELECT USING (true);
CREATE POLICY "Allow public update on hospitals" ON careroute_hospitals FOR UPDATE USING (true);
CREATE POLICY "Allow public read on staff" ON careroute_hospital_staff FOR SELECT USING (true);
CREATE POLICY "Allow public read on requests" ON careroute_requests FOR SELECT USING (true);
CREATE POLICY "Allow public insert on requests" ON careroute_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update on requests" ON careroute_requests FOR UPDATE USING (true);
CREATE POLICY "Allow public read on events" ON careroute_request_events FOR SELECT USING (true);
CREATE POLICY "Allow public insert on events" ON careroute_request_events FOR INSERT WITH CHECK (true);

-- Enable Realtime on hospitals & emergency requests
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'careroute_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE careroute_requests;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'careroute_hospitals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE careroute_hospitals;
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- ----------------------------------------------------------------------
-- Seed Initial Participating Hospitals
-- ----------------------------------------------------------------------
INSERT INTO careroute_hospitals (
    id, name, address, city, country, phone, emergency_contact, latitude, longitude,
    intake_status, capabilities, er_capacity_total, er_capacity_available, bed_breakdown, on_duty_doctors,
    trauma_level, reported_capacity_timestamp, capacity_data_source
) VALUES
(
    'hosp-b-trauma',
    'Hospital B — St. Jude Trauma & Emergency',
    '24 Emergency Parkway, West District',
    'Central City',
    'Global',
    '+1 (555) 018-9922',
    '+1 (555) 911-0022',
    6.538,
    3.392,
    'active',
    ARRAY['Trauma', 'Accident / Trauma', 'Cardiac', 'General', 'Surgical'],
    50,
    8,
    '{"icuAvailable": 3, "icuTotal": 12, "traumaBayAvailable": 2, "traumaBayTotal": 8, "generalErAvailable": 2, "generalErTotal": 20, "pediatricAvailable": 1, "pediatricTotal": 4, "ventilatorAvailable": 2, "ventilatorTotal": 6}'::jsonb,
    '[{"id": "doc-b1", "name": "Dr. Sarah Jenkins", "specialty": "Chief Trauma Surgeon", "shift": "Day Shift (08:00 - 20:00)", "status": "on_duty", "contact": "Ext. 201"}, {"id": "doc-b2", "name": "Dr. Tariq Al-Mansoor", "specialty": "Neurotrauma & ER Resuscitation", "shift": "Emergency Day Shift", "status": "on_duty", "contact": "Ext. 204"}, {"id": "doc-b3", "name": "Dr. Chloe Martin", "specialty": "Orthopedic & Trauma Specialist", "shift": "On-Call Trauma", "status": "on_call", "contact": "Ext. 208"}]'::jsonb,
    'Level 1 Trauma Center',
    'Today, 14:22',
    'hospital_reported'
),
(
    'hosp-a-cardiac',
    'Hospital A — Metropolitan Cardiac & Medical Center',
    '142 Medical Boulevard, North Campus',
    'Central City',
    'Global',
    '+1 (555) 019-2831',
    '+1 (555) 911-0011',
    6.56,
    3.41,
    'active',
    ARRAY['Cardiac', 'Cardiac Emergency', 'Respiratory', 'Breathing / Respiratory', 'General'],
    40,
    14,
    '{"icuAvailable": 4, "icuTotal": 10, "traumaBayAvailable": 2, "traumaBayTotal": 6, "generalErAvailable": 6, "generalErTotal": 16, "pediatricAvailable": 2, "pediatricTotal": 4, "ventilatorAvailable": 3, "ventilatorTotal": 6}'::jsonb,
    '[{"id": "doc-a1", "name": "Dr. Marcus Vance", "specialty": "Chief ER Physician & Cardiac Lead", "shift": "Day Shift (08:00 - 20:00)", "status": "on_duty", "contact": "Ext. 101"}, {"id": "doc-a2", "name": "Dr. Elena Rostova", "specialty": "Interventional Cardiologist", "shift": "Day Shift (08:00 - 20:00)", "status": "on_duty", "contact": "Ext. 104"}, {"id": "doc-a3", "name": "Dr. David Chen", "specialty": "Critical Care & Anesthesiology", "shift": "Emergency Surgery Rotation", "status": "in_surgery", "contact": "Ext. 108"}]'::jsonb,
    'Level 2 Specialty',
    'Today, 14:15',
    'hospital_reported'
),
(
    'hosp-c-apex',
    'Hospital C — Apex Emergency Clinic',
    '88 Crescent Avenue, Harborview',
    'Central City',
    'Global',
    '+1 (555) 017-7461',
    '+1 (555) 911-0033',
    6.531,
    3.385,
    'inactive',
    ARRAY['Trauma', 'Accident / Trauma', 'General'],
    20,
    0,
    '{"icuAvailable": 0, "icuTotal": 2, "traumaBayAvailable": 0, "traumaBayTotal": 4, "generalErAvailable": 0, "generalErTotal": 10, "pediatricAvailable": 0, "pediatricTotal": 2, "ventilatorAvailable": 0, "ventilatorTotal": 2}'::jsonb,
    '[{"id": "doc-c1", "name": "Dr. Robert Klein", "specialty": "General ER Physician", "shift": "Off-Duty / Diverted", "status": "off_duty", "contact": "Ext. 301"}]'::jsonb,
    'Level 3 Clinic',
    'Today, 13:40',
    'hospital_reported'
),
(
    'hosp-d-pediatric',
    'Hospital D — Valley Pediatric & Maternity Center',
    '50 Valley Road, South Hills',
    'Central City',
    'Global',
    '+1 (555) 016-5510',
    '+1 (555) 911-0044',
    6.55,
    3.37,
    'active',
    ARRAY['Pediatric', 'Pediatric Emergency', 'Maternity', 'Maternity Emergency', 'General'],
    30,
    11,
    '{"icuAvailable": 3, "icuTotal": 6, "traumaBayAvailable": 1, "traumaBayTotal": 4, "generalErAvailable": 4, "generalErTotal": 12, "pediatricAvailable": 3, "pediatricTotal": 8, "ventilatorAvailable": 2, "ventilatorTotal": 4}'::jsonb,
    '[{"id": "doc-d1", "name": "Dr. Priya Nair", "specialty": "Pediatric Emergency Specialist", "shift": "Day Shift (08:00 - 20:00)", "status": "on_duty", "contact": "Ext. 401"}, {"id": "doc-d2", "name": "Dr. Alan Brooks", "specialty": "Obstetric & Maternity Lead", "shift": "Day Shift (08:00 - 20:00)", "status": "on_duty", "contact": "Ext. 405"}]'::jsonb,
    'Specialized Pediatric',
    'Today, 12:50',
    'demo_data'
)
ON CONFLICT (id) DO UPDATE SET
    bed_breakdown = EXCLUDED.bed_breakdown,
    on_duty_doctors = EXCLUDED.on_duty_doctors,
    intake_status = EXCLUDED.intake_status;

-- ----------------------------------------------------------------------
-- Seed Demo Hospital Staff Accounts
-- ----------------------------------------------------------------------
INSERT INTO careroute_hospital_staff (id, hospital_id, username, full_name, role, email, password_hash, is_active)
VALUES
('staff-b-01', 'hosp-b-trauma', 'hospitalB_staff', 'Dr. Sarah Jenkins (Hospital B)', 'Chief Trauma Coordinator', 'staff_b@hospital.com', 'password123', true),
('staff-a-01', 'hosp-a-cardiac', 'hospitalA_staff', 'Dr. Marcus Vance (Hospital A)', 'ER Intake Supervisor', 'staff_a@hospital.com', 'password123', true),
('staff-c-01', 'hosp-c-apex', 'hospitalC_staff', 'Dr. Robert Klein (Hospital C)', 'Clinic Manager', 'staff_c@hospital.com', 'password123', true)
ON CONFLICT (username) DO NOTHING;
