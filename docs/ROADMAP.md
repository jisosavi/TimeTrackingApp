# Roadmap

Planned and deferred work. Each item records the decisions already taken and what is
knowingly left out, so neither has to be rediscovered.

---

## Cost accounting dimensions (cost centres / project codes)

**Status:** planned (Sep 2026). Scope is deliberately the simplest case: one row-scoped
dimension, one value per entry. Salaxy's dimension support is far more versatile; the
extensions we are knowingly leaving out are listed at the end.

### What Salaxy provides

```
GET    /v03/api/settings/dimensions        -> CostAccountingDimensionDefinition[]
GET    /v03/api/settings/dimensions/{id}
POST   /v03/api/settings/dimensions        -> saves ONE definition
POST   /v03/api/settings/dimensions/all    -> REPLACES ALL definitions (dangerous)
DELETE /v03/api/settings/dimensions/{id}
```

| Schema | Fields |
|---|---|
| `CostAccountingDimensionDefinition` | `id`, `label`, `options[]`, `allowCostSharing`, `scope` |
| `CostAccountingDimensionOption` | `value`, `text`, `path` (for hierarchies), `scope` |
| `CostAccountingDimension` (the assignment) | `id`, `value`, `percent` |
| `CostAccountingDimensionScope` | `none` / `calculation` / `row` / `hidden` |

Assignment points: `UserDefinedRow.accounting.dimensions[]` (per row) and
`CalculationAccounting.dimensions` (per calculation).

### Already in place

`EMPTY_ROW_FIELDS` in `backend/lib/salaxy.ts` already sends
`accounting: { vatPercent: null, vatEntries: null, dimensions: [], entry: null }` on every
exported row. The export side is populating an array we already send, not new plumbing.

### Decisions taken

| Decision | Choice |
|---|---|
| Sync direction | **Read-only.** `POST /settings/dimensions/all` replaces every dimension on the account, so the time tracker must never write back |
| Dimensions per entry | One for now, stored in a child table so percentage splits and multiple dimensions are additive later |
| Eligible dimensions | `scope: 'row'` only — a time entry becomes a calculation row |
| Option count | Assume under ~20, so the enabled options can be injected into the LLM system prompt |
| Free-text `project` | Kept. Per company it is **either** free text **or** Salaxy dimensions, never both |
| Sync trigger | Admin-initiated, following `backend/routes/sync_employees.ts` (`POST`, `requireAdmin`) |

### Data model

| Table | Columns | Notes |
|---|---|---|
| `company_dimensions` (new) | `company_id`, `dimension_id`, `label`, `scope`, `allow_cost_sharing`, `enabled`, `synced_at` | One row per Salaxy definition; `enabled` is the admin's pick |
| `company_dimension_options` (new) | `company_id`, `dimension_id`, `value`, `text`, `path`, `active` | `active=false` when an option disappears from Salaxy but is still referenced by history |
| `time_entry_dimensions` (new) | `entry_id`, `dimension_id`, `value`, `percent` | `percent` defaults 100. Exactly one row per entry today; the table shape is what makes splits additive later |
| `time_entries.project` | unchanged | Holds the option's `text` as the display label when dimensions are on, free text when they are off |

Keeping `project` as the label means the export row message stays human-readable for the
payroll manager while the authoritative code lives in `accounting.dimensions`.

### Mode switch, per company

- **No dimensions synced/enabled** -> `project` is a free-text input. Exactly today's behaviour.
- **Dimensions enabled** -> the preview card shows a required select of enabled options; free
  text is not offered.

This is why no migration is needed: existing companies stay in the first mode until an admin
opts in.

### LLM logging

With under ~20 options, inject the enabled options into the interpreter's system prompt so the
model maps a spoken name to a code directly:

```
KUSTANNUSPAIKAT (valitse VAIN näistä, palauta koodi):
  LAI-01  Laituri
  MOO-02  Moonlanding
```

The model returns the code; the backend validates it against the enabled options; the preview
card shows a select pre-filled with the match. An unmatched or missing code leaves the select
empty for the employee to pick. This keeps the app's existing rule that nothing is saved
without a confirmable, editable preview.

### Export

Populate the array already being sent, on both rows an entry generates (hours and km):

```ts
accounting: { ...EMPTY_ROW_FIELDS.accounting,
              dimensions: [{ id: dimensionId, value, percent: 100 }] }
```

Validate before sending: if an entry references an option that is no longer `active`, refuse
the export and name the entry rather than sending a value Salaxy may reject.

### Phases

1. **Sync + storage** — `POST /api/sync_dimensions_from_salaxy` (`requireAdmin`), the three
   tables, no UI. *Verify:* a company's row-scoped dimensions and options appear locally and a
   re-sync is idempotent.
2. **Admin selection UI** — list synced dimensions, toggle `enabled`. *Verify:* enabling one
   flips that company into dimension mode.
3. **Employee select in the preview card** — replaces the free-text `project` input when
   enabled. *Verify:* an entry saves with a `time_entry_dimensions` row.
4. **LLM prompt injection + code validation.** *Verify:* parser tests mapping a spoken project
   name to the right code, and an unknown name leaving the field empty.
5. **Export.** *Verify:* the exported row in Salaxy carries the dimension value, visible on the
   calculation.

### Test fixture to create in Salaxy

Three definitions: two that the feature should pick up, and one that it must ignore. Two
usable dimensions rather than one is deliberate — the admin's "which are used for time
tracking" step cannot be tested with a single dimension.

Create them one at a time with `POST /v03/api/settings/dimensions`. **Never use
`/settings/dimensions/all`** — it replaces every dimension on the account.

```json
{ "id": "costcentre", "label": "Kustannuspaikka", "scope": "row", "allowCostSharing": false,
  "options": [ { "value": "100", "text": "Helsinki" },
               { "value": "200", "text": "Tampere" },
               { "value": "300", "text": "Äänekoski" } ] }

{ "id": "project", "label": "Projekti", "scope": "row", "allowCostSharing": false,
  "options": [ { "value": "LAI-01", "text": "Laituri" },
               { "value": "MOO-02", "text": "Moonlanding" },
               { "value": "LAI-02", "text": "Laiturin huolto" } ] }

{ "id": "dept", "label": "Osasto", "scope": "calculation", "allowCostSharing": false,
  "options": [ { "value": "A", "text": "Hallinto" },
               { "value": "B", "text": "Tuotanto" } ] }
```

If Salaxy assigns the `id` itself rather than accepting the one posted, use whatever it
returns — the values above only need to be stable, not specific.

Each element is there to prove something:

| Fixture element | What it tests |
|---|---|
| Two `row`-scoped dimensions | The admin can enable a subset; impossible to test with one |
| `dept` at `calculation` scope | The scope filter genuinely excludes it from the admin list |
| `Äänekoski` | UTF-8 survives Salaxy -> DB -> LLM prompt -> preview -> export row message |
| `LAI-01 Laituri` beside `LAI-02 Laiturin huolto` | The model picks the right one; an ambiguous "laituri" should leave the field empty rather than guess |
| Codes that do not resemble their text | The model returns the **code**, not the label |
| Reusing "Laituri" and "Moonlanding" | Directly comparable with the existing free-text entries already in the test data |

Two follow-up tests that need no new fixture:

- **Option withdrawn:** delete `LAI-02` in Salaxy after an entry references it, re-sync, and
  confirm the option goes `active = false`, history still renders, and the export refuses
  rather than sending a dead value.
- **Cost sharing flag:** flip `costcentre` to `allowCostSharing: true` and confirm the app
  still sends exactly one value at `percent: 100` and does not break. This is the closest
  cheap check that the deferred percentage-split work will not require restructuring.

### Deliberately out of scope for now

Salaxy supports considerably more than this, and these are the pieces we are choosing not to
build yet. All are additive on the model above.

- **Percentage splits** — one entry divided across several dimension values.
  `CostAccountingDimension.percent` and `allowCostSharing` already exist for this, and
  `time_entry_dimensions.percent` is why it needs no restructuring.
- **Multiple dimensions per entry** — e.g. a cost centre *and* a project on the same entry.
  The child table already permits it; it is a UI question.
- **Non-row scopes** — `calculation`-scoped dimensions, and any future payroll-level or
  employee-level dimensions. A company whose cost centre is not row-scoped cannot use this
  feature at all until then.
- **Hierarchical options** — `CostAccountingDimensionOption.path` describes a tree. We flatten
  and ignore `path` while option counts are small.
- **Different codes for the hours and km halves of one entry** — one value applies to both rows
  the entry generates. Worth revisiting if a driving leg genuinely belongs to a different cost
  centre than the work.

---

## Multi-vehicle kilometre allowance

**Status:** deferred (Sep 2026) — needs clarification from Salaxy, and the cases are rare
in practice. Car is implemented and correct; everything below is additional vehicles and
surcharges.

Rendered version: <https://claude.ai/code/artifact/c708ffcb-3445-427b-8420-7d7d4f00c612>

### The constraint that shapes the feature

The rate in production comes from `sideCosts.taxFreeKmAllowance` on Salaxy's
`GET /calculator/yearlyNumbers/{forDate}`. That field is a **single scalar — the own-car
rate**. The other 7 vehicle types and all 7 surcharges have no field and no endpoint.

Salaxy also has only three kilometre row types — `milageOwnCar`, `milageDaily`,
`milageOther` — so there is no per-vehicle row type to map onto.

### 2026 base rate by vehicle

Transcribed from veronmaksajat.fi's 2026 summary. **Verify against
*Verohallinnon päätös matkakustannusten korvausperusteista*** (published each December)
before seeding anything — that decision is the citable source, not the summary site.

| Vehicle | Finnish | snt/km | €/km |
|---|---|---:|---:|
| Car (**the only one the API supplies**) | Auto | 55 | 0,55 |
| Motorboat ≤50 hp | Moottorivene, enintään 50 hv | 97 | 0,97 |
| Motorboat >50 hp | Moottorivene, yli 50 hv | 141 | 1,41 |
| Snowmobile | Moottorikelkka | 134 | 1,34 |
| ATV | Mönkijä | 126 | 1,26 |
| Motorcycle | Moottoripyörä | 42 | 0,42 |
| Moped | Mopo | 23 | 0,23 |
| Other | Muu kulkuneuvo | 13 | 0,13 |

Defaulting an unknown vehicle to the car rate over-reimburses a moped by 32 snt/km and
under-reimburses a snowmobile by 79.

### 2026 car surcharges, additive per kilometre

| Surcharge | Finnish | snt/km | Applies |
|---|---|---:|---|
| Trailer | Perävaunu | +9 | Towed trailer |
| Caravan | Asuntovaunu | +15 | Towed caravan |
| Site cabin | Taukotupa | +28 | Heavy towed cabin or equivalent |
| Heavy cargo | Koneet ja laitteet | +4 | Over 80 kg, or large in size |
| Work dog | Koira | +4 | Transporting a working dog |
| Forest road | Metsäautotie | +12 | Forest road or closed construction site |
| Passenger | Matkustaja | +4 | Per person, where the employer requires it |

```
effective_rate = base(vehicle) + Σ surcharge(code) + passengers × surcharge('passenger')
```

So car + trailer + 2 required passengers = 55 + 9 + (2 × 4) = 72 snt/km.

Separate rule, not a surcharge: an employee with a taxable company-car benefit
(*auton käyttöetu*) paying their own fuel may be reimbursed at most 11 snt/km, fuel only.

### Where the rates should live

Hardcoding is rejected — that is the `0.25` failure mode with more numbers to forget.
Reading everything from the API is impossible.

**Recommended:** year-keyed DB tables seeded from the Verohallinto decision, with the
API's car rate kept as a **staleness canary**. On lookup, compare the API value against
the table's car rate for that year:

- they agree → proceed
- they disagree → the decision changed or the seed is wrong; refuse the mileage export and
  name the figures that disagree
- no table row for that year → refuse, naming the year that needs seeding

This preserves the current posture: mileage export fails loudly rather than quietly
applying a plausible-looking wrong number.

### Schema sketch

| Table | Column | Why |
|---|---|---|
| `km_rates` (new) | `year`, `vehicle`, `rate`, `decision_ref` | One row per vehicle per year; `decision_ref` cites the decision |
| `km_surcharges` (new) | `year`, `code`, `rate`, `per_unit` | `per_unit` marks the passenger row as multiplied by count |
| `time_entries` | `vehicle` | Defaults `'car'` so existing rows keep today's behaviour |
| `time_entries` | `km_surcharge_codes` | Which surcharges were claimed |
| `time_entries` | `km_passengers` | Defaults 0 |
| `time_entries` | `km_rate` | Already exists — becomes the composed *effective* rate |

### Phases, in dependency order

1. **Rate tables and 2026 seed** — migration only, nothing reads them yet.
   *Verify:* every figure checked against the published decision by a second pair of eyes.
2. **Effective-rate computation** — `resolveKmRate(entry, year)` in `backend/lib/salaxy.ts`
   beside the existing lookup, including the API cross-check.
   *Verify:* unit tests for car-only, car+trailer, car+2 passengers, snowmobile, missing year.
3. **Entry columns, defaulted to car** — export switches to `resolveKmRate`, existing rows
   still resolve to the plain car rate.
   *Verify:* an export of existing entries produces byte-identical rows.
4. **Export composition** — row type per vehicle, breakdown written into the row message.
   *Verify:* a snowmobile entry lands at 1,34 with a legible breakdown.
5. **Chat recognition** — vehicle and surcharge vocabulary in the interpreter prompt, both
   languages (*moottorikelkalla*, *perävaunulla*, *kaksi matkustajaa*, *by snowmobile*).
   *Verify:* parser tests per vehicle keyword and passenger count.
6. **Preview and approval UI** — vehicle selector, surcharge checkboxes, passenger count;
   effective rate and breakdown on the approval card.
   *Verify:* a supervisor can see why a claim is 72 snt/km rather than 55.

### Open questions — answer before phase 4

**Which Salaxy row type for a non-car vehicle?** The obvious mapping is car →
`milageOwnCar`, everything else → `milageOther`. But the row type likely drives incomes-register
reporting: the spec's `TransactionCode` enum carries both `kilometreAllowanceTaxExempt` and
`kilometreAllowanceTaxable`. If `milageOther` reports differently this is a compliance
question, not a cosmetic one. **Ask Salaxy directly.** This is the main reason the item is
deferred.

**One composed row, or a row per component?** A single row at 72 snt/km is compact but shows
no derivation. One row per component mirrors how the decision composes and audits cleanly, at
three rows per journey. Breakdown-in-message is the middle path the phases assume.

**Should the app enforce the ceiling?** Paying above the decision's rate makes the excess
taxable income rather than a tax-exempt reimbursement. The app composes the rate itself so it
cannot currently exceed it — but if per-company overrides are ever added, validating against
the table stops a company silently creating taxable income for its employees.
