import { describe, expect, it } from "vitest";
import vercelConfig from "@/vercel.json";

describe("place tracking cron schedule", () => {
  it("continues the time-bounded queue from 02 KST in seven two-hour windows", () => {
    const placeSchedules = vercelConfig.crons
      .filter((cron) => /^\/api\/cron\/place-tracking\/\d+$/.test(cron.path))
      .map((cron) => ({ path: cron.path, schedule: cron.schedule }));

    expect(placeSchedules).toEqual([
      { path: "/api/cron/place-tracking/1", schedule: "0 17 * * *" },
      { path: "/api/cron/place-tracking/2", schedule: "0 19 * * *" },
      { path: "/api/cron/place-tracking/3", schedule: "0 21 * * *" },
      { path: "/api/cron/place-tracking/4", schedule: "0 23 * * *" },
      { path: "/api/cron/place-tracking/5", schedule: "0 1 * * *" },
      { path: "/api/cron/place-tracking/6", schedule: "0 3 * * *" },
      { path: "/api/cron/place-tracking/7", schedule: "0 5 * * *" },
    ]);
  });
});
