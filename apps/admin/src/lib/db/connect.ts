import mongoose from 'mongoose';

declare global {
  // eslint-disable-next-line no-var
  var __mongoose_conn: typeof mongoose | undefined;
}

export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;

  if (global.__mongoose_conn) {
    await global.__mongoose_conn.connection.asPromise();
    return;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI is not defined');

  const conn = await mongoose.connect(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });

  global.__mongoose_conn = conn;
  console.error('[DB] Mongoose connected');
}
