# Roadmap

Deferred and planned work. Each item records why it is not being built yet, so the
decision does not have to be rediscovered.

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
