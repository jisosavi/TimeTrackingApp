# Salaxy Time Tracking App — Guide Page Format Spec

Use this spec to generate role guides (Company Admin, Team Supervisor) that are **visually and structurally identical** to the existing Employee guide. It is a single self-contained HTML file (an artifact), bilingual (English + Finnish), no external dependencies beyond Google Fonts. Reproduce the tokens, components, and structure below exactly; change only the role, content and section list.

---

## 1. File shell

- Single `.html` file, `<!doctype html>`, `lang="en"` on `<html>`.
- `<head>`: `charset=utf-8`, responsive viewport, `<title>`, a `<meta name="description">` (one sentence describing the role's guide, ending "English and Finnish."), `<meta name="theme-color" content="#3C1EEB">`, and `<meta name="robots" content="noindex, nofollow">`.
- Favicon is an inline base64 PNG (Salaxy mark). Reuse the same data URI.
- Fonts: preconnect to Google Fonts, then load **Figtree** (400,500,600,700,800 + italic 400) and **IBM Plex Mono** (400,500,600).
- All CSS lives in one `<style>` block in the head. All JS in one IIFE `<script>` before `</body>`.

---

## 2. Brand tokens (CSS custom properties)

Declare on `:root` for light, and override for dark via **both** `@media (prefers-color-scheme: dark) :root:not([data-theme="light"])` **and** `:root[data-theme="dark"]`. Also set `:root { color-scheme: light }` with the matching dark rules. Source: *Salaxy graafiset peruselementit V1.0 (26.05.2025)* — Figtree; `#3C1EEB`, `#28EB64`, `#283237`, `#EDE8E8`.

Light values:

```
--brand:#3C1EEB  --brand-on:#FFFFFF  --brand-soft:#ECE9FD  --brand-line:#C9C0FA
--green:#28EB64  --green-ink:#0B7A36  --green-soft:#E2FBEB
--ink:#283237    --ink-soft:#576369   --ink-faint:#8A9599
--line:#E3DEDE   --line-strong:#CDC6C6
--ground:#F7F5F4 --surface:#FFFFFF    --surface-sunk:#EDE8E8
--warn:#8A5A00   --warn-soft:#FBF0DC  --crit:#A8261E  --crit-soft:#FBE7E5
--logo-filter:none
```

Dark values (same variable names):

```
--brand:#A796FF  --brand-on:#1A2226  --brand-soft:#241C52  --brand-line:#453A8C
--green:#28EB64  --green-ink:#5FE28C  --green-soft:#10331F
--ink:#EDE8E8    --ink-soft:#B3BCC0   --ink-faint:#838E93
--line:#38444A   --line-strong:#4C5A61
--ground:#1A2226 --surface:#232C31    --surface-sunk:#2C363B
--warn:#E7B45F   --warn-soft:#3A2C11  --crit:#F0A099  --crit-soft:#3D1D1A
--logo-filter:brightness(0) invert(1)
```

Never hard-code colours in components — always reference these tokens.

---

## 3. Typography

- Body: **Figtree**, 16px, line-height 1.6, `--ink` on `--ground`, antialiased.
- **IBM Plex Mono** is the "label" typeface — used for every eyebrow, kicker, chip, meta line, table header, tree metadata, section number, and inline `code`. Always uppercase where it labels (letter-spacing ≈ `.14em`–`.18em`), small (`.6`–`.74rem`), colour `--brand` or `--ink-faint`.
- `h1`: Figtree 800, `clamp(2.4rem, 6.5vw, 4.2rem)`, line-height .98, letter-spacing −.035em, colour `--brand`, `text-wrap:balance`.
- `h2`: Figtree 700, `clamp(1.5rem, 3vw, 1.9rem)`, letter-spacing −.02em.
- `h3`: Figtree 700, 1.05rem.
- `.standfirst` (masthead deck): 1.15rem, max-width 44ch, colour `--ink`.
- `.lede` (per-section intro paragraph): colour `--ink-soft`, max-width 66ch.
- Body `p`: `margin:0` (spacing comes from flex `gap`).

---

## 4. Page layout

- `.wrap`: `max-width:68rem`, centred, `padding:1.75rem 1.5rem 6rem`, `display:flex; flex-direction:column; gap:2.25rem`.
- Spacing is done almost entirely with **flexbox `gap`**, not margins.
- `.lang-page`: flex column, `gap:3rem`. One per language; the inactive one carries the `hidden` attribute.

### Top bar (`.topbar`)
Flex row, space-between, `border-bottom:1px solid var(--line)`.
- Left `.brandmark`: Salaxy logo `<img>` (inline base64, height 22px, `filter:var(--logo-filter)`) · a 1px `.divider` · `.product` = "Time Tracking App" in mono uppercase, `--ink-faint`.
- Right `.langbar`: mono label "Language / Kieli" + a pill `.group` of two `<button data-set-lang>` (English / Suomi). Active button `aria-pressed="true"` → `--brand` bg, `--brand-on` text.

### Masthead (`.masthead`, `<header>`)
Flex column: `.eyebrow` (mono, `--brand`) reading `Salaxy Time Tracking App · Role: <ROLE>` → then `<h1>` → then `.standfirst` deck.

### Document grid (`.doc`)
`display:grid; grid-template-columns:12.5rem minmax(0,1fr); gap:3.5rem; border-top:1px solid var(--line); padding-top:2.75rem`.
- Left `aside.rail`: **sticky** (`top:1.5rem`) contents list. `.title` "Contents" (mono) + `<ol>` of links; each `li` is a 2-col grid of `.n` (mono number, or `·` for the preface) + `<a href="#...">`.
- Right `.docbody`: flex column, `gap:3.25rem`, holds the preface + all sections + footer.
- **Responsive** ≤860px: collapse to one column; rail becomes static with a bottom border.

---

## 5. Content components

Emit these in this order inside `.docbody`.

### Preface (`.preface`, `id="<lang>-00"`)
Card: `--surface`, `border`, **`border-top:3px solid var(--brand)`**, radius `0 0 6px 6px`. Contains a `.kicker` ("Start here") then a series of `.qa` blocks (each = `<h3>` + one or more `<p>` in `--ink-soft`), separated by `.rule` (1px `--line`) divider `<div>`s. Emphasis inside prose uses `<em>` (rendered upright, `--ink-soft`) and `<b>`.

### Section (`<section id="<lang>-0N">`)
Flex column, `gap:1.15rem`, `scroll-margin-top:1.5rem`. Every section is:
1. `.sec-eyebrow` — mono, `--brand`, reads `Section 0N`.
2. `<h2>` heading.
3. usually a `.lede` intro paragraph.
4. one or more of the blocks below.

### Flow strip (`.flow`)
A horizontal process strip: grid of `.step` cells with dividing borders, wrapped in a rounded `--surface` box. Each `.step` = `.k` (mono step label e.g. "3 · Classify"), `.v` (bold value), `.n` (faint note). One highlighted `.step.pivot` gets `--brand-soft` bg. Stacks vertically ≤640px.

### Table (`.tablewrap` > `table`)
Scroll-wrapper with border + radius. `thead th` in mono uppercase `--brand`; cells `border-bottom:1px solid var(--line)`, top-aligned; last row borderless. `td.who` = nowrap, its `<b>` is `--ink`. Use `<code>` for routes like `/{slug}/admin`.

### Callout note (`.note`)
`--surface` card with `border-left:3px solid var(--brand)`, radius `0 6px 6px 0`. `<h3>` title + a `<ul>` of consequence bullets in `--ink-soft`. Use for "Consequences worth knowing" style asides.

### Chip legend (`.legend` + `.chip`)
A `.legend` row explains the chip vocabulary. Chip variants (mono, tiny, uppercase, 3px radius):
- `.c-screen` = Screen (own route) — brand-soft
- `.c-tab` = Tab (in-page switch) — surface-sunk
- `.c-panel` = Panel (region/list) — outlined faint
- `.c-sheet` = Sheet (bottom sheet/overlay) — outlined
- `.c-act` = Action (button pressed) — green-soft/green-ink
- `.c-state` = State (conditional view) — warn-soft/warn

### Code-token row (`.cause`)
Wrapped row of small mono `<span>` pills (outlined, `--surface`) — used for fixed enumerations like absence cause codes. Reuse only if the role has an equivalent fixed list.

---

## 6. The screen-map tree (the centrepiece)

Section titled "The app screens" renders an **interactive collapsible tree** of the role's UI, built by JS from a data array.

- Markup: `.tree-tools` with two buttons `data-tree-all="open"` / `"close"` (Expand all / Collapse all), then `.tree-card` wrapping `<ul class="tree" id="tree-<lang>">` (empty; JS fills it).
- Tree visuals: nested `<ul>` with left connector lines (`border-left` + `::before` elbows). Each expandable node is `<details><summary>` with a custom CSS triangle `.caret` (rotates 90° when open); native marker hidden. Leaf nodes render a `.node` directly.
- A node body (`.node`) = bold `.name` + optional `.chip` (from `c`) + optional inline `<code>` (from `code`) + optional `.desc` (faint). Collapsed parents show a mono `.kids` badge `+n` (hidden when open).

### Tree data model
Two JS constants drive labels:
```js
CHIPS = { en:{screen,tab,panel,sheet,act,state}, fi:{…Näkymä,Välilehti,Alue,Paneeli,Toiminto,Tila} }
MORE  = { en:"+{n}", fi:"+{n}" }
```
The tree is `var TREE = [ … ]`; each node:
```js
{ c:"chipType", code:"/route", en:["Name","description"], fi:["Nimi","kuvaus"], o:true /*open by default*/, k:[ …children ] }
```
`c`, `code`, `o` and `k` are all optional. `en`/`fi` are `[name, desc]` pairs; `desc` may contain `<em>`, `<code>`, `«…»`, emoji. Build both `#tree-en` and `#tree-fi` from the same `TREE`. **Rebuild the TREE to match the new role's actual screens/routes/actions.**

---

## 7. Footer

`<footer>` (border-top, faint text): a `.meta.meta-foot` row of mono `<span><b>label</b> value</span>` pairs (Guide · Application · Updated), then 1–2 prose lines: what the guide covers and that a company's own setup may differ, plus who to contact for help in that role.

**These guides are published publicly, so the footer must stay neutral.** No test or staging hostnames, no test account or person names, no repository links or branch names, and no internal verification notes ("confirmed from source rather than a populated screen"). Verify against a live instance and the repo as much as you like — just keep that out of the shipped page.

---

## 8. Behaviour (JS, one IIFE)

1. `el(tag, cls)` helper; `nodeBody()` and `buildList()` recursively render the TREE for each of `["en","fi"]` into its mount.
2. Expand-all / collapse-all buttons toggle every `.tree details` within the current `.lang-page`.
3. Language switch: `data-set-lang` buttons show/hide `.lang-page` via the `hidden` attribute, flip `aria-pressed`, set `document.documentElement.lang`, persist to `localStorage["ttag-lang"]`, and smooth-scroll to top.
4. On load, restore saved language (default English) — if saved `"fi"`, click the Suomi button.
5. Wrap `localStorage` in try/catch. Respect `prefers-reduced-motion` (caret transition off).

> Note: `localStorage` works in a standalone/exported HTML file but **not inside a Claude artifact preview**. The Employee guide uses it anyway because it is meant to be exported/hosted. Keep this behaviour; just be aware the language toggle's persistence won't survive inside the artifact sandbox.

---

## 9. Accessibility & polish

- Focus-visible outlines (`2px solid var(--brand)`) on links, buttons, summaries.
- `text-wrap:balance` on `h1`/`h2`.
- Chips/labels are decorative-but-legible; never rely on chip colour alone — the legend defines meaning.
- Bilingual parity: every English node/section/label must have a Finnish counterpart with the same structure.

---

## 10. What to change per role

Keep everything above identical. Vary only:
- **Eyebrow / masthead / meta**: `Role: <Team Supervisor | Company Admin>`; title and standfirst.
- **Contents list + sections**: the role's own concepts (e.g. admin: employee management, payroll export, company settings; supervisor: the approval queue, approve/reject/clarify, team scope).
- **Sign-in fact**: employee = PIN at `/{slug}`; supervisor = PIN at `/{slug}/approval`; admin = email + password at `/{slug}/admin`. Reflect the right one in the preface and the roles table.
- **The TREE**: rebuild to the actual screens, routes, tabs, panels, actions and states of that role's UI.
- Everything else — tokens, fonts, components, layout, JS — stays byte-for-byte the same so the three guides form a set.
