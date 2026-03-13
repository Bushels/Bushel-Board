export type AuthScene = "day" | "evening";

export interface AuthSceneContent {
  badge: string;
  title: string;
  description: string;
  proofPoints: [string, string, string];
}

const PRAIRIE_TIME_ZONE = "America/Edmonton";

const AUTH_SCENE_CONTENT: Record<AuthScene, AuthSceneContent> = {
  day: {
    badge: "Prairie daylight",
    title: "Set up your farm while the market is moving.",
    description:
      "A brighter onboarding surface for daytime signups, with clear next steps into My Farm and grain unlocks.",
    proofPoints: [
      "Weekly CGC refreshes",
      "Role-aware dashboard home",
      "Crop-based grain unlocks",
    ],
  },
  evening: {
    badge: "Prairie evening",
    title: "Catch up after the field day winds down.",
    description:
      "A calmer twilight variant for after-hours signups when the work is done and the planning starts.",
    proofPoints: [
      "After-hours farm setup",
      "Same AI and dashboard access",
      "No public-page bounce back",
    ],
  },
};

export function getPrairieHour(date: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-CA", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: PRAIRIE_TIME_ZONE,
    }).format(date)
  );
}

export function getPrairieAuthScene(date: Date = new Date()): AuthScene {
  const hour = getPrairieHour(date);
  return hour >= 6 && hour < 18 ? "day" : "evening";
}

export function getAuthSceneContent(scene: AuthScene): AuthSceneContent {
  return AUTH_SCENE_CONTENT[scene];
}
