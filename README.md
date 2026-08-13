# BrumTruckerz — starter

Mobilna aplikacija za male evropske prevoznike: tura + dokumenti + troškovi (multivaluta) →
**P&L ture** za vlasnika; centar rokova sa push opomenama; offline-first za vozača.

**Pročitaj prvo:** `CLAUDE.md` (pravila + redosled izgradnje), zatim `docs/projektni-zadatak.md` (PRD)
i `docs/data-model.md`.

## Pokretanje
1. `cp .env.example .env` i upiši Supabase URL + anon key.
2. `npm install` pa `npx expo install --fix` (poravna verzije native paketa sa SDK-om).
3. Supabase: `supabase link --project-ref <ref>` pa `supabase db push` (primeni `supabase/migrations/`).
4. `npm start` (Expo dev server; QR za telefon).

## Codespaces / Claude Code
Repo ima `.devcontainer/` — otvori u GitHub Codespaces i sve je spremno (Node 20 + Deno + Supabase CLI).
Claude Code čita `CLAUDE.md` i nastavlja po redosledu izgradnje (sekcija „Redosled izgradnje").

## Brend
Logo sistem i vodič: `assets/brand/` (znak, horizontalni lockup, app ikona, `brand.md`).

## Status
Starter: šema (0001+0002 sa RLS, multivalutom, audit događajima), offline red (SQLite),
i18n (en/sr), teme (light/dark tokeni), auth gate po ulozi, vozačev ekran aktivne ture
(offline mutacije), vlasnikova lista tura, skica cron funkcije za rokove.
Ostalo: TODO po `CLAUDE.md` — ovo NIJE gotova aplikacija, nego temelj sa koga se gradi.
