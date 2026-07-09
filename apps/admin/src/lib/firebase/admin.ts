import { initializeApp, getApps, cert } from 'firebase-admin/app';

export function getFirebaseAdmin() {
  if (getApps().length > 0) return getApps()[0];

  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID!,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
      privateKey: (() => {
        let key = process.env.FIREBASE_PRIVATE_KEY ?? '';
        // Next.js dotenv converts \n escapes to real newlines inside double-quoted
        // values but does NOT strip the surrounding quotes themselves.
        if (key.startsWith('"')) key = key.slice(1);
        if (key.endsWith('"')) key = key.slice(0, -1);
        // Fallback for envs that store literal \n without outer quotes
        if (!key.includes('\n')) key = key.replace(/\\n/g, '\n');
        return key;
      })(),
    }),
  });
}
