import mongoose, { Document, Schema } from 'mongoose';
import type { WeekDay } from '@app-types/enums';

export interface IGeoFenceConfig {
  latitude: number;
  longitude: number;
  radiusMeters: number;
  isEnabled: boolean;
}

export interface ICarryForwardConfig {
  enabled: boolean;
  maxDays: number;
  expiryMonths: number;
}

export interface ILeaveTypeConfig {
  annualAllocation: number;
  carryForward: ICarryForwardConfig;
  encashable: boolean;
}

export interface ILeaveTypesConfig {
  paidLeave: ILeaveTypeConfig;
  sickLeave: ILeaveTypeConfig;
  casualLeave: ILeaveTypeConfig;
}

export interface IStatutoryPFConfig {
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wagesCeiling: number;
}

export interface IStatutoryESICConfig {
  enabled: boolean;
  employeeRate: number;
  employerRate: number;
  wagesCeiling: number;
}

export interface IStatutoryPTConfig {
  enabled: boolean;
  state: string;
  monthlySlabs: { upToGross: number; amount: number }[];
}

export interface IStatutoryTDSConfig {
  enabled: boolean;
  flatRate: number;
}

export interface IStatutoryConfig {
  enabled: boolean;
  pf: IStatutoryPFConfig;
  esic: IStatutoryESICConfig;
  pt: IStatutoryPTConfig;
  tds: IStatutoryTDSConfig;
}

export interface ICompanySettings extends Document<string> {
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
  regularizationLookbackDays: number;
  geoFence: IGeoFenceConfig;
  gpsAccuracyThresholdMeters: number;
  checkinTimestampWindowMinutes: number;
  leaveTypes: ILeaveTypesConfig;
  payrollCutoffDay: number;
  attendanceReminderEnabled: boolean;
  attendanceReminderTime: string;
  statutoryConfig?: IStatutoryConfig;
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
  regularizationLookbackDays: { type: Number, default: 7, min: 1 },
  geoFence: {
    latitude:     { type: Number,  required: true },
    longitude:    { type: Number,  required: true },
    radiusMeters: { type: Number,  required: true, min: 50 },
    isEnabled:    { type: Boolean, required: true, default: true },
  },
  gpsAccuracyThresholdMeters:    { type: Number, required: true, default: 100, min: 10 },
  checkinTimestampWindowMinutes: { type: Number, required: true, default: 2,   min: 1  },
  leaveTypes: {
    paidLeave: {
      annualAllocation: { type: Number, default: 12, min: 0 },
      carryForward: {
        enabled:      { type: Boolean, default: true },
        maxDays:      { type: Number, default: 15, min: 0 },
        expiryMonths: { type: Number, default: 3, min: 0 },
      },
      encashable: { type: Boolean, default: false },
    },
    sickLeave: {
      annualAllocation: { type: Number, default: 12, min: 0 },
      carryForward: {
        enabled:      { type: Boolean, default: false },
        maxDays:      { type: Number, default: 0, min: 0 },
        expiryMonths: { type: Number, default: 0, min: 0 },
      },
      encashable: { type: Boolean, default: false },
    },
    casualLeave: {
      annualAllocation: { type: Number, default: 12, min: 0 },
      carryForward: {
        enabled:      { type: Boolean, default: false },
        maxDays:      { type: Number, default: 0, min: 0 },
        expiryMonths: { type: Number, default: 0, min: 0 },
      },
      encashable: { type: Boolean, default: false },
    },
  },
  payrollCutoffDay: { type: Number, default: 25, min: 1, max: 28 },
  attendanceReminderEnabled: { type: Boolean, default: true },
  attendanceReminderTime: { type: String, default: '10:30' },
  statutoryConfig: {
    enabled: { type: Boolean, default: false },
    pf: {
      enabled:      { type: Boolean, default: false },
      employeeRate: { type: Number, default: 12,    min: 0, max: 100 },
      employerRate: { type: Number, default: 12,    min: 0, max: 100 },
      wagesCeiling: { type: Number, default: 15000, min: 0 },
    },
    esic: {
      enabled:      { type: Boolean, default: false },
      employeeRate: { type: Number, default: 0.75,  min: 0, max: 100 },
      employerRate: { type: Number, default: 3.25,  min: 0, max: 100 },
      wagesCeiling: { type: Number, default: 21000, min: 0 },
    },
    pt: {
      enabled:     { type: Boolean, default: false },
      state:       { type: String, default: '' },
      monthlySlabs: [{ upToGross: Number, amount: Number }],
    },
    tds: {
      enabled:  { type: Boolean, default: false },
      flatRate: { type: Number, default: 10, min: 0, max: 100 },
    },
  },
});

export const CompanySettings =
  mongoose.models.CompanySettings ??
  mongoose.model<ICompanySettings>('CompanySettings', CompanySettingsSchema);
