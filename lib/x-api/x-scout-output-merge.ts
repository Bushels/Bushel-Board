import { X_SCOUT_SCHEMA_VERSION, type XScoutOutput, type XScoutSignal } from "@/lib/x-api/x-scout-contract";

function signalKey(signal: XScoutSignal): string {
  return [
    signal.source_url ?? "",
    signal.post_id ?? "",
    signal.handle.toLowerCase(),
    signal.posted_at,
    signal.primary_grain,
    signal.summary,
  ].join("|");
}

function windowKey(window: XScoutOutput["search_windows"][number]): string {
  return [window.label, window.from_date, window.to_date].join("|");
}

export function mergeXScoutOutputs(outputs: XScoutOutput[]): XScoutOutput {
  if (outputs.length === 0) {
    throw new Error("Cannot merge zero X scout outputs.");
  }

  const [first] = outputs;
  const searchWindows = new Map<string, XScoutOutput["search_windows"][number]>();
  const signals = new Map<string, XScoutSignal>();
  const noSignalNotes = new Set<string>();

  for (const output of outputs) {
    if (output.schema_version !== X_SCOUT_SCHEMA_VERSION) {
      throw new Error(`Unsupported X scout schema version: ${output.schema_version}`);
    }
    if (output.run_date !== first.run_date || output.mode !== first.mode) {
      throw new Error("Cannot merge X scout outputs from different run dates or modes.");
    }

    for (const window of output.search_windows) {
      searchWindows.set(windowKey(window), window);
    }
    for (const signal of output.signals) {
      signals.set(signalKey(signal), signal);
    }
    for (const note of output.no_signal_notes) {
      noSignalNotes.add(note);
    }
  }

  return {
    schema_version: X_SCOUT_SCHEMA_VERSION,
    run_date: first.run_date,
    mode: first.mode,
    search_windows: [...searchWindows.values()],
    signals: [...signals.values()],
    no_signal_notes: [...noSignalNotes],
  };
}
