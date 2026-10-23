// 把 Statuspage（status.claude.com）的 webhook 转成 Discord webhook 消息。
//
// 用法：把 Discord webhook URL 的域名替换成本 Worker 的域名即可：
//   https://discord.com/api/webhooks/<id>/<token>
//   → https://<worker>/api/webhooks/<id>/<token>
// 支持透传 ?thread_id=<id>，发到论坛/子区。

const DISCORD_API = "https://discord.com/api/webhooks";
const STATUS_PAGE = "https://status.claude.com";
const AVATAR = "https://www.anthropic.com/favicon.ico";

const COLORS = {
  none: 0x2ecc71,
  minor: 0xf1c40f,
  major: 0xe67e22,
  critical: 0xe74c3c,
  maintenance: 0x3498db,
  resolved: 0x2ecc71,
  operational: 0x2ecc71,
  degraded_performance: 0xf1c40f,
  partial_outage: 0xe67e22,
  major_outage: 0xe74c3c,
  under_maintenance: 0x3498db,
};

const LABELS = {
  investigating: "🔍 Investigating",
  identified: "🎯 Identified",
  monitoring: "👀 Monitoring",
  resolved: "✅ Resolved",
  postmortem: "📝 Postmortem",
  scheduled: "🗓️ Scheduled",
  in_progress: "🔧 In progress",
  verifying: "🔎 Verifying",
  completed: "✅ Completed",
  operational: "🟢 Operational",
  degraded_performance: "🟡 Degraded performance",
  partial_outage: "🟠 Partial outage",
  major_outage: "🔴 Major outage",
  under_maintenance: "🔵 Under maintenance",
};

const label = (s) => LABELS[s] ?? s ?? "unknown";
const truncate = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s ?? "");

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/webhooks\/(\d+)\/([\w-]+)\/?$/);

    if (request.method === "GET" || request.method === "HEAD") {
      return new Response(
        "Claude Status → Discord webhook relay.\n" +
          "POST Statuspage webhooks to /api/webhooks/<discord_webhook_id>/<discord_webhook_token>\n",
        { headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
    if (!match) return new Response("Not Found", { status: 404 });

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const message = toDiscord(payload);
    if (!message) return new Response("Ignored: unknown payload", { status: 202 });

    const target = new URL(`${DISCORD_API}/${match[1]}/${match[2]}`);
    target.searchParams.set("wait", "true");
    const threadId = url.searchParams.get("thread_id");
    if (threadId) target.searchParams.set("thread_id", threadId);

    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(message),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Discord error", res.status, text);
      return new Response(`Discord error ${res.status}: ${text}`, { status: 502 });
    }
    return new Response("OK");
  },
};

export function toDiscord(payload) {
  const base = { username: "Claude Status", avatar_url: AVATAR, allowed_mentions: { parse: [] } };
  if (payload?.incident) return { ...base, embeds: [incidentEmbed(payload.incident)] };
  if (payload?.component_update) {
    return { ...base, embeds: [componentEmbed(payload.component_update, payload.component)] };
  }
  return null;
}

function incidentEmbed(incident) {
  const updates = [...(incident.incident_updates ?? [])].sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at),
  );
  const latest = updates[0];
  const status = latest?.status ?? incident.status;
  const isMaintenance = !!incident.scheduled_for;
  const done = ["resolved", "completed", "postmortem"].includes(status);

  const color = done ? COLORS.resolved : isMaintenance ? COLORS.maintenance : (COLORS[incident.impact] ?? COLORS.minor);

  const fields = [{ name: "Status", value: label(status), inline: true }];
  if (incident.impact && !isMaintenance) fields.push({ name: "Impact", value: incident.impact, inline: true });
  if (isMaintenance) {
    const ts = (t) => `<t:${Math.floor(new Date(t).getTime() / 1000)}:f>`;
    fields.push({
      name: "Scheduled",
      value: `${ts(incident.scheduled_for)} → ${incident.scheduled_until ? ts(incident.scheduled_until) : "?"}`,
      inline: true,
    });
  }
  const components = (incident.components ?? []).map((c) => c.name).filter(Boolean);
  if (components.length) {
    fields.push({ name: "Affected components", value: truncate(components.join(", "), 1024) });
  }

  return {
    title: truncate(incident.name, 256),
    url: incident.shortlink || `${STATUS_PAGE}/incidents/${incident.id}`,
    description: truncate(latest?.body || "", 4096),
    color,
    fields,
    footer: { text: "status.claude.com" },
    timestamp: latest?.created_at ?? incident.updated_at ?? new Date().toISOString(),
  };
}

function componentEmbed(update, component) {
  const name = component?.name ?? update.component_id;
  return {
    title: truncate(`${name}: ${label(update.new_status)}`, 256),
    url: STATUS_PAGE,
    description: `${label(update.old_status)} → **${label(update.new_status)}**`,
    color: COLORS[update.new_status] ?? COLORS.minor,
    footer: { text: "status.claude.com" },
    timestamp: update.created_at ?? new Date().toISOString(),
  };
}
