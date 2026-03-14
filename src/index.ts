interface Env {
  SLOTS: KVNamespace
  EMAIL_TO: string
  RESEND_API_KEY: string
}

const URLS = [
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=14263434&agenda_ids=1853720&practice_ids=588793&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=10397193&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=2909943&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=2909945&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=11409179&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=14914867&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=14924605&agenda_ids=981163&practice_ids=192588&telehealth=false&start_date=2025-11-23&limit=5",
]

/*
const URL_TEMPLATES = [
  "https://www.doctolib.fr/availabilities.json?visit_motive_ids=1733480&agenda_ids=390509&practice_ids=500475&telehealth=true&start_date=2026-03-14&limit=5",
]
  */

function todayString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildUrlWithToday(template: string): string {
  const urlObj = new URL(template);
  urlObj.searchParams.set("start_date", todayString());
  return urlObj.toString();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default {

  async fetch(request: Request, env: Env) {

    const url = new URL(request.url)

    if (url.pathname === "/test") {
      await runCrawler(env)
      return new Response("Crawler executed")
    }

    return new Response("OK")
  },

  async scheduled(event: ScheduledEvent, env: Env) {
    await runCrawler(env)
  }

}

async function runCrawler(env: Env) {

	const known = await loadKnownSlots(env)

    const currentSlots = new Set<string>()

    for (const template of URL_TEMPLATES) {
      const url = buildUrlWithToday(template)

      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
		  "Accept-Language": "fr-FR,fr;q=0.9",
		  "Referer": "https://www.doctolib.fr/"
        }
      })

		console.log("HTTP status", res.status)

		const text = await res.text()

		if (!text.startsWith("{")) {
		console.log("Non JSON response:")
		console.log(text.slice(0, 500))
		return
		}

		const json = JSON.parse(text)

      const availabilities = json.availabilities ?? []

      for (const a of availabilities) {
        for (const slot of (a.slots ?? [])) {
          currentSlots.add(slot)
        }
      }

      await sleep(2000) // Sleep for 2 seconds between requests
    }

    const newSlots = [...currentSlots].filter(s => !known.has(s))

    if (newSlots.length === 0) {
      console.log("Aucun nouveau slot")
      return
    }

    console.log("Nouveaux slots", newSlots)

    await sendEmail(env, newSlots)

    const updated = new Set([...known, ...currentSlots])

    await env.SLOTS.put("known_slots", JSON.stringify([...updated]))
}

async function loadKnownSlots(env: Env): Promise<Set<string>> {

  const data = await env.SLOTS.get("known_slots")

  if (!data) return new Set()

  return new Set(JSON.parse(data))
}

async function sendEmail(env: Env, slots: string[]) {

	const response = await fetch("https://api.resend.com/emails", {
	method: "POST",
	headers: {
		Authorization: `Bearer ${env.RESEND_API_KEY}`,
		"Content-Type": "application/json",
	},
	body: JSON.stringify({
		from: "Doctolib Crawler <onboarding@resend.dev>",
		to: env.EMAIL_TO,
		subject: "Créneaux Doctolib disponibles",
		text: slots.join("\n"),
	}),
	});

	const text = await response.text();

	console.log("Resend status:", response.status);
	console.log("Resend response:", text);

}