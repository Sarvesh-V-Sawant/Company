import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './admin';

export async function sendFcmNotification(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<void> {
  const app = getFirebaseAdmin();
  await getMessaging(app).send({
    token,
    notification: { title, body },
    android: {
      notification: { channelId: 'high_importance_channel' },
    },
    ...(data ? { data } : {}),
  });
}
