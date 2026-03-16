#!/usr/bin/env npx tsx
/**
 * Mark a user account as excluded from shared AI/community influence.
 *
 * Usage:
 *   npm run set-ai-exclusion -- --email user@example.com
 *   npm run set-ai-exclusion -- --email user@example.com --enabled false
 *   npm run set-ai-exclusion -- --email user@example.com --refresh-current-ai
 *   npm run set-ai-exclusion -- --help
 *
 * Output:
 *   stdout  JSON result summary
 *   stderr  Diagnostics and help text
 *
 * Idempotent:
 *   Re-running with the same email/flag is safe.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";
import { getCurrentCropYear, getCurrentGrainWeek } from "../lib/utils/crop-year";

function loadEnvFile(filePath: string) {
  try {
    const content = readFileSync(filePath, "utf-8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;
      const key = trimmed.slice(0, eqIndex).trim();
      const value = trimmed.slice(eqIndex + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Ignore missing .env.local when vars are already present.
  }
}

function printHelp() {
  console.error(`
Set AI Exclusion Script

Usage:
  npm run set-ai-exclusion -- --email user@example.com
  npm run set-ai-exclusion -- --email user@example.com --enabled false
  npm run set-ai-exclusion -- --email user@example.com --refresh-current-ai
  npm run set-ai-exclusion -- --help

Flags:
  --email <value>              Email address to update (required)
  --enabled <true|false>       Set exclude_from_ai. Default: true
  --refresh-current-ai         Queue current-week intelligence regeneration
  --help                       Show this help

Environment variables (from .env.local):
  NEXT_PUBLIC_SUPABASE_URL      Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     Supabase service role key

Output:
  stdout  JSON summary
  stderr  Diagnostics
`);
}

function getArgValue(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  return index === -1 ? undefined : args[index + 1];
}

function parseBoolean(input: string | undefined, fallback: boolean): boolean {
  if (input == null) return fallback;
  const normalized = input.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  throw new Error(`Invalid boolean value: ${input}`);
}

async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const normalizedTarget = email.trim().toLowerCase();
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const users = data.users ?? [];
    const match = users.find(
      (user) => (user.email ?? "").trim().toLowerCase() === normalizedTarget
    );

    if (match) {
      return match.id;
    }

    if (users.length < perPage) {
      return null;
    }

    page += 1;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  loadEnvFile(resolve(__dirname, "../.env.local"));

  const email = getArgValue(args, "--email")?.trim().toLowerCase();
  const enabled = parseBoolean(getArgValue(args, "--enabled"), true);
  const refreshCurrentAi = args.includes("--refresh-current-ai");

  if (!email) {
    throw new Error("--email is required");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.error(`Looking up ${email}...`);
  const userId = await findUserIdByEmail(supabase, email);

  if (!userId) {
    throw new Error(`No auth user found for ${email}`);
  }

  console.error(`Updating profiles.exclude_from_ai for ${email}...`);
  const { data: updatedProfile, error: updateError } = await supabase
    .from("profiles")
    .update({
      exclude_from_ai: enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId)
    .select("id, role, exclude_from_ai")
    .single();

  if (updateError) {
    throw new Error(`Failed to update profile: ${updateError.message}`);
  }

  let refresh = {
    requested: refreshCurrentAi,
    enqueued: false,
    crop_year: null as string | null,
    grain_week: null as number | null,
    error: null as string | null,
  };

  if (refreshCurrentAi) {
    const cropYear = getCurrentCropYear();
    const grainWeek = getCurrentGrainWeek();
    refresh = {
      requested: true,
      enqueued: false,
      crop_year: cropYear,
      grain_week: grainWeek,
      error: null,
    };

    console.error(
      `Queueing generate-intelligence for ${cropYear} week ${grainWeek}...`
    );
    const { error: enqueueError } = await supabase.rpc(
      "enqueue_internal_function",
      {
        p_function_name: "generate-intelligence",
        p_body: {
          crop_year: cropYear,
          grain_week: grainWeek,
        },
      }
    );

    if (enqueueError) {
      refresh.error = enqueueError.message;
    } else {
      refresh.enqueued = true;
    }
  }

  process.stdout.write(
    `${JSON.stringify(
      {
        email,
        user_id: userId,
        exclude_from_ai: updatedProfile.exclude_from_ai,
        role: updatedProfile.role,
        refresh,
      },
      null,
      2
    )}\n`
  );
}

main().catch((error) => {
  console.error(String(error instanceof Error ? error.message : error));
  process.exit(1);
});
