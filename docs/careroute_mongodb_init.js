/**
 * ==============================================================================
 * SMAJ CareRoute - Official MongoDB Initialization & Migration Script
 * ==============================================================================
 * Description:
 * This script initializes all CareRoute emergency collections, schema validators,
 * performance indexes, and initial hospital seed data in MongoDB (MongoDB Atlas / mongosh).
 *
 * HOW TO EXECUTE BY SUPERVISOR / CLIENT:
 * Option A (MongoDB Compass):
 *   Open MongoDB Compass -> Connect to Cluster -> Click "Mongosh" at the bottom -> Paste and run this script.
 * Option B (mongosh CLI):
 *   mongosh "<YOUR_MONGODB_URI>" < careroute_mongodb_init.js
 * Option C (Atlas Web Portal):
 *   Atlas Web UI -> Database -> Connect -> Atlas Shell -> Paste and execute.
 * ==============================================================================
 */

// Target Database: uses current DB or switches to smajpihub
const dbName = db.getName() || "smajpihub";
print(`>>> Initializing SMAJ CareRoute collections in database: ${dbName}...`);

// ------------------------------------------------------------------------------
// 1. COLLECTION: careroute_hospitals
// ------------------------------------------------------------------------------
print(">>> [1/4] Configuring collection: careroute_hospitals...");

db.createCollection("careroute_hospitals", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["id", "name", "address", "city", "phone", "latitude", "longitude", "intake_status", "er_capacity_total", "er_capacity_available"],
      properties: {
        id: { bsonType: "string", description: "Unique hospital identifier" },
        name: { bsonType: "string", description: "Hospital facility name" },
        address: { bsonType: "string" },
        city: { bsonType: "string" },
        country: { bsonType: "string" },
        phone: { bsonType: "string" },
        emergency_contact: { bsonType: "string" },
        latitude: { bsonType: "double" },
        longitude: { bsonType: "double" },
        intake_status: { enum: ["active", "diverting", "inactive"] },
        capabilities: { bsonType: "array" },
        er_capacity_total: { bsonType: "int" },
        er_capacity_available: { bsonType: "int" },
        bed_breakdown: {
          bsonType: "object",
          properties: {
            icuAvailable: { bsonType: "int" },
            icuTotal: { bsonType: "int" },
            traumaBayAvailable: { bsonType: "int" },
            traumaBayTotal: { bsonType: "int" },
            generalErAvailable: { bsonType: "int" },
            generalErTotal: { bsonType: "int" },
            pediatricAvailable: { bsonType: "int" },
            pediatricTotal: { bsonType: "int" },
            ventilatorAvailable: { bsonType: "int" },
            ventilatorTotal: { bsonType: "int" }
          }
        },
        on_duty_doctors: { bsonType: "array" },
        trauma_level: { bsonType: "string" },
        created_at: { bsonType: ["date", "string"] },
        updated_at: { bsonType: ["date", "string"] }
      }
    }
  },
  validationAction: "warn"
});

// Indexes for geolocation & capacity filtering
db.careroute_hospitals.createIndex({ id: 1 }, { unique: true });
db.careroute_hospitals.createIndex({ intake_status: 1 });
db.careroute_hospitals.createIndex({ latitude: 1, longitude: 1 });

// Seed Default Hospitals
db.careroute_hospitals.bulkWrite([
  {
    updateOne: {
      filter: { id: "hosp-b-trauma" },
      update: {
        $set: {
          id: "hosp-b-trauma",
          name: "Hospital B — St. Jude Trauma & Emergency",
          address: "24 Emergency Parkway, West District",
          city: "Central City",
          country: "Global",
          phone: "+1 (555) 018-9922",
          emergency_contact: "+1 (555) 911-0022",
          latitude: 6.538,
          longitude: 3.392,
          intake_status: "active",
          capabilities: ["Trauma", "Accident / Trauma", "Cardiac", "General", "Surgical"],
          er_capacity_total: NumberInt(50),
          er_capacity_available: NumberInt(8),
          bed_breakdown: {
            icuAvailable: NumberInt(3),
            icuTotal: NumberInt(12),
            traumaBayAvailable: NumberInt(2),
            traumaBayTotal: NumberInt(8),
            generalErAvailable: NumberInt(2),
            generalErTotal: NumberInt(20),
            pediatricAvailable: NumberInt(1),
            pediatricTotal: NumberInt(4),
            ventilatorAvailable: NumberInt(2),
            ventilatorTotal: NumberInt(6)
          },
          on_duty_doctors: [
            { id: "doc-b1", name: "Dr. Sarah Jenkins", specialty: "Chief Trauma Surgeon", shift: "Day Shift (08:00 - 20:00)", status: "on_duty", contact: "Ext. 201" },
            { id: "doc-b2", name: "Dr. Tariq Al-Mansoor", specialty: "Neurotrauma & ER Resuscitation", shift: "Emergency Day Shift", status: "on_duty", contact: "Ext. 204" },
            { id: "doc-b3", name: "Dr. Chloe Martin", specialty: "Orthopedic & Trauma Specialist", shift: "On-Call Trauma", status: "on_call", contact: "Ext. 208" }
          ],
          trauma_level: "Level 1 Trauma Center",
          created_at: new Date(),
          updated_at: new Date()
        }
      },
      upsert: true
    }
  },
  {
    updateOne: {
      filter: { id: "hosp-a-cardiac" },
      update: {
        $set: {
          id: "hosp-a-cardiac",
          name: "Hospital A — Metropolitan Cardiac & Medical Center",
          address: "142 Medical Boulevard, North Campus",
          city: "Central City",
          country: "Global",
          phone: "+1 (555) 019-2831",
          emergency_contact: "+1 (555) 911-0011",
          latitude: 6.56,
          longitude: 3.41,
          intake_status: "active",
          capabilities: ["Cardiac", "Cardiac Emergency", "Respiratory", "Breathing / Respiratory", "General"],
          er_capacity_total: NumberInt(40),
          er_capacity_available: NumberInt(14),
          bed_breakdown: {
            icuAvailable: NumberInt(4),
            icuTotal: NumberInt(10),
            traumaBayAvailable: NumberInt(2),
            traumaBayTotal: NumberInt(6),
            generalErAvailable: NumberInt(6),
            generalErTotal: NumberInt(16),
            pediatricAvailable: NumberInt(2),
            pediatricTotal: NumberInt(4),
            ventilatorAvailable: NumberInt(3),
            ventilatorTotal: NumberInt(6)
          },
          on_duty_doctors: [
            { id: "doc-a1", name: "Dr. Marcus Vance", specialty: "Chief ER Physician & Cardiac Lead", shift: "Day Shift (08:00 - 20:00)", status: "on_duty", contact: "Ext. 101" },
            { id: "doc-a2", name: "Dr. Elena Rostova", specialty: "Interventional Cardiologist", shift: "Day Shift (08:00 - 20:00)", status: "on_duty", contact: "Ext. 104" },
            { id: "doc-a3", name: "Dr. David Chen", specialty: "Critical Care & Anesthesiology", shift: "Emergency Surgery Rotation", status: "in_surgery", contact: "Ext. 108" }
          ],
          trauma_level: "Level 2 Specialty",
          created_at: new Date(),
          updated_at: new Date()
        }
      },
      upsert: true
    }
  },
  {
    updateOne: {
      filter: { id: "hosp-c-apex" },
      update: {
        $set: {
          id: "hosp-c-apex",
          name: "Hospital C — Apex Emergency Clinic",
          address: "88 Crescent Avenue, Harborview",
          city: "Central City",
          country: "Global",
          phone: "+1 (555) 017-7461",
          emergency_contact: "+1 (555) 911-0033",
          latitude: 6.531,
          longitude: 3.385,
          intake_status: "inactive",
          capabilities: ["Trauma", "Accident / Trauma", "General"],
          er_capacity_total: NumberInt(20),
          er_capacity_available: NumberInt(0),
          bed_breakdown: {
            icuAvailable: NumberInt(0),
            icuTotal: NumberInt(2),
            traumaBayAvailable: NumberInt(0),
            traumaBayTotal: NumberInt(4),
            generalErAvailable: NumberInt(0),
            generalErTotal: NumberInt(10),
            pediatricAvailable: NumberInt(0),
            pediatricTotal: NumberInt(2),
            ventilatorAvailable: NumberInt(0),
            ventilatorTotal: NumberInt(2)
          },
          on_duty_doctors: [
            { id: "doc-c1", name: "Dr. Robert Klein", specialty: "General ER Physician", shift: "Off-Duty / Diverted", status: "off_duty", contact: "Ext. 301" }
          ],
          trauma_level: "Level 3 Clinic",
          created_at: new Date(),
          updated_at: new Date()
        }
      },
      upsert: true
    }
  },
  {
    updateOne: {
      filter: { id: "hosp-d-pediatric" },
      update: {
        $set: {
          id: "hosp-d-pediatric",
          name: "Hospital D — Valley Pediatric & Maternity Center",
          address: "50 Valley Road, South Hills",
          city: "Central City",
          country: "Global",
          phone: "+1 (555) 016-5510",
          emergency_contact: "+1 (555) 911-0044",
          latitude: 6.55,
          longitude: 3.37,
          intake_status: "active",
          capabilities: ["Pediatric", "Pediatric Emergency", "Maternity", "Maternity Emergency", "General"],
          er_capacity_total: NumberInt(30),
          er_capacity_available: NumberInt(11),
          bed_breakdown: {
            icuAvailable: NumberInt(3),
            icuTotal: NumberInt(6),
            traumaBayAvailable: NumberInt(1),
            traumaBayTotal: NumberInt(4),
            generalErAvailable: NumberInt(4),
            generalErTotal: NumberInt(12),
            pediatricAvailable: NumberInt(3),
            pediatricTotal: NumberInt(8),
            ventilatorAvailable: NumberInt(2),
            ventilatorTotal: NumberInt(4)
          },
          on_duty_doctors: [
            { id: "doc-d1", name: "Dr. Priya Nair", specialty: "Pediatric Emergency Specialist", shift: "Day Shift (08:00 - 20:00)", status: "on_duty", contact: "Ext. 401" },
            { id: "doc-d2", name: "Dr. Alan Brooks", specialty: "Obstetric & Maternity Lead", shift: "Day Shift (08:00 - 20:00)", status: "on_duty", contact: "Ext. 405" }
          ],
          trauma_level: "Specialized Pediatric",
          created_at: new Date(),
          updated_at: new Date()
        }
      },
      upsert: true
    }
  }
]);

// ------------------------------------------------------------------------------
// 2. COLLECTION: careroute_hospital_staff
// ------------------------------------------------------------------------------
print(">>> [2/4] Configuring collection: careroute_hospital_staff...");

db.createCollection("careroute_hospital_staff");
db.careroute_hospital_staff.createIndex({ id: 1 }, { unique: true });
db.careroute_hospital_staff.createIndex({ username: 1 }, { unique: true });
db.careroute_hospital_staff.createIndex({ hospital_id: 1 });

db.careroute_hospital_staff.bulkWrite([
  {
    updateOne: {
      filter: { username: "hospitalB_staff" },
      update: {
        $set: {
          id: "staff-b-01",
          hospital_id: "hosp-b-trauma",
          username: "hospitalB_staff",
          full_name: "Dr. Sarah Jenkins (Hospital B)",
          role: "Chief Trauma Coordinator",
          email: "staff_b@hospital.com",
          is_active: true,
          updated_at: new Date()
        }
      },
      upsert: true
    }
  },
  {
    updateOne: {
      filter: { username: "hospitalA_staff" },
      update: {
        $set: {
          id: "staff-a-01",
          hospital_id: "hosp-a-cardiac",
          username: "hospitalA_staff",
          full_name: "Dr. Marcus Vance (Hospital A)",
          role: "ER Intake Supervisor",
          email: "staff_a@hospital.com",
          is_active: true,
          updated_at: new Date()
        }
      },
      upsert: true
    }
  },
  {
    updateOne: {
      filter: { username: "hospitalC_staff" },
      update: {
        $set: {
          id: "staff-c-01",
          hospital_id: "hosp-c-apex",
          username: "hospitalC_staff",
          full_name: "Dr. Robert Klein (Hospital C)",
          role: "Clinic Manager",
          email: "staff_c@hospital.com",
          is_active: true,
          updated_at: new Date()
        }
      },
      upsert: true
    }
  }
]);

// ------------------------------------------------------------------------------
// 3. COLLECTION: careroute_requests (Emergency Requests)
// ------------------------------------------------------------------------------
print(">>> [3/4] Configuring collection: careroute_requests...");

db.createCollection("careroute_requests");
// STRICT DATA ISOLATION INDEXES:
db.careroute_requests.createIndex({ assigned_hospital_id: 1, status: 1 });
db.careroute_requests.createIndex({ tracking_code: 1 }, { unique: true });
db.careroute_requests.createIndex({ patient_pi_username: 1, created_at: -1 });
db.careroute_requests.createIndex({ created_at: -1 });

// ------------------------------------------------------------------------------
// 4. COLLECTION: careroute_request_events (Audit Trail & Timeline)
// ------------------------------------------------------------------------------
print(">>> [4/4] Configuring collection: careroute_request_events...");

db.createCollection("careroute_request_events");
db.careroute_request_events.createIndex({ request_id: 1, created_at: -1 });

print(">>> SUCCESS: SMAJ CareRoute MongoDB initialization script completed successfully!");
