// venture-routes.mjs — the firm's portfolio + bet read HTTP surface (thin; read-only; fails closed).
//
// GET the venture list, trusted local repository choices, one venture's manifest, a venture's bets,
// and one bet. These are reads with no outward capability; anything staged still has to cross the wall.
// Repository choices are the exception to ambient access: absolute local paths are returned only to a
// loopback peer and never come from arbitrary directory traversal.
import fs from "node:fs";
import path from "node:path";
import { json } from "../routes/util.mjs";
import { authorizeFounderWriteForRequest } from "../routes/founder-authority.mjs";
import { listVentures, openVenture, getVentureDoc, listVentureDocs } from "./venture-store.mjs";
import {
  groupedPortfolioWall,
  portfolioFrontierEligibility,
  requirePortfolioFrontierProof,
} from "./portfolio-frontier.mjs";
import { createVentureTransfer, importVentureTransfer } from "./venture-transfer.mjs";

function fail(res, err) {
  const status = err?.code === "venture_not_found" ? 404 : (Number.isInteger(err?.status) ? err.status : 400);
  json(res, status, {
    error: err instanceof Error ? err.message : String(err),
    ...(err?.code ? { code: err.code } : {}),
    ...(err?.eligibility ? { eligibility: err.eligibility } : {}),
  });
}

async function readTransferBody(req) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of req) {
    bytes += Buffer.byteLength(chunk);
    if (bytes > 20 * 1024 * 1024) {
      const error = new Error("The venture transfer file is larger than 20 MB.");
      error.code = "venture_transfer_too_large";
      error.status = 413;
      throw error;
    }
    chunks.push(Buffer.from(chunk));
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("The venture transfer file is not valid JSON.");
    error.code = "venture_transfer_invalid";
    throw error;
  }
}

function transferFileName(venture) {
  const name = String(venture?.name ?? "venture").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${name || "venture"}.drover.json`;
}

function isLoopbackAddress(address) {
  return address === "127.0.0.1" || address === "::1" || address?.startsWith("::ffff:127.");
}

function isLocalRepositoryRequest(req) {
  if (!isLoopbackAddress(req.socket?.remoteAddress)) return false;
  for (const value of [req.headers?.origin, req.headers?.referer]) {
    if (!value) continue;
    try {
      const hostname = new URL(value).hostname;
      if (hostname !== "localhost" && hostname !== "127.0.0.1" && hostname !== "[::1]") return false;
    } catch {
      return false;
    }
  }
  return true;
}

function repositoryChoices() {
  const candidates = [
    { path: process.cwd(), source: "workspace" },
    ...listVentures().map((venture) => ({ path: venture.repository, source: "venture" })),
  ];
  const seen = new Set();
  return candidates.flatMap((candidate) => {
    try {
      if (!fs.statSync(candidate.path).isDirectory()) return [];
      const repository = fs.realpathSync(candidate.path);
      if (seen.has(repository)) return [];
      seen.add(repository);
      return [{ name: path.basename(repository), path: repository, source: candidate.source }];
    } catch {
      return [];
    }
  });
}

export default async function handle({ req, res, url }) {
  if (req.method === "GET" && url.pathname === "/api/portfolio/wall") {
    try {
      authorizeFounderWriteForRequest(req, "Viewing the portfolio wall");
      const eligibility = portfolioFrontierEligibility();
      json(res, 200, {
        eligibility,
        groups: eligibility.status === "eligible" ? groupedPortfolioWall() : [],
      });
    } catch (err) {
      // A page not opened by the desktop host is a VALID read state, not a failure: this route's own
      // contract is "reads remain available" (see founder-authority.mjs). The founder-write boundary
      // here only protects the cross-venture AGGREGATION; when the host is simply absent, the honest
      // answer is the same empty, proof-gated payload the UI already renders as "nothing to show" — a
      // 200, never a 503 the browser logs as if the app were broken. A genuine refusal (agent-stamped
      // request → 403) or any other authority failure still fails closed below.
      if (err?.code === "founder_host_unavailable") {
        json(res, 200, { eligibility: portfolioFrontierEligibility(), groups: [] });
        return true;
      }
      fail(res, err);
    }
    return true;
  }

  const transferMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/transfer$/);
  if (req.method === "GET" && transferMatch) {
    const ventureId = decodeURIComponent(transferMatch[1]);
    try {
      authorizeFounderWriteForRequest(req, "Exporting a venture");
      requirePortfolioFrontierProof();
      const transfer = createVentureTransfer(ventureId);
      res.setHeader?.("Content-Disposition", `attachment; filename="${transferFileName(transfer.venture.manifest)}"`);
      json(res, 200, { transfer });
    } catch (err) { fail(res, err); }
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/ventures/import") {
    try {
      authorizeFounderWriteForRequest(req, "Importing a venture");
      requirePortfolioFrontierProof();
      const body = await readTransferBody(req);
      const result = importVentureTransfer(body?.transfer, { repository: body?.repository });
      json(res, 200, result);
    } catch (err) { fail(res, err); }
    return true;
  }

  if (req.method !== "GET") return false;

  // Browsers cannot turn a folder selection into a server-readable absolute path. Offer only folders
  // Croki already trusts instead: the server's launch workspace and repositories connected to an
  // existing venture. This is deliberately not a filesystem browser, and path disclosure stays local.
  if (url.pathname === "/api/repositories") {
    if (!isLocalRepositoryRequest(req)) {
      json(res, 403, { error: "Product folders are only available from Croki on this Mac." });
      return true;
    }
    json(res, 200, { repositories: repositoryChoices() });
    return true;
  }

  if (url.pathname === "/api/ventures") {
    json(res, 200, { ventures: listVentures() });
    return true;
  }

  const getMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)$/);
  if (getMatch) {
    const ventureId = decodeURIComponent(getMatch[1]);
    const venture = openVenture(ventureId);
    if (!venture) {
      json(res, 404, { error: `No such venture: ${ventureId}` });
      return true;
    }
    json(res, 200, { venture });
    return true;
  }

  const betsMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets$/);
  if (betsMatch) {
    const ventureId = decodeURIComponent(betsMatch[1]);
    try {
      json(res, 200, { bets: listVentureDocs(ventureId, "bets") });
    } catch (err) { fail(res, err); }
    return true;
  }

  const betMatch = url.pathname.match(/^\/api\/ventures\/([^/]+)\/bets\/([^/]+)$/);
  if (betMatch) {
    const ventureId = decodeURIComponent(betMatch[1]);
    const betId = decodeURIComponent(betMatch[2]);
    try {
      const bet = getVentureDoc(ventureId, "bets", betId);
      if (!bet) {
        json(res, 404, { error: `No such bet: ${betId}` });
        return true;
      }
      json(res, 200, { bet });
    } catch (err) { fail(res, err); }
    return true;
  }

  return false;
}
