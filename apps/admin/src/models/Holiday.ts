import mongoose, { Document, Model, Schema } from 'mongoose';

export type HolidayType = 'national' | 'regional' | 'company';

export interface IHoliday extends Document {
  date: Date;
  dateString: string;
  name: string;
  description?: string;
  type: HolidayType;
  year: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const HolidaySchema = new Schema<IHoliday>(
  {
    date:        { type: Date,   required: true },
    dateString:  { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    name:        { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 500 },
    type:        { type: String, enum: ['national', 'regional', 'company'], required: true },
    year:        { type: Number, required: true },
    createdBy:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

HolidaySchema.index({ dateString: 1 }, { unique: true });
HolidaySchema.index({ year: 1 });

export const Holiday: Model<IHoliday> =
  (mongoose.models['Holiday'] as Model<IHoliday>) ??
  mongoose.model<IHoliday>('Holiday', HolidaySchema);
