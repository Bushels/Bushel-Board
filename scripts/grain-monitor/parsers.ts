export function normalizeText(text: string): string {
  return text
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();
}

export function flattenText(text: string): string {
  return normalizeText(text)
    .replace(/\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseNumericToken(
  token: string,
  options: { integer?: boolean; dashAsZero?: boolean } = {},
): number | null {
  const normalized = token.trim();
  if (!normalized || /^n\/a$/i.test(normalized)) {
    return null;
  }

  if ((normalized === "-" || normalized === "--") && options.dashAsZero) {
    return 0;
  }

  const cleaned = normalized.replace(/,/g, "").replace(/%$/, "");
  if (!cleaned) {
    return null;
  }

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    return null;
  }

  return options.integer ? Math.round(value) : value;
}

export function extractBullets(pageText: string): string[] {
  return [...pageText.matchAll(/\u2022\s*([\s\S]*?)(?=(?:\n\u2022\s)|(?:\n\d+\. )|(?:-- \d+ of \d+ --)|$)/g)]
    .map((match) => normalizeText(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parseVesselsAndWeather(page1Text: string, page5Text: string) {
  const page1Flat = flattenText(page1Text);
  const page5Flat = flattenText(page5Text);
  const bullets = extractBullets(page1Text);

  const vancouverLineupBullet = bullets.find((bullet) => bullet.startsWith("Vancouver vessel lineup"));
  const princeRupertLineupBullet = bullets.find((bullet) => bullet.startsWith("Prince Rupert vessel lineup"));
  const clearedBullet = bullets.find((bullet) => bullet.startsWith("Vessels cleared from Vancouver"));
  const weatherBullet = bullets.find((bullet) => bullet.startsWith("Temperatures across the prairies")) ?? null;

  if (!vancouverLineupBullet || !princeRupertLineupBullet || !clearedBullet) {
    throw new Error("Could not parse vessel bullets from page 1 summary");
  }

  const vancouverLineupMatch = vancouverLineupBullet.match(
    /Vancouver vessel lineup for Week (\d+) .*? to (\d+) vessels? \(The current one-year average at Vancouver is (\d+) vessels\)/i,
  );
  const princeRupertLineupMatch = princeRupertLineupBullet.match(
    /Prince Rupert vessel lineup for Week (\d+) .*? to (\d+) vessels? \(The current one-year average at Prince Rupert is (\d+) vessels\)/i,
  );
  const clearedMatch = clearedBullet.match(
    /Vessels cleared from Vancouver (?:was|were) (\d+) and from Prince Rupert (?:was|were) (\d+) in Week (\d+)/i,
  );
  const inboundMatch = page1Flat.match(
    /Vessels Inbound [A-Za-z]+(?:\s[A-Za-z]+)? \d{1,2}, \d{4} to [A-Za-z]+(?:\s[A-Za-z]+)? \d{1,2}, \d{4} \(Week \d+\) (\d+) (\d+)/i,
  );

  if (!vancouverLineupMatch || !princeRupertLineupMatch || !clearedMatch || !inboundMatch) {
    throw new Error("Could not parse vessel lineup, cleared, or inbound metrics");
  }

  const vesselTimingNoteMatch = page5Flat.match(
    /Note: The 'Time in Port' measure for 5-A and 5-C is calculated as how long each vessel in the lineup has been in port as at Sunday 23:59 of that grain week\. The 'Avg Time in Port \(TIP\)' measure for 5-B and 5-D is the average number of days that all vessels which cleared that week were in port\./i,
  );

  return {
    vessels_vancouver: parseNumericToken(vancouverLineupMatch[2], { integer: true }),
    vessels_prince_rupert: parseNumericToken(princeRupertLineupMatch[2], { integer: true }),
    vessels_cleared_vancouver: parseNumericToken(clearedMatch[1], { integer: true }),
    vessels_cleared_prince_rupert: parseNumericToken(clearedMatch[2], { integer: true }),
    vessels_inbound_next_week:
      (parseNumericToken(inboundMatch[1], { integer: true, dashAsZero: true }) ?? 0) +
      (parseNumericToken(inboundMatch[2], { integer: true, dashAsZero: true }) ?? 0),
    vessel_avg_one_year_vancouver: parseNumericToken(vancouverLineupMatch[3], { integer: true }),
    vessel_avg_one_year_prince_rupert: parseNumericToken(princeRupertLineupMatch[3], { integer: true }),
    weather_notes: weatherBullet,
    vesselTimingNote: vesselTimingNoteMatch ? normalizeText(vesselTimingNoteMatch[0]).replace(/\s+/g, " ").trim() : null,
  };
}
