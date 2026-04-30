type NullableNumber = number | null;

const REQUIRED_WEEKLY_FIELDS = [
  "country_stocks_kt",
  "country_capacity_pct",
  "terminal_stocks_kt",
  "terminal_capacity_pct",
  "country_stocks_mb_kt",
  "country_stocks_sk_kt",
  "country_stocks_ab_kt",
  "terminal_stocks_vancouver_kt",
  "terminal_stocks_prince_rupert_kt",
  "terminal_stocks_thunder_bay_kt",
  "terminal_stocks_churchill_kt",
  "country_deliveries_kt",
  "country_deliveries_yoy_pct",
  "vancouver_unloads_cars",
  "prince_rupert_unloads_cars",
  "thunder_bay_unloads_cars",
  "churchill_unloads_cars",
  "total_unloads_cars",
  "four_week_avg_unloads",
  "var_to_four_week_avg_pct",
  "ytd_unloads_cars",
  "out_of_car_time_pct",
  "out_of_car_time_vancouver_pct",
  "out_of_car_time_prince_rupert_pct",
  "ytd_shipments_vancouver_kt",
  "ytd_shipments_prince_rupert_kt",
  "ytd_shipments_thunder_bay_kt",
  "ytd_shipments_total_kt",
  "ytd_shipments_yoy_pct",
  "ytd_shipments_vs_3yr_avg_pct",
  "vessels_vancouver",
  "vessels_prince_rupert",
  "vessels_cleared_vancouver",
  "vessels_cleared_prince_rupert",
  "vessels_inbound_next_week",
  "vessel_avg_one_year_vancouver",
  "vessel_avg_one_year_prince_rupert",
  "weather_notes",
  "source_notes",
] as const;

export type WeeklyReportMetadata = {
  canonicalCropYear: string;
  reportCropYear: string;
  grainWeek: number;
  reportDate: string;
  coveredPeriod: string;
  coveredPeriodStart: string;
  coveredPeriodEnd: string;
  vesselAsOfDate: string | null;
  vesselWeek: number | null;
  inboundPeriod: string | null;
  inboundWeek: number | null;
};

export type ParsedWeeklyReportRow = {
  grain_week: number;
  report_date: string;
  country_stocks_kt: NullableNumber;
  country_capacity_pct: NullableNumber;
  terminal_stocks_kt: NullableNumber;
  terminal_capacity_pct: NullableNumber;
  country_stocks_mb_kt: NullableNumber;
  country_stocks_sk_kt: NullableNumber;
  country_stocks_ab_kt: NullableNumber;
  terminal_stocks_vancouver_kt: NullableNumber;
  terminal_stocks_prince_rupert_kt: NullableNumber;
  terminal_stocks_thunder_bay_kt: NullableNumber;
  terminal_stocks_churchill_kt: NullableNumber;
  country_deliveries_kt: NullableNumber;
  country_deliveries_yoy_pct: NullableNumber;
  vancouver_unloads_cars: number | null;
  prince_rupert_unloads_cars: number | null;
  thunder_bay_unloads_cars: number | null;
  churchill_unloads_cars: number | null;
  total_unloads_cars: number | null;
  four_week_avg_unloads: number | null;
  var_to_four_week_avg_pct: NullableNumber;
  ytd_unloads_cars: number | null;
  out_of_car_time_pct: NullableNumber;
  out_of_car_time_vancouver_pct: NullableNumber;
  out_of_car_time_prince_rupert_pct: NullableNumber;
  ytd_shipments_vancouver_kt: NullableNumber;
  ytd_shipments_prince_rupert_kt: NullableNumber;
  ytd_shipments_thunder_bay_kt: NullableNumber;
  ytd_shipments_total_kt: NullableNumber;
  ytd_shipments_yoy_pct: NullableNumber;
  ytd_shipments_vs_3yr_avg_pct: NullableNumber;
  vessels_vancouver: number | null;
  vessels_prince_rupert: number | null;
  vessels_cleared_vancouver: number | null;
  vessels_cleared_prince_rupert: number | null;
  vessels_inbound_next_week: number | null;
  vessel_avg_one_year_vancouver: number | null;
  vessel_avg_one_year_prince_rupert: number | null;
  weather_notes: string | null;
};

export type ParseResult = {
  metadata: WeeklyReportMetadata;
  row: ParsedWeeklyReportRow;
  missingFields: string[];
  weatherBullet: string | null;
  vesselTimingNote: string | null;
};

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

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeCropYearInput(input: string): string {
  const trimmed = input.trim();
  const longMatch = trimmed.match(/^(\d{4})-(\d{4})$/);
  if (longMatch) {
    const startYear = Number.parseInt(longMatch[1], 10);
    const endYear = Number.parseInt(longMatch[2], 10);
    if (endYear !== startYear + 1) {
      throw new Error(`Invalid crop year: ${input}`);
    }
    return `${startYear}-${endYear}`;
  }

  const shortMatch = trimmed.match(/^(\d{4})-(\d{2})$/);
  if (shortMatch) {
    const startYear = Number.parseInt(shortMatch[1], 10);
    const endSuffix = Number.parseInt(shortMatch[2], 10);
    const expectedSuffix = (startYear + 1) % 100;
    if (endSuffix !== expectedSuffix) {
      throw new Error(`Invalid crop year: ${input}`);
    }
    return `${startYear}-${startYear + 1}`;
  }

  throw new Error(`Invalid crop year format: ${input}`);
}

export function getCapacityLabelCropYear(cropYear: string): string {
  const [startYear, endYear] = cropYear.split("-");
  return `${startYear.slice(-2)}-${endYear.slice(-2)}`;
}

export function parseLongDate(dateText: string): string {
  const match = dateText.match(/^([A-Za-z]+) (\d{1,2}), (\d{4})$/);
  if (!match) {
    throw new Error(`Could not parse date: ${dateText}`);
  }

  const monthMap: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
  };
  const monthIndex = monthMap[match[1].toLowerCase()];
  if (monthIndex == null) {
    throw new Error(`Could not parse date month: ${dateText}`);
  }

  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCoveredPeriod(periodText: string): { start: string; end: string } {
  const [startText, endText] = periodText.split(" to ");
  if (!startText || !endText) {
    throw new Error(`Could not parse covered period: ${periodText}`);
  }
  return {
    start: parseLongDate(startText.trim()),
    end: parseLongDate(endText.trim()),
  };
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

export function getOccurrenceIndex(haystack: string, pattern: string | RegExp, occurrence: number): number {
  if (typeof pattern === "string") {
    let searchFrom = 0;
    let index = -1;
    for (let i = 0; i < occurrence; i += 1) {
      index = haystack.indexOf(pattern, searchFrom);
      if (index < 0) {
        return -1;
      }
      searchFrom = index + pattern.length;
    }
    return index;
  }

  const globalPattern = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  let match: RegExpExecArray | null = null;
  for (let i = 0; i < occurrence; i += 1) {
    match = globalPattern.exec(haystack);
    if (!match) {
      return -1;
    }
  }
  return match?.index ?? -1;
}

export function getMatchLength(haystack: string, pattern: string | RegExp, startIndex: number): number {
  if (typeof pattern === "string") {
    return pattern.length;
  }

  const slice = haystack.slice(startIndex);
  const match = slice.match(pattern);
  if (!match || match.index !== 0) {
    throw new Error(`Pattern did not match at expected position: ${pattern}`);
  }
  return match[0].length;
}

export function takeTokensAfter(
  haystack: string,
  pattern: string | RegExp,
  count: number,
  occurrence = 1,
): string[] {
  const startIndex = getOccurrenceIndex(haystack, pattern, occurrence);
  if (startIndex < 0) {
    throw new Error(`Could not find pattern: ${String(pattern)} (occurrence ${occurrence})`);
  }

  const matchLength = getMatchLength(haystack, pattern, startIndex);
  return haystack
    .slice(startIndex + matchLength)
    .trim()
    .split(/\s+/)
    .slice(0, count);
}

export function extractBullets(pageText: string): string[] {
  return [...pageText.matchAll(/\u2022\s*([\s\S]*?)(?=(?:\n\u2022\s)|(?:\n\d+\. )|(?:-- \d+ of \d+ --)|$)/g)]
    .map((match) => normalizeText(match[1]).replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function parsePageMetadata(page1Text: string): WeeklyReportMetadata {
  const flatPage1 = flattenText(page1Text);
  const metadataMatch = flatPage1.match(
    /Weekly Performance Update ([A-Za-z]+ \d{1,2}, \d{4}) For Grain Week (\d+) (\d{4}-\d{2}) CY ([A-Za-z]+ \d{1,2}, \d{4} to [A-Za-z]+ \d{1,2}, \d{4})/i,
  );
  if (!metadataMatch) {
    throw new Error("Could not parse weekly report metadata from page 1");
  }

  const reportDate = parseLongDate(metadataMatch[1]);
  const grainWeek = Number.parseInt(metadataMatch[2], 10);
  const canonicalCropYear = normalizeCropYearInput(metadataMatch[3]);
  const coveredPeriod = metadataMatch[4];
  const { start, end } = parseCoveredPeriod(coveredPeriod);

  const vesselAsOfMatch = flatPage1.match(/5\. Vessels as at ([A-Za-z]+ \d{1,2}, \d{4})/i);
  const vesselWeekMatch = flatPage1.match(/Vancouver vessel lineup for Week (\d+)/i);
  const inboundMatch = flatPage1.match(
    /Vessels Inbound ([A-Za-z]+(?:\s[A-Za-z]+)? \d{1,2}, \d{4} to [A-Za-z]+(?:\s[A-Za-z]+)? \d{1,2}, \d{4}) \(Week (\d+)\)/i,
  );

  return {
    canonicalCropYear,
    reportCropYear: metadataMatch[3],
    grainWeek,
    reportDate,
    coveredPeriod,
    coveredPeriodStart: start,
    coveredPeriodEnd: end,
    vesselAsOfDate: vesselAsOfMatch ? parseLongDate(vesselAsOfMatch[1]) : null,
    vesselWeek: vesselWeekMatch ? Number.parseInt(vesselWeekMatch[1], 10) : null,
    inboundPeriod: inboundMatch?.[1] ?? null,
    inboundWeek: inboundMatch ? Number.parseInt(inboundMatch[2], 10) : null,
  };
}

export function parseStocks(page2Text: string, metadata: WeeklyReportMetadata) {
  const page2Flat = flattenText(page2Text);
  const reportCropYear = metadata.reportCropYear;
  const capacityCropYear = getCapacityLabelCropYear(metadata.canonicalCropYear);

  const countryStocksTokens = takeTokensAfter(
    page2Flat,
    new RegExp(`MB SK AB BC Total ${escapeRegExp(reportCropYear)}`, "i"),
    5,
  );
  const countryCapacityTokens = takeTokensAfter(
    page2Flat,
    new RegExp(`${escapeRegExp(capacityCropYear)} % of Wkg Cap`, "i"),
    5,
    1,
  );

  const terminalStocksTokens = takeTokensAfter(
    page2Flat,
    new RegExp(`VC PR West Coast CH TB Total ${escapeRegExp(reportCropYear)}`, "i"),
    6,
  );
  const terminalCapacityTokens = takeTokensAfter(
    page2Flat,
    new RegExp(`${escapeRegExp(capacityCropYear)} % of Wkg Cap`, "i"),
    6,
    2,
  );

  return {
    country_stocks_mb_kt: parseNumericToken(countryStocksTokens[0]),
    country_stocks_sk_kt: parseNumericToken(countryStocksTokens[1]),
    country_stocks_ab_kt: parseNumericToken(countryStocksTokens[2]),
    country_stocks_kt: parseNumericToken(countryStocksTokens[4]),
    country_capacity_pct: parseNumericToken(countryCapacityTokens[4]),
    terminal_stocks_vancouver_kt: parseNumericToken(terminalStocksTokens[0], { dashAsZero: true }),
    terminal_stocks_prince_rupert_kt: parseNumericToken(terminalStocksTokens[1], { dashAsZero: true }),
    terminal_stocks_churchill_kt: parseNumericToken(terminalStocksTokens[3], { dashAsZero: true }),
    terminal_stocks_thunder_bay_kt: parseNumericToken(terminalStocksTokens[4], { dashAsZero: true }),
    terminal_stocks_kt: parseNumericToken(terminalStocksTokens[5], { dashAsZero: true }),
    terminal_capacity_pct: parseNumericToken(terminalCapacityTokens[5]),
  };
}

export function parseCountryDeliveriesAndPortPerformance(page1Text: string, page3Text: string) {
  const page1Flat = flattenText(page1Text);
  const page3Flat = flattenText(page3Text);

  const deliveryTokens = takeTokensAfter(page3Flat, /MB SK AB BC Total 2025-\d{2}/i, 5);
  const deliveryYoyTokens = takeTokensAfter(page3Flat, /Var % to Last Year/i, 5, 1);

  const unloadTokens = takeTokensAfter(
    page3Flat,
    /Vancouver Prince Rupert West Coast Thunder Bay Churchill Total 2025-\d{2}/i,
    6,
  );
  const fourWeekAverageTokens = takeTokensAfter(page3Flat, /4-Wk Avg\./i, 6, 1);
  const varToFourWeekAverageTokens = takeTokensAfter(page3Flat, /Var % to 4-Wk Avg\./i, 6, 1);
  const ytdUnloadTokens = takeTokensAfter(
    page3Flat,
    /YTD Unloads \(cars\) Vancouver Prince Rupert West Coast Thunder Bay Churchill Total 2025-\d{2}/i,
    6,
  );

  const octBulletMatch = page1Flat.match(
    /The total average terminal out-of-car time \(OCT\).*?to ([\d.]+)% from ([\d.]+)% the previous week\. The OCT for Week \d+ was ([\d.]+)% at Vancouver, ([\d.]+)% at Prince Rupert, and ([\d.]+)% at Thunder Bay\./i,
  );

  if (!octBulletMatch) {
    throw new Error("Could not parse OCT metrics from page 1 summary bullets");
  }

  return {
    country_deliveries_kt: parseNumericToken(deliveryTokens[4]),
    country_deliveries_yoy_pct: parseNumericToken(deliveryYoyTokens[4]),
    vancouver_unloads_cars: parseNumericToken(unloadTokens[0], { integer: true, dashAsZero: true }),
    prince_rupert_unloads_cars: parseNumericToken(unloadTokens[1], { integer: true, dashAsZero: true }),
    thunder_bay_unloads_cars: parseNumericToken(unloadTokens[3], { integer: true, dashAsZero: true }),
    churchill_unloads_cars: parseNumericToken(unloadTokens[4], { integer: true, dashAsZero: true }),
    total_unloads_cars: parseNumericToken(unloadTokens[5], { integer: true, dashAsZero: true }),
    four_week_avg_unloads: parseNumericToken(fourWeekAverageTokens[5], { integer: true, dashAsZero: true }),
    var_to_four_week_avg_pct: parseNumericToken(varToFourWeekAverageTokens[5]),
    ytd_unloads_cars: parseNumericToken(ytdUnloadTokens[5], { integer: true, dashAsZero: true }),
    out_of_car_time_pct: parseNumericToken(octBulletMatch[1]),
    out_of_car_time_vancouver_pct: parseNumericToken(octBulletMatch[3]),
    out_of_car_time_prince_rupert_pct: parseNumericToken(octBulletMatch[4]),
  };
}

export function parseShipments(page5Text: string) {
  const page5Flat = flattenText(page5Text);

  const shipmentTokens = takeTokensAfter(
    page5Flat,
    /Vancouver Prince Rupert West Coast Thunder Bay Churchill Total 2025-\d{2}/i,
    6,
  );
  const shipmentYoyTokens = takeTokensAfter(page5Flat, /Var % to Last Year/i, 6, 2);
  const shipmentThreeYearTokens = takeTokensAfter(page5Flat, /Var % to 3-Yr Avg\.?/i, 6, 2);

  return {
    ytd_shipments_vancouver_kt: parseNumericToken(shipmentTokens[0], { dashAsZero: true }),
    ytd_shipments_prince_rupert_kt: parseNumericToken(shipmentTokens[1], { dashAsZero: true }),
    ytd_shipments_thunder_bay_kt: parseNumericToken(shipmentTokens[3], { dashAsZero: true }),
    ytd_shipments_total_kt: parseNumericToken(shipmentTokens[5], { dashAsZero: true }),
    ytd_shipments_yoy_pct: parseNumericToken(shipmentYoyTokens[5]),
    ytd_shipments_vs_3yr_avg_pct: parseNumericToken(shipmentThreeYearTokens[5]),
  };
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

export function parseWeeklyReportFromPages(pageTexts: Record<number, string>): ParseResult {
  const page1Text = normalizeText(pageTexts[1] ?? "");
  const page2Text = normalizeText(pageTexts[2] ?? "");
  const page3Text = normalizeText(pageTexts[3] ?? "");
  const page5Text = normalizeText(pageTexts[5] ?? "");

  if (!page1Text || !page2Text || !page3Text || !page5Text) {
    throw new Error("Missing one or more required PDF pages for parsing (expected pages 1, 2, 3, and 5)");
  }

  const metadata = parsePageMetadata(page1Text);
  const stocks = parseStocks(page2Text, metadata);
  const deliveriesAndPerformance = parseCountryDeliveriesAndPortPerformance(page1Text, page3Text);
  const shipments = parseShipments(page5Text);
  const vesselsAndWeather = parseVesselsAndWeather(page1Text, page5Text);

  const row = {
    grain_week: metadata.grainWeek,
    report_date: metadata.reportDate,
    ...stocks,
    ...deliveriesAndPerformance,
    ...shipments,
    vessels_vancouver: vesselsAndWeather.vessels_vancouver,
    vessels_prince_rupert: vesselsAndWeather.vessels_prince_rupert,
    vessels_cleared_vancouver: vesselsAndWeather.vessels_cleared_vancouver,
    vessels_cleared_prince_rupert: vesselsAndWeather.vessels_cleared_prince_rupert,
    vessels_inbound_next_week: vesselsAndWeather.vessels_inbound_next_week,
    vessel_avg_one_year_vancouver: vesselsAndWeather.vessel_avg_one_year_vancouver,
    vessel_avg_one_year_prince_rupert: vesselsAndWeather.vessel_avg_one_year_prince_rupert,
    weather_notes: vesselsAndWeather.weather_notes,
  };

  const missingFields = REQUIRED_WEEKLY_FIELDS
    .filter((field) => field !== "source_notes")
    .filter((field) => row[field as keyof typeof row] == null);

  return {
    metadata,
    row,
    missingFields,
    weatherBullet: vesselsAndWeather.weather_notes,
    vesselTimingNote: vesselsAndWeather.vesselTimingNote,
  };
}
