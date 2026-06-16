import mongoose, { Document, Schema } from 'mongoose';
import type { DayStatus } from '@app-types/enums';

export interface IAttendanceSession {
  checkIn: { timestamp: Date; latitude: number; longitude: number };
  checkOut?: { timestamp: Date; latitude: number; longitude: number };
  durationMinutes?: number;
}

export interface IAttendanceRecord extends Document {
  employeeId: mongoose.Types.ObjectId;
  date: string;
  dayStatus: DayStatus;
  sessions: IAttendanceSession[];
  totalMinutes: number;
  isLateArrival: boolean;
  lateByMinutes: number;
  isHalfDayCapped: boolean;
  regularizationId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<IAttendanceSession>(
  {
    checkIn: {
      timestamp: { type: Date, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
    },
    checkOut: {
      timestamp: Date,
      latitude: Number,
      longitude: Number,
    },
    durationMinutes: Number,
  },
  { _id: false },
);

const AttendanceRecordSchema = new Schema<IAttendanceRecord>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: 'Employee', required: true },
    date: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    dayStatus: { type: String, required: true },
    sessions: [SessionSchema],
    totalMinutes: { type: Number, default: 0 },
    isLateArrival: { type: Boolean, default: false },
    lateByMinutes: { type: Number, default: 0 },
    isHalfDayCapped: { type: Boolean, default: false },
    regularizationId: { type: Schema.Types.ObjectId, ref: 'Regularization' },
  },
  { timestamps: true },
);

AttendanceRecordSchema.index({ employeeId: 1, date: 1 }, { unique: true });
AttendanceRecordSchema.index({ date: 1, dayStatus: 1 });

export const AttendanceRecord =
  mongoose.models.AttendanceRecord ??
  mongoose.model<IAttendanceRecord>('AttendanceRecord', AttendanceRecordSchema);
