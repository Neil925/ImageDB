import { startWorker } from "@/worker/handlers";

startWorker().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
