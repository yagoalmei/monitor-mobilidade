/**
 * Radar Mercado · Feedback Worker
 * Recebe votos do briefing semanal e grava como comments numa issue do GitHub.
 * Token GITHUB_PAT fica em secret env var — nunca exposto no HTML.
 *
 * Endpoints:
 *   POST /vote   → grava um voto (cria comment na issue de feedback)
 *   GET  /health → retorna {ok: true}
 *
 * Deploy: ver SETUP.md.
 */

const REPO_OWNER = "yagoalmei";
const REPO_NAME = "monitor-mobilidade";

const ALLOWED_ORIGINS = [
  "https://yagoalmei.github.io",
];

const VOTES_VALIDOS = ["🔥", "👌", "🚫"];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const cors = corsHeaders(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: cors });
    }

    if (url.pathname === "/health") {
      return json({ ok: true, time: new Date().toISOString() }, { headers: cors });
    }

    if (url.pathname !== "/vote" || request.method !== "POST") {
      return json({ error: "not_found" }, { status: 404, headers: cors });
    }

    let data;
    try {
      data = await request.json();
    } catch {
      return json({ error: "invalid_json" }, { status: 400, headers: cors });
    }

    const { item_id, voto, motivo, nickname, uuid, week, issue_number } = data;

    if (!item_id || !voto || !uuid || !issue_number) {
      return json({ error: "missing_fields" }, { status: 400, headers: cors });
    }
    if (!VOTES_VALIDOS.includes(voto)) {
      return json({ error: "invalid_voto" }, { status: 400, headers: cors });
    }
    if (voto === "🚫" && (!motivo || motivo.trim().length < 3)) {
      return json({ error: "motivo_required_for_negativo" }, { status: 400, headers: cors });
    }

    const payload = {
      item: String(item_id).slice(0, 16),
      voto,
      motivo: motivo ? String(motivo).slice(0, 1000) : null,
      nickname: nickname ? String(nickname).slice(0, 60) : "anônimo",
      uuid: String(uuid).slice(0, 64),
      week: week ? String(week).slice(0, 20) : null,
      ts: new Date().toISOString(),
    };

    const commentBody = "```json\n" + JSON.stringify(payload, null, 2) + "\n```";

    const ghResp = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${encodeURIComponent(issue_number)}/comments`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.GITHUB_PAT}`,
          "Accept": "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
          "User-Agent": "radar-mercado-worker",
        },
        body: JSON.stringify({ body: commentBody }),
      }
    );

    if (!ghResp.ok) {
      const errText = await ghResp.text();
      return json(
        { error: "github_api_error", status: ghResp.status, detail: errText.slice(0, 500) },
        { status: 502, headers: cors }
      );
    }

    return json({ ok: true }, { headers: cors });
  },
};
