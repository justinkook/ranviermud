export interface WebSearchResult {
  url: string;
  title?: string;
  content?: string;
  score?: number;
}

export async function searchWeb(query: string, maxResults = 5): Promise<WebSearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) return [];

  const resp = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: 'basic',
      include_domains: undefined,
      max_results: Math.min(Math.max(maxResults, 1), 10),
    }),
  });

  if (!resp.ok) return [];
  const data = await resp.json() as { results?: Array<{ url: string; title?: string; content?: string; score?: number }> };
  return (data.results || []).map(r => ({ url: r.url, title: r.title, content: r.content, score: r.score }));
}


