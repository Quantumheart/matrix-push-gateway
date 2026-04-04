import express from "express";
import { config } from "./config.js";
import { router } from "./routes.js";

const app = express();

app.use(express.json());
app.use(router);

app.listen(config.port, () => {
  console.log(`[matrix-push-gateway] listening on :${config.port}`);
});
