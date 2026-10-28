// Spanish, assembled from one dictionary per area of the app. Keys are the English texts,
// exactly as written in `t("…")` / `msg("…")`; values keep the same {placeholders}.
// A key belongs in ONE file: shared words live in common.ts and every area may use them.
import { AUTH } from "./auth";
import { COMMON } from "./common";
import { DRIVE } from "./drive";
import { FLEET } from "./fleet";
import { JOINTS } from "./joints";
import { LAYOUT } from "./layout";
import { LIVE } from "./live";
import { MEMORY } from "./memory";
import { SERVER } from "./server";
import { SETTINGS } from "./settings";

export const ES: Record<string, string> = {
  ...COMMON,
  ...LAYOUT,
  ...FLEET,
  ...LIVE,
  ...DRIVE,
  ...JOINTS,
  ...MEMORY,
  ...SETTINGS,
  ...AUTH,
  ...SERVER,
};
