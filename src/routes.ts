import { Router, type Request, type Response } from "express";
import { NotifyRequestSchema } from "./schema.js";
import { sendNotification } from "./push.js";

export const router = Router();

// ── POST /_matrix/push/v1/notify ────────────────────────────────────

router.post("/_matrix/push/v1/notify", async (req: Request, res: Response) => {
  const parsed = NotifyRequestSchema.safeParse(req.body);

  if (!parsed.success) {
    res.status(400).json({
      errcode: "M_BAD_JSON",
      error: parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; "),
    });
    return;
  }

  const { notification } = parsed.data;

  try {
    const rejected = await sendNotification(notification);
    res.status(200).json({ rejected });
  } catch (err) {
    console.error("[notify] unexpected error:", err);
    res.status(500).json({
      errcode: "M_UNKNOWN",
      error: "Internal server error while sending push",
    });
  }
});

// ── Catch-all: unsupported endpoints (spec §API standards) ──────────

router.all("/_matrix/*", (req: Request, res: Response) => {
  const code = req.method === "POST" || req.method === "GET" ? 404 : 405;
  res.status(code).json({
    errcode: "M_UNRECOGNIZED",
    error: "Unrecognized request",
  });
});
