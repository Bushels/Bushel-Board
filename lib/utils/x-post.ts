function normalizeAuthor(author: string | null | undefined): string {
  return (author ?? "").trim().replace(/^@+/, "");
}

function buildSearchQuery(
  postAuthor: string | null | undefined,
  postSummary: string
): string {
  const normalizedAuthor = normalizeAuthor(postAuthor);
  const summarySnippet = postSummary.trim().slice(0, 120);
  const rawQuery = normalizedAuthor
    ? `from:${normalizedAuthor} ${summarySnippet}`
    : summarySnippet;

  return rawQuery.trim();
}

export function buildXPostHref(
  postUrl: string | null | undefined,
  postAuthor: string | null | undefined,
  postSummary: string
): string | null {
  if (postUrl && /^https?:\/\//i.test(postUrl)) {
    return postUrl;
  }

  const query = buildSearchQuery(postAuthor, postSummary);
  if (!query) {
    return null;
  }

  return `https://x.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;
}
