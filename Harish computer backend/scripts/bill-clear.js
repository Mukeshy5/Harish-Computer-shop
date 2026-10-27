require("dotenv").config();
const mongoose = require("mongoose");
const store = require("../config/store");
const { listBills, runSweep, policy } = require("../services/bill-clear");

async function main() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
  await store.connect(process.env.MONGODB_URI);
  if (process.argv.includes("--execute")) {
    const config = policy();
    if (!config.enabled) throw new Error(config.reason);
    console.log(JSON.stringify(await runSweep()));
  } else {
    const plan = await listBills({ status: "eligible", limit: 100 });
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          serverTime: plan.serverTime,
          summary: plan.summary,
          eligibleBills: plan.data,
          morePages: plan.pages > 1,
          automation: plan.automation,
        },
        null,
        2,
      ),
    );
  }
}
main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
