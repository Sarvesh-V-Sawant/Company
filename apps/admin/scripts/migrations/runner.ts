import '../bootstrap-env';
const command = process.argv[2] ?? 'up';

export async function main(cmd: string): Promise<void> {
  console.log(`[migrations] runner invoked with command: ${cmd}`);
  console.log('[migrations] No migrations registered yet. Exiting.');
}

main(command).catch((err) => {
  console.error('[migrations] Error:', err);
  process.exit(1);
});
