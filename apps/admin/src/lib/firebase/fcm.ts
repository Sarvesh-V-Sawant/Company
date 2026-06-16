import { getMessaging } from 'firebase-admin/messaging';
import { getFirebaseAdmin } from './admin';

export async function sendFcmNotification(token: string, title: string, body: string): Promise<void> {
  getFirebaseAdmin();
  await getMessaging().send({ token, notification: { title, body } });
}
