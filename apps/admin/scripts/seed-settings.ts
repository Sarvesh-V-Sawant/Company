import './bootstrap-env';
import mongoose from 'mongoose';
import { CompanySettings } from '../src/models/CompanySettings';
import { Holiday } from '../src/models/Holiday';
import { User } from '../src/models/User';

export async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');

  await mongoose.connect(uri);
  console.log('[seed-settings] Connected to MongoDB');

  // ── CompanySettings ─────────────────────────────────────────────────────────

  const existing = await CompanySettings.findById('company-settings').lean();
  if (existing) {
    console.log('[seed-settings] CompanySettings already exists — skipping settings seed');
  } else {
    const companyName = process.env.SEED_COMPANY_NAME ?? 'Genesis Workforce';
    const geofenceLat  = parseFloat(process.env.SEED_GEOFENCE_LATITUDE  ?? '19.0760');
    const geofenceLng  = parseFloat(process.env.SEED_GEOFENCE_LONGITUDE ?? '72.8777');
    const geofenceR    = parseInt(process.env.SEED_GEOFENCE_RADIUS_METERS ?? '200', 10);
    const geofenceOn   = (process.env.SEED_GEOFENCE_ENABLED ?? 'true') !== 'false';

    await CompanySettings.create({
      _id: 'company-settings',

      // Company identity
      companyName,
      timezone:  'Asia/Kolkata',
      currency:  'INR',

      // Shift
      workStartTime:  '09:00',
      workEndTime:    '18:00',
      halfDayLateCheckInTime: '14:00',
      requiredDailyMinutes:    480,   // 8 hours
      halfDayThresholdMinutes: 240,   // 4 hours
      sessionAutoClosePaddingMinutes: 30,

      // Attendance
      lateArrivalGraceMinutes:       15,
      regularizationLookbackDays:     7,
      gpsAccuracyThresholdMeters:    50,
      checkinTimestampWindowMinutes:  5,

      // Working days (Mon–Fri)
      workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],

      // Geofence — requires real coordinates before Go-Live
      geoFence: {
        latitude:     geofenceLat,
        longitude:    geofenceLng,
        radiusMeters: geofenceR,
        isEnabled:    geofenceOn,
      },

      // Leave
      leaveYearStartMonth: 1,
      leaveTypes: {
        paidLeave: {
          annualAllocation: 12,
          carryForward: { enabled: true, maxDays: 15, expiryMonths: 3 },
          encashable: false,
        },
        sickLeave: {
          annualAllocation: 12,
          carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 },
          encashable: false,
        },
        casualLeave: {
          annualAllocation: 6,
          carryForward: { enabled: false, maxDays: 0, expiryMonths: 0 },
          encashable: false,
        },
      },

      // Payroll
      payrollCutoffDay: 25,

      // Notifications
      attendanceReminderEnabled: true,
      attendanceReminderTime:    '10:30',
    });

    console.log(`[seed-settings] CompanySettings created: ${companyName}`);
  }

  // ── National Holidays (current year) ────────────────────────────────────────

  const admin = await User.findOne({ role: 'admin', isActive: true }).select('_id').lean();
  if (!admin) {
    console.log('[seed-settings] No admin user found — skipping holiday seed. Run seed:admin first.');
    await mongoose.disconnect();
    return;
  }

  const currentYear = new Date().getFullYear();
  const existingHolidayCount = await Holiday.countDocuments({ year: currentYear });

  if (existingHolidayCount > 0) {
    console.log(`[seed-settings] ${existingHolidayCount} holidays already exist for ${currentYear} — skipping`);
  } else {
    const createdBy = admin._id as mongoose.Types.ObjectId;

    const nationalHolidays: Array<{ dateString: string; name: string; description?: string }> = [
      { dateString: `${currentYear}-01-26`, name: 'Republic Day',                 description: 'National holiday — Republic of India' },
      { dateString: `${currentYear}-08-15`, name: 'Independence Day',              description: 'National holiday — Indian Independence' },
      { dateString: `${currentYear}-10-02`, name: 'Gandhi Jayanti',                description: 'National holiday — Birthday of Mahatma Gandhi' },
    ];

    const companyHolidays: Array<{ dateString: string; name: string; description?: string }> = [
      { dateString: `${currentYear}-01-01`, name: 'New Year\'s Day',              description: 'Company holiday' },
      { dateString: `${currentYear}-12-25`, name: 'Christmas Day',                description: 'Company holiday' },
    ];

    const toInsert = [
      ...nationalHolidays.map(h => ({ ...h, type: 'national' as const })),
      ...companyHolidays.map(h => ({ ...h, type: 'company' as const })),
    ].map(h => ({
      date:       new Date(h.dateString),
      dateString: h.dateString,
      name:       h.name,
      description: h.description,
      type:        h.type,
      year:        currentYear,
      createdBy,
    }));

    // insertMany with ordered:false so duplicate dateString on re-run fails gracefully
    try {
      const result = await Holiday.insertMany(toInsert, { ordered: false });
      console.log(`[seed-settings] ${result.length} holidays seeded for ${currentYear}`);
    } catch (err: unknown) {
      const writeErr = err as { writeErrors?: unknown[]; insertedDocs?: unknown[] };
      const inserted = writeErr.insertedDocs?.length ?? 0;
      const skipped  = writeErr.writeErrors?.length  ?? 0;
      console.log(`[seed-settings] Holidays: ${inserted} inserted, ${skipped} skipped (duplicates)`);
    }

    console.log('[seed-settings] Holiday list:');
    for (const h of toInsert) {
      console.log(`  ${h.dateString}  ${h.name} (${h.type})`);
    }
  }

  await mongoose.disconnect();
  console.log('[seed-settings] Done');
}

main().catch((err) => {
  console.error('[seed-settings] Error:', err);
  process.exit(1);
});
