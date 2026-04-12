import express from "express";
import { config } from "./config.js";
import { router } from "./routes.js";
import { shutdownApns } from "./apns.js";

const app = express();

app.use(express.json());
app.use(router);

const server = app.listen(config.port, () => {
  console.log(`[matrix-push-gateway] listening on :${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`[matrix-push-gateway] received ${signal}, shutting down`);
  shutdownApns();
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
