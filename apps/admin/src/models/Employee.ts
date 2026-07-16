import mongoose, { Document, Schema } from 'mongoose';

export interface ISalaryComponents {
  basic?: number;
  hra?: number;
  specialAllowance?: number;
  otherAllowances?: number;
}

export interface IEmployee extends Document {
  userId: mongoose.Types.ObjectId;
  employeeCode: string;
  firstName: string;
  lastName: string;
  department?: string;
  designation?: string;
  joiningDate: Date;
  monthlySalary: number;
  salaryComponents?: ISalaryComponents;
  status: 'active' | 'inactive';
  deviceHash?: string;
  fcmToken?: string;
  allowOutsideGeofence: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    employeeCode: { type: String, required: true, unique: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    department: { type: String, trim: true },
    designation: { type: String, trim: true },
    joiningDate: { type: Date, required: true },
    monthlySalary: { type: Number, required: true, min: 0 },
    salaryComponents: {
      basic:            { type: Number, min: 0 },
      hra:              { type: Number, min: 0 },
      specialAllowance: { type: Number, min: 0 },
      otherAllowances:  { type: Number, min: 0 },
    },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    deviceHash: { type: String },
    fcmToken: { type: String },
    allowOutsideGeofence: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const Employee =
  mongoose.models.Employee ?? mongoose.model<IEmployee>('Employee', EmployeeSchema);
