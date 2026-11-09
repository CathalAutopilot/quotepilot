# QuotePilot

Pilot waitlist site for [QuotePilot](https://autopilotconsultants.com/quotepilot), an AI quoting and booking assistant for small and mid-size European freight forwarders and 3PLs. Built by Autopilot Consultants, Hamburg.

The page is static HTML, CSS and JavaScript. Signups are stored by a Cloudflare Pages Function in a Workers KV namespace bound as `WAITLIST`. There is no pricing on the page.

The site is live at https://quotepilot-f88.pages.dev. The Cloudflare Pages project is `quotepilot`. After `npm run build`, deploy with `npx wrangler pages deploy dist`.

## Local development

Requires Node.js 20 or newer.

```bash
npm install
npm test
npm start
```

`npm start` builds the site, then serves it with the Pages Function:

- Site: http://127.0.0.1:4391
- Waitlist endpoint: http://127.0.0.1:4391/api/waitlist
- Same endpoint under the subpath: http://127.0.0.1:4391/quotepilot/api/waitlist

`npm run dev` serves an existing `dist/` folder without rebuilding. Local KV is simulated with `--kv WAITLIST` and stored under `.wrangler/state`. It does not write to a production namespace.

To read a local signup back:

```bash
npx wrangler kv key get "person@company.com" \
  --binding WAITLIST \
  --local \
  --persist-to .wrangler/state \
  --text
```

## Build

| | |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |

The build copies `public/` to `dist/`. Pages Functions stay in `/functions` at the project root. They are not part of `dist/`.

## Waitlist function

`functions/api/waitlist.js` handles `POST /api/waitlist`. `functions/quotepilot/api/waitlist.js` handles `POST /quotepilot/api/waitlist`. Both call the same code in `lib/waitlist.js`.

The function accepts JSON or a normal form post.

| Field | Required | Notes |
| --- | --- | --- |
| `email` | Yes | Work email. Stored lowercased. This is the KV key. |
| `name` | No | Up to 80 characters |
| `company` | No | Up to 120 characters |
| `country` | No | Up to 80 characters |
| `mode` | No | `road`, `sea` or `air` |
| `qp_leave_blank` | No | Honeypot. If it is filled, the response looks successful and nothing is stored. |

A signup is a JSON value:

```json
{
  "email": "ops@forwarder.com",
  "name": null,
  "company": null,
  "country": null,
  "mode": "road",
  "createdAt": "2026-11-09T12:00:00.000Z",
  "updatedAt": "2026-11-09T12:00:00.000Z"
}
```

Sending the same email again updates the record and keeps the original `createdAt`.

`public/_routes.json` limits Functions to `/api/*` and `/quotepilot/api/*`, so static files are not billed as Function invocations.

## KV binding

The binding name is **`WAITLIST`**. The Function reads and writes `context.env.WAITLIST`.

Create a production namespace and a separate preview namespace (Wrangler 4.158):

```bash
npx wrangler kv namespace create WAITLIST
npx wrangler kv namespace create WAITLIST --preview
```

Put the ids in `wrangler.jsonc`:

```jsonc
"kv_namespaces": [
  {
    "binding": "WAITLIST",
    "id": "<production namespace id>",
    "preview_id": "<preview namespace id>"
  }
]
```

When this file is deployed with the project, it is the source of truth for the binding. You can also attach it in the dashboard: **Workers & Pages → the project → Settings → Bindings → Add → KV namespace**, with variable name `WAITLIST`, for both Production and Preview. A later deploy that includes `wrangler.jsonc` overwrites dashboard values for the fields it sets.

To delete an entry after someone asks (this hits the remote namespace):

```bash
npx wrangler kv key delete "person@company.com" --binding WAITLIST --remote
```

Use `--preview` for the preview namespace, or pass `--namespace-id` instead of `--binding`. Do not add `--remote` if you only want the local simulation.

KV reads are eventually consistent. A signup is acknowledged after `put` succeeds. A follow-up read can lag.

## Deploy to Cloudflare Pages

The site is live at https://quotepilot-f88.pages.dev. The Cloudflare Pages project is `quotepilot`.

```bash
npm run build
npx wrangler pages deploy dist
```

`npx wrangler login` once per machine. `wrangler.jsonc` already sets the project name and the `WAITLIST` KV namespace ids. You can also connect this Git repository instead of deploying from a machine.

Git build settings:

- Framework preset: None
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: the repository root (so `/functions` is included)

Production environment variable: none required for the waitlist. The KV binding is not an environment variable.

Compatibility date in `wrangler.jsonc` is `2026-11-09`.

## Base path

Asset and form URLs are relative (`styles.css`, `app.js`, `fonts/...`, `api/waitlist`), so they follow the directory of the page.

- Served at the root of a Pages project: the form posts to `/api/waitlist`.
- Served from `/quotepilot/` (the intended public URL is `autopilotconsultants.com/quotepilot/`): the form posts to `/quotepilot/api/waitlist`.

Link the directory with a trailing slash, or link `index.html` directly. Both Function routes are deployed, so either layout works. If a parent host strips the `/quotepilot` prefix before the request reaches this project, the root route still answers.

## Hero map

The hero shows a dot-matrix map of Europe with example road, sea and air lanes. Vehicles move along the lanes and the lane card cycles through them. Visitors can filter by mode and hover a lane or hub. The lanes are illustrations, not live shipments, and the page says so.

`public/map-data.js` holds the projected dots, hubs and lanes. It is generated, so edit hubs or lanes in `scripts/build-map.mjs` and run:

```bash
npm run map
```

The map script uses the `d3-geo`, `topojson-client` and `world-atlas` dev dependencies. The site itself loads no third-party code.

## Fonts

Space Grotesk (headings), Inter (body) and JetBrains Mono (labels and data) are self-hosted from Fontsource under the SIL Open Font License. License texts are in `public/fonts/`.
