export async function register() {
  if (
    process.env.NEXT_RUNTIME !== "nodejs" ||
    process.env.NEXT_PHASE === "phase-production-build"
  ) {
    return;
  }

  const { startTelegramPollingLoop } = await import(
    "@/features/telegram/telegram.polling-loop"
  );
  startTelegramPollingLoop();
}
