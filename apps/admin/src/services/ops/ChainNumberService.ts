import { connectDB } from '@lib/db/connect';
import { Counter } from '@models/ops/Counter';
import { toZonedTime } from 'date-fns-tz';

function getFiscalYear(date: Date): string {
  const ist = toZonedTime(date, 'Asia/Kolkata');
  const year = ist.getFullYear();
  const month = ist.getMonth() + 1; // 1-indexed
  // Indian fiscal year: April (4) – March (3)
  const fyStart = month >= 4 ? year : year - 1;
  const fyEnd = fyStart + 1;
  return `${String(fyStart).slice(-2)}-${String(fyEnd).slice(-2)}`; // e.g. "25-26"
}

export async function generateChainNumber(): Promise<string> {
  await connectDB();
  const fy = getFiscalYear(new Date());
  const counterKey = `chain:${fy}`;

  const doc = await Counter.findOneAndUpdate(
    { key: counterKey },
    { $inc: { seq: 1 } },
    { new: true, upsert: true },
  ).lean<{ seq: number }>();

  const seq = String(doc!.seq).padStart(5, '0');
  return `GEN/${fy}/${seq}`;
}
