export interface FarmSummaryBlock {
  type: "paragraph" | "bullet";
  text: string;
}

export interface FarmSummarySection {
  title?: string;
  blocks: FarmSummaryBlock[];
}

export interface FarmSummarySource {
  label: string;
  url?: string;
}

export interface ParsedFarmSummary {
  metaTitle?: string;
  sections: FarmSummarySection[];
  sources: FarmSummarySource[];
}

const INLINE_CITATION_REGEX = /\[\[(\d+)\]\]\((https?:\/\/[^\s)]+)\)/g;
const HEADING_REGEX = /^#{1,6}\s+(.*)$/;
const BULLET_REGEX = /^[-*•]\s+(.*)$/;
const ORDERED_ITEM_REGEX = /^\d+\.\s+(.*)$/;

export function parseFarmSummary(summaryText: string): ParsedFarmSummary {
  const parts = summaryText.split(/\n*Sources?:\n*/i);
  const rawNarrative = parts[0]?.trim() ?? "";
  const rawSources = parts[1]?.trim();

  const inlineUrls = collectInlineUrls(rawNarrative);
  const normalizedNarrative = normalizeLegacyNarrative(
    rawNarrative.replace(INLINE_CITATION_REGEX, "")
  );
  const sections = parseSections(normalizedNarrative);
  const sources = parseSources(rawSources, inlineUrls);

  let metaTitle: string | undefined;
  if (sections[0]?.title && sections[0].blocks.length === 0) {
    metaTitle = sections.shift()?.title;
  }

  return { metaTitle, sections, sources };
}

function collectInlineUrls(text: string): string[] {
  const urls: string[] = [];
  const regex = new RegExp(INLINE_CITATION_REGEX);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (!urls.includes(match[2])) {
      urls.push(match[2]);
    }
  }

  return urls;
}

function normalizeLegacyNarrative(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/^\s*\*\*([^*\n]{2,140})\*\*\s*/u, "## $1\n\n")
    .replace(/\s+\*\*([^*\n:]{2,80}):\*\*\s*/gu, "\n\n## $1\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseSections(text: string): FarmSummarySection[] {
  if (!text) {
    return [];
  }

  const sections: FarmSummarySection[] = [];
  let currentSection: FarmSummarySection | undefined;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const headingMatch = line.match(HEADING_REGEX);
    if (headingMatch) {
      currentSection = {
        title: cleanText(headingMatch[1]),
        blocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    const bulletMatch = line.match(BULLET_REGEX) ?? line.match(ORDERED_ITEM_REGEX);
    const nextBlock: FarmSummaryBlock = {
      type: bulletMatch ? "bullet" : "paragraph",
      text: cleanText(bulletMatch?.[1] ?? line),
    };

    if (!nextBlock.text) {
      continue;
    }

    if (!currentSection) {
      currentSection = { blocks: [] };
      sections.push(currentSection);
    }

    currentSection.blocks.push(nextBlock);
  }

  return sections;
}

function parseSources(rawSources: string | undefined, inlineUrls: string[]): FarmSummarySource[] {
  const sourceLines = rawSources
    ? rawSources.split("\n").map((line) => line.trim()).filter(Boolean)
    : inlineUrls.map((url, index) => `[${index + 1}] ${url}`);

  const sources: FarmSummarySource[] = [];

  for (const rawLine of sourceLines) {
    const label = cleanSourceLabel(rawLine);
    if (!label || label === "[]") {
      continue;
    }

    const url = label.match(/https?:\/\/[^\s)]+/)?.[0];
    const dedupeKey = url ?? label;

    if (sources.some((source) => (source.url ?? source.label) === dedupeKey)) {
      continue;
    }

    sources.push({
      label,
      url,
    });
  }

  return sources;
}

function cleanSourceLabel(text: string): string {
  return cleanText(text.replace(/^[-*•]\s*/, ""));
}

function cleanText(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/__(.*?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .trim();
}
