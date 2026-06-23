export const meta = {
  id: "clay",
  name: "Clay",
  type: "enrich",
  description: "Clay enrichment — contacts, firmographics, intent signals. Falls back to Exa-powered enrichment when no Clay key is set.",
  // envKey is not enforced at the runner level because the Exa fallback provides
  // real enrichment without a Clay key. Key presence is checked at runtime inside run().
  envKey: null,
  stub: false,
};

// Extract job title, company, and LinkedIn URL from Exa text result.
function extractFromText(text, url) {
  const bio = text?.slice(0, 150) || null;

  // Look for "Title at Company" or "Title, Company" patterns
  let title = null;
  let company = null;

  if (text) {
    // Common LinkedIn pattern: "Name - Title at Company | LinkedIn"
    const atPattern = /[-–]\s*([^|,\n]{3,60})\s+at\s+([^|,\n]{2,60})/i;
    const atMatch = text.match(atPattern);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }

    // Fallback: "Title | Company" or "Title, Company" near the start
    if (!title) {
      const pipePattern = /^([^|]{5,60})\s*[|]\s*([^|]{2,60})/m;
      const pipeMatch = text.match(pipePattern);
      if (pipeMatch) {
        title = pipeMatch[1].trim();
        company = pipeMatch[2].trim();
      }
    }
  }

  const linkedinUrl = url && url.includes("linkedin.com") ? url : null;

  return { title, company, bio, linkedinUrl };
}

async function exaEnrich(prospect) {
  const apiKey = process.env.EXA_API_KEY;
  if (!apiKey) return null;

  const hostname = prospect.url ? (() => { try { return new URL(prospect.url).hostname; } catch { return ""; } })() : "";
  const query = `${prospect.name || ""} ${hostname} linkedin`.trim();

  try {
    const response = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify({
        query,
        numResults: 1,
        type: "neural",
        contents: { text: { maxCharacters: 300 } },
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const result = data.results?.[0];
    if (!result) return null;

    return extractFromText(result.text, result.url);
  } catch {
    return null;
  }
}

async function clayEnrich(prospects) {
  const apiKey = process.env.CLAY_API_KEY;
  const tableId = process.env.CLAY_TABLE_ID;

  if (tableId) {
    try {
      const response = await fetch(`https://api.clay.run/${tableId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify({ prospects }),
      });
      if (response.ok) {
        const data = await response.json();
        return data.results || null;
      }
    } catch {
      // fall through to Exa fallback
    }
  }

  return null;
}

export async function run(stage, upstream) {
  const prospects = upstream.filter((i) => i.type === "prospect");

  const clayKey = process.env.CLAY_API_KEY;
  const exaKey = process.env.EXA_API_KEY;

  // Path 1: Clay API
  if (clayKey) {
    const clayResults = await clayEnrich(prospects);
    if (clayResults) {
      return {
        ok: true,
        items: clayResults.map((r, i) => ({
          ...prospects[i],
          ...r,
          enriched: true,
        })),
        meta: { count: clayResults.length, source: "clay", stub: false },
      };
    }
    // Clay call failed — fall through to Exa
  }

  // Path 2: Exa-powered enrichment
  if (exaKey) {
    const enriched = await Promise.all(
      prospects.map(async (p) => {
        const extracted = await exaEnrich(p);
        if (!extracted) return { ...p, enriched: false };
        return {
          ...p,
          enriched: true,
          title: extracted.title ?? p.title ?? null,
          company: extracted.company ?? p.company ?? null,
          linkedinUrl: extracted.linkedinUrl ?? p.linkedinUrl ?? null,
          bio: extracted.bio ?? null,
        };
      })
    );
    return {
      ok: true,
      items: enriched,
      meta: { count: enriched.length, source: "exa-fallback", stub: false },
    };
  }

  // Path 3: No keys — graceful passthrough (treated as stub)
  return {
    ok: true,
    items: prospects.map((p) => ({ ...p, enriched: false })),
    meta: {
      count: prospects.length,
      stub: true,
      note: "Set CLAY_API_KEY or EXA_API_KEY to enable real enrichment.",
    },
  };
}
