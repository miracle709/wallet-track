import { runPipeline } from "./pipeline.js";

const { runId } = await runPipeline({ log: (msg) => console.log(`[refresh] ${msg}`) });
console.log(`Done. Run ${runId} complete - results are in the SQLite database.`);
