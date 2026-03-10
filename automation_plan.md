# HK-UPPGRADERING: FAS 2 (PROMPT 0-5)

## GRUNDREGLER (STRIKTA)
1. HK-STANDARD: Bygg endast för världsklass (Monkey Island/Duolingo-nivå). Ingen spam.
2. REPLACEMENT: Ersätt alltid hela filens innehåll vid uppdatering.
3. NO GUESSING: Fråga användaren om data/mallar/tabellnamn saknas.
4. ARCHITECTURE: Rör inte existerande logik om det inte uttryckligen krävs för HK.

## PROMPT 0: ARKITEKTUR-KARTLÄGGNING
- Kartlägg hela repots arkitektur (agenter, pipelines, builders).
- Identifiera moduler som redan har liknande funktion.
- Skapa en kort arkitektursammanfattning. STANNA efter detta och vänta på godkännande.

## PROMPT 1: Visual Engine & Design System
- Uppdatera builders/workers.js och buildStylesCss.
- Implementera Master Design System (Tailwind, Inter font, Dark mode).
- Lägg till UI-Polisher för micro-interactions.

## PROMPT 2: Legal & Compliance Guardian
- Skapa core/verifier/legal_compliance.js.
- Integrera i builders/full_product_pipeline.js.
- Krav på GDPR/ToS för att godkänna produkt.

## PROMPT 3: Revenue & Unit Economics
- Uppdatera core/verifier/portfolio_brain.js.
- Implementera LTV/CAC-kvot (Sunset < 1.5).
- Profit-First resursallokering.

## PROMPT 4: Market Feedback Loop
- Uppdatera ideas/ideas.js och ideas/ideaFilter.js.
- Läs market_signals.json.
- Implementera "Ruthless Investor 2.0"-filter.

## PROMPT 5: Superchief Upgrade
- Slutför integration i builders/full_product_pipeline.js.
- Implementera "Hardening Phase" (trippla tester).
- Slutverifiering av .env och API-nycklar.