import mongoose, { Document, Model, Schema } from 'mongoose';

export interface IRegisteredDevice {
  fingerprintHash: string;
  registeredAt: Date;
  deviceInfo: string;
  platform: 'android' | 'ios';
}

export interface IDeviceHistoryEntry {
  fingerprintHash: string;
  deviceName: string;
  platform: 'android' | 'ios';
  registeredAt: Date;
  revokedAt?: Date;
  revokedBy?: mongoose.Types.ObjectId;
  revokedReason: 'manual_revocation' | 'replacement' | 'admin_reset';
}

export interface ILeaveTypeBalance {
  currentYear: number;
  carriedForward: number;
  carryForwardExpiry?: Date;
}

export interface ILeaveBalances {
  paidLeave: ILeaveTypeBalance;
  sickLeave: ILeaveTypeBalance;
  casualLeave: ILeaveTypeBalance;
}

export interface IUser extends Document {
  employeeId: string;
  firstName: string;
  lastName: string;
  email: string;
  passwordHash: string;
  role: 'admin' | 'employee' | 'super_admin' | 'manager' | 'executive';
  phone?: string;
  department?: string;
  designation?: string;
  monthlySalary: number;
  dateOfJoining: Date;
  dateOfLeaving?: Date;
  isActive: boolean;
  requiresPasswordChange: boolean;
  lastLoginAt?: Date;
  registeredDevice: IRegisteredDevice | null;
  deviceHistory: IDeviceHistoryEntry[];
  leaveBalances: ILeaveBalances;
  createdBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DeviceHistoryEntrySchema = new Schema<IDeviceHistoryEntry>(
  {
    fingerprintHash: { type: String, required: true },
    deviceName:      { type: String, required: true },
    platform:        { type: String, enum: ['android', 'ios'], required: true },
    registeredAt:    { type: Date, required: true },
    revokedAt:       { type: Date },
    revokedBy:       { type: Schema.Types.ObjectId, ref: 'User' },
    revokedReason:   { type: String, enum: ['manual_revocation', 'replacement', 'admin_reset'], required: true },
  },
  { _id: false },
);

const RegisteredDeviceSchema = new Schema<IRegisteredDevice>(
  {
    fingerprintHash: { type: String, required: true },
    registeredAt: { type: Date, required: true },
    deviceInfo: { type: String, required: true },
    platform: { type: String, enum: ['android', 'ios'], required: true },
  },
  { _id: false },
);

const LeaveTypeBalanceSchema = new Schema<ILeaveTypeBalance>(
  {
    currentYear: { type: Number, required: true, min: 0, default: 0 },
    carriedForward: { type: Number, required: true, min: 0, default: 0 },
    carryForwardExpiry: { type: Date },
  },
  { _id: false },
);

const LeaveBalancesSchema = new Schema<ILeaveBalances>(
  {
    paidLeave: { type: LeaveTypeBalanceSchema, required: true },
    sickLeave: { type: LeaveTypeBalanceSchema, required: true },
    casualLeave: { type: LeaveTypeBalanceSchema, required: true },
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    employeeId: { type: String, required: true, unique: true, trim: true, uppercase: true },
    firstName: { type: String, required: true, trim: true, maxlength: 100 },
    lastName: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'employee', 'super_admin', 'manager', 'executive'], required: true, default: 'employee' },
    phone: { type: String, trim: true, maxlength: 20 },
    department: { type: String, trim: true, maxlength: 100 },
    designation: { type: String, trim: true, maxlength: 100 },
    monthlySalary: { type: Number, required: true, min: 0 },
    dateOfJoining: { type: Date, required: true },
    dateOfLeaving: { type: Date },
    isActive: { type: Boolean, required: true, default: true },
    requiresPasswordChange: { type: Boolean, required: true, default: true },
    lastLoginAt: { type: Date },
    registeredDevice: { type: RegisteredDeviceSchema, default: null },
    deviceHistory:    { type: [DeviceHistoryEntrySchema], default: [] },
    leaveBalances: {
      type: LeaveBalancesSchema,
      required: true,
      default: () => ({
        paidLeave: { currentYear: 0, carriedForward: 0 },
        sickLeave: { currentYear: 0, carriedForward: 0 },
        casualLeave: { currentYear: 0, carriedForward: 0 },
      }),
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

UserSchema.index({ isActive: 1, role: 1 });
UserSchema.index({ role: 1 });
UserSchema.index({ department: 1 });

export const User: Model<IUser> =
  (mongoose.models['User'] as Model<IUser>) ?? mongoose.model<IUser>('User', UserSchema);
