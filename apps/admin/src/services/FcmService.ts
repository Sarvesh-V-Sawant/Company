import mongoose from 'mongoose';
import { connectDB } from '@lib/db/connect';
import { sendFcmNotification } from '@lib/firebase/fcm';
import { FcmToken } from '@models/FcmToken';

export class FcmService {
  static async sendToEmployee(
    employeeId: mongoose.Types.ObjectId,
    title: string,
    body: string,
  ): Promise<void> {
    await connectDB();

    const tokens = await FcmToken.find({ employeeId, isActive: true })
      .lean() as unknown as Array<{ _id: mongoose.Types.ObjectId; token: string }>;

    if (tokens.length === 0) return;

    await Promise.allSettled(
      tokens.map(async (tokenDoc) => {
        try {
          await sendFcmNotification(tokenDoc.token, title, body);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (
            msg.includes('registration-token-not-registered') ||
            msg.includes('invalid-registration-token')
          ) {
            await FcmToken.updateOne(
              { _id: tokenDoc._id },
              { $set: { isActive: false } },
            );
          }
          // Swallow — push failure must not bubble up
        }
      }),
    );
  }
}
