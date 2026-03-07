# Betalning och marknadsföring – AI-FABRIK

## Modulstatus

**Marknadsförings- och betalningsmodulen är redo att kopplas till live produktion.**

- `builders/full_product_pipeline.js` bygger produkter, skapar marknadsföringsmaterial och betalningsstruktur per produkt, kör QA och deploy.
- All output sparas i fabriken. Kör med `node builders/full_product_pipeline.js` eller via `node superchief_daemon.js`.

---

## Var API-nycklar sätts (senare)

Per produkt (varje `apps/<appId>/`):

| Fil | Innehåll |
|-----|----------|
| `apps/<appId>/payment_config.json` | Stripe (`secret_key`, `publishable_key`), PayPal (`client_id`, `client_secret`), Apple Pay (`merchant_id`), Google Pay (`merchant_id`). Sätt **en rad/credential per provider** – ingen live-transaktion förrän nycklar är ifyllda. |
| `apps/<appId>/PAYMENT_README.txt` | Kort beskrivning av hur betalning aktiveras per produkt. |

Produkter hanteras **individuellt** – aktivera betalning per app genom att fylla i respektive `payment_config.json`.

---

## Marknadsföringsmaterial (growth hooks)

Per produkt skapas:

- `apps/<appId>/marketing/google_ads.txt` – rubriker, beskrivning, final URL-placeholder
- `apps/<appId>/marketing/tiktok.txt` – hook, CTA, hashtags
- `apps/<appId>/marketing/youtube.txt` – titel, beskrivning, CTA
- `apps/<appId>/marketing/linkedin.txt` – post, CTA, målgrupp
- `apps/<appId>/marketing/pinterest.txt` – pin-titel, beskrivning, board
- `apps/<appId>/marketing/product_hunt.txt` – tagline, beskrivning, first comment

Samma filer kopieras till `deploy/<appId>/marketing/`. Använd innehållet i respektive kanal; ersätt `[SET_URL]`/`[SET_YOUR_LANDING_URL]` med riktig länk.

---

## Kontinuerlig körning

```bash
node superchief_daemon.js
```

Daemonen kör var 7:e minut: Trend Analyst → `approved_trend_ideas.json` → Full Product Pipeline (build, marknadsföring, betalning, QA, deploy). Allt loggas till konsolen och `superchief_report.log`.
