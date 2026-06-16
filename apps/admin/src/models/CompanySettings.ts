import mongoose, { Document, Schema } from 'mongoose';
import type { WeekDay } from '@app-types/enums';

export interface IGeoFenceConfig {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export interface ICompanySettings extends Document {
  _id: string;
  companyName: string;
  timezone: string;
  currency: string;
  workStartTime: string;
  workEndTime: string;
  sessionAutoClosePaddingMinutes: number;
  lateArrivalGraceMinutes: number;
  halfDayLateCheckInTime: string;
  requiredDailyMinutes: number;
  halfDayThresholdMinutes: number;
  workingDays: WeekDay[];
  leaveYearStartMonth: number;
  geoFence: IGeoFenceConfig;
  payrollCutoffDay: number;
  attendanceReminderEnabled: boolean;
  attendanceReminderTime: string;
}

const CompanySettingsSchema = new Schema<ICompanySettings>({
  _id: { type: String, default: 'company-settings' },
  companyName: { type: String, required: true },
  timezone: { type: String, default: 'Asia/Kolkata' },
  currency: { type: String, default: 'INR' },
  workStartTime: { type: String, required: true },
  workEndTime: { type: String, required: true },
  sessionAutoClosePaddingMinutes: { type: Number, default: 30, min: 0, max: 120 },
  lateArrivalGraceMinutes: { type: Number, default: 0, min: 0, max: 120 },
  halfDayLateCheckInTime: { type: String, required: true, match: /^\d{2}:\d{2}$/ },
  requiredDailyMinutes: { type: Number, required: true, min: 60 },
  halfDayThresholdMinutes: { type: Number, required: true, min: 60 },
  workingDays: [{ type: String }],
  leaveYearStartMonth: { type: Number, default: 1, min: 1, max: 12 },
  geoFence: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    radiusMeters: { type: Number, required: true, min: 50 },
  },
  payrollCutoffDay: { type: Number, default: 25, min: 1, max: 28 },
  attendanceReminderEnabled: { type: Boolean, default: true },
  attendanceReminderTime: { type: String, default: '10:30' },
});

export const CompanySettings =
  mongoose.models.CompanySettings ??
  mongoose.model<ICompanySettings>('CompanySettings', CompanySettingsSchema);
