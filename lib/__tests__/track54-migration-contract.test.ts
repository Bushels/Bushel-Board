import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migration(name: string): string {
  return readFileSync(resolve(process.cwd(), "supabase", "migrations", name), "utf-8");
}

describe("Track 54 migration contract", () => {
  it("keeps x_scout_runs public-read and service-role-write only", () => {
    const sql = migration("20260601041000_create_x_scout_runs.sql");

    expect(sql).toContain("create table if not exists public.x_scout_runs");
    expect(sql).toContain("alter table public.x_scout_runs enable row level security");
    expect(sql).toContain("create policy x_scout_runs_public_read");
    expect(sql).toContain("for select");
    expect(sql).toContain("to anon, authenticated");
    expect(sql).toContain("create policy x_scout_runs_service_role_write");
    expect(sql).toContain("for all");
    expect(sql).toContain("to service_role");
    expect(sql).toContain("grant select on public.x_scout_runs to anon, authenticated");
    expect(sql).toContain("grant all on public.x_scout_runs to service_role");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete|all)\s+on\s+public\.x_scout_runs\s+to\s+(anon|authenticated)/i);
  });

  it("adds accepted X signal provenance and evidence-seal fields", () => {
    const sql = migration("20260601041100_extend_x_market_signal_metadata.sql");

    expect(sql).toContain("add column if not exists scout_run_id uuid references public.x_scout_runs(id)");
    expect(sql).toContain("add column if not exists source_cred_tier text");
    expect(sql).toContain("add column if not exists affected_grains text[] not null default '{}'");
    expect(sql).toContain("add column if not exists affected_regions text[] not null default '{}'");
    expect(sql).toContain("add column if not exists affected_decisions text[] not null default '{}'");
    expect(sql).toContain("add column if not exists signal_metadata jsonb not null default '{}'::jsonb");
    expect(sql).toContain("add column if not exists signal_hash text");
    expect(sql).toContain("idx_x_market_signals_scout_run");
    expect(sql).toContain("idx_x_market_signals_signal_metadata_gin");
    expect(sql).toContain("idx_x_market_signals_affected_grains_gin");
  });

  it("keeps signal_hash upsertable with a full unique index", () => {
    const sql = migration("20260601052000_make_x_signal_hash_upsertable.sql");

    expect(sql).toContain("drop index if exists public.idx_x_market_signals_signal_hash");
    expect(sql).toContain("create unique index if not exists idx_x_market_signals_signal_hash");
    expect(sql).toContain("on public.x_market_signals(signal_hash)");
    expect(sql).not.toMatch(/where\s+signal_hash\s+is\s+not\s+null/i);
  });

  it("admits only bounded daily pulse as the new trajectory scan type", () => {
    const sql = migration("20260601041200_allow_daily_pulse_soft_review.sql");

    expect(sql).toContain("'opus_review_daily_pulse'");
    expect(sql).toContain("Friday weekly_debate remains thesis-of-record");
    expect(sql).not.toContain("'grok_review'");
    expect(sql).not.toContain("'x_scout'");
    expect(sql).not.toContain("'grok_thesis'");
  });
});
