export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { connectDB } = await import('./src/lib/db/connect');
    await connectDB();
  }
}
