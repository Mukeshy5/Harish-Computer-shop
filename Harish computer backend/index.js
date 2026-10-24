require("dotenv").config();
const store = require("./config/store");
async function start() {
  if (!process.env.MONGODB_URI)
    throw new Error("MONGODB_URI is required. See .env.example.");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 random characters.");
  const mode = await store.connect(process.env.MONGODB_URI);
  const server = require("./app").listen(Number(process.env.PORT) || 4000, () =>
    console.log(
      `Harish Computer Shop API listening on ${process.env.PORT || 4000} (${mode})`,
    ),
  );
  for (const signal of ["SIGTERM", "SIGINT"])
    process.on(signal, () =>
      server.close(async () => {
        await require("mongoose").disconnect();
        process.exit(0);
      }),
    );
}
start().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
