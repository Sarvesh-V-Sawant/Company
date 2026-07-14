import mongoose, { Document, Model, Schema } from 'mongoose';

export interface ILocationSnapshot extends Document {
  employeeId: mongoose.Types.ObjectId;
  attendanceSessionId: mongoose.Types.ObjectId;
  dateString: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: Date;
  source: 'mobile';
  address?: string | null;
  geocodingStatus?: string;
  geocodingProvider?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const LocationSnapshotSchema = new Schema<ILocationSnapshot>(
  {
    employeeId:          { type: Schema.Types.ObjectId, ref: 'User',              required: true },
    attendanceSessionId: { type: Schema.Types.ObjectId, ref: 'AttendanceSession', required: true },
    dateString:          { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    latitude:            { type: Number, required: true, min: -90,  max: 90  },
    longitude:           { type: Number, required: true, min: -180, max: 180 },
    accuracy:            { type: Number, required: true, min: 0 },
    capturedAt:          { type: Date,   required: true },
    source:              { type: String, required: true, enum: ['mobile'], default: 'mobile' },
    address:             { type: String, default: null },
    geocodingStatus:     { type: String },
    geocodingProvider:   { type: String, default: null },
  },
  { timestamps: true },
);

LocationSnapshotSchema.index({ employeeId: 1, capturedAt: -1 });
LocationSnapshotSchema.index({ attendanceSessionId: 1, capturedAt: -1 });
LocationSnapshotSchema.index({ dateString: 1, employeeId: 1 });

export const LocationSnapshot: Model<ILocationSnapshot> =
  (mongoose.models['LocationSnapshot'] as Model<ILocationSnapshot>) ??
  mongoose.model<ILocationSnapshot>('LocationSnapshot', LocationSnapshotSchema);
