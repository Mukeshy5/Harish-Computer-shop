require("dotenv").config();
const mongoose = require("mongoose");
const store = require("../config/store");
const models = require("../models");
// Run only after converting the server to a replica set and stopping the API.
async function main() {
  await store.connect(process.env.MONGODB_URI);
  if (store.mode !== "transactions")
    throw new Error("Convert MongoDB to a replica set first");
  const aggregate = await store.Aggregate.findById("shop").lean();
  if (!aggregate) throw new Error("Standalone ledger not found");
  await mongoose.connection.transaction(async (session) => {
    for (const [name, rows] of Object.entries(aggregate.data)) {
      if (await models[name].countDocuments().session(session))
        throw new Error(`${name} is not empty. Migration refused.`);
      if (rows.length) await models[name].insertMany(rows, { session });
    }
  });
  console.log(
    "Migration complete. Retained standalone ledger is your recovery copy.",
  );
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
