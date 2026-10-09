# Mongoose Traveller 2e: World Generation Engine Specification

Status: engine instructions plus an audit of the current code. Written 2026-10-08 (CT).
Source of rules: `assets/2eWorldCreation.txt` (the "reference"). Line numbers like `ref:255-267` point into that file.
Scope: the main world of one hex (the reference covers only "the single most important and most travelled world in a star system", ref:207-210), plus the star-mapping rolls that belong to that hex (world occurrence, starport, bases, gas giant, travel zone).

Every rule below comes from the reference. Where the reference is unclear or silent, this spec says so and marks it **AMBIGUOUS** or **ENGINE CONVENTION**. It adds no new rules. The code audit in section 6 is against the working tree on 2026-10-08. `packages/engines` and `rules/` match commit `aeada0eb` (2026-10-08 12:20 CT). `apps/api`, `packages/generation/src/index.ts` and `packages/shared` have uncommitted changes, and those working-tree versions were the ones read.

---

## 1. Conventions

- `1D` = one six-sided die (1-6). `2D` = the sum of two 1D. `D3` = 1-3. `D66` = two 1D read as tens and units (11-66).
- A DM (dice modifier) is added to the roll before the table lookup.
- UWP digits are hexadecimal: 0-9, then A=10 … F=15. The reference adds "G as a digit to describe TL16" (ref:166-168). Above G it is silent. The code continues the eHex sequence (letters I and O are skipped).
- **Lower clamp to 0 (ENGINE CONVENTION, implicit in the reference):** no table in the reference has a negative code, so any result below 0 becomes 0. The reference states the upper ranges explicitly only for Size (0-10, ref:256) and Hydrographics (0-10, ref:467).

## 2. Inputs and outputs

### Inputs
| Input | Meaning |
|---|---|
| `masterSeed` | Universe seed string (default `TravellerMagnus`). |
| `hexKey` | e.g. `Spinward_Marches/1910`. |
| `roll` | Re-roll counter. The seed becomes `masterSeed` if roll = 0, else `${masterSeed}/roll/${roll}` (current code, `apps/api/src/universe/hexes.ts:60-63`). |
| `density` | Optional world-occurrence DM: rift -2, sparse -1, standard 0, dense +1 (ref:52-57). |
| `hzEdge` | Optional temperature DM chosen by the referee: hot edge +4, cold edge -4, none 0 (ref:420-423). |
| `panthalassic` | Optional flag for Atmosphere F worlds. It changes the hydrographics temperature DMs (ref:477-479). The reference gives no roll for it, so it is an input (default false). |

### Outputs (one world)
- `present` (boolean)
- `uwp`: the string `S Z A H P G L - T`, which is starport, size, atmosphere, hydrographics, population, government, law, a hyphen, then tech level. Example `CA6A643-9` (ref:172-184).
- `temperature`: Frozen / Cold / Temperate / Hot / Boiling
- `highport` (boolean), and `bases` as a code string built from M (Military), N (Naval), S (Scout), C (Corsair) (ref:185-187, 1294-1326)
- `gasGiant` (boolean)
- `tradeCodes` (list, from section 4.14)
- `travelZone`: blank/Green, Amber, or Red (ref:190-192, 1327-1343)
- Optional detail: `factions[]` and `culture` (ref:745-917)

Profile line format (ref:172-192): `Name Hex UWP Bases TradeCodes Zone`, e.g. `Cogri 0101 CA6A643-9 N Ri Wa A`.

PBG (population multiplier / belts / gas giant count), belt counts and gas giant counts are **not in the reference**. The reference only defines whether a gas giant is present.

## 3. Deterministic RNG (what the code does now, and recommendations)

What the code does now (`packages/engines/src/core/rng.js`):
- `hashString(str)`: 32-bit FNV-1a. `mulberry32(seed)`: the PRNG, with output in [0,1).
- `setRandomSeed(seed)` sets `masterSeed` and clears `usedNames`. `reseedForHex(hexId)` resets the stream to `mulberry32(hashString(masterSeed + "-" + hexId))`.
- `roll1D() = floor(rng()*6)+1`. `roll2D()` takes two 1D draws. `rollD3() = floor(rng()*3)+1`.
- `generateHex` (`packages/generation/src/index.ts:68-70`) calls `configure(settings)`, then `setRandomSeed(pinned.seed)`, then `reseedForHex(hexKey)`. The top-down orchestrator calls `reseedForHex(hexId)` again (`mgt2e_topdown_generator.js:41-43`), so each hex is independent of build order.
- Names do not use the stream when a hexId is given (`core/names.js:22-33`, which uses a hash of seed+hex+"-name").

Recommendations (no new APIs):
1. Draw the dice in the canonical order in section 4. The reference does not fix a roll order, so this order is an **ENGINE CONVENTION** that makes the test vectors reproducible.
2. Skip the draw whenever the reference assigns a value without a roll (Hydrographics for Size 0-1, and Gov/Law/TL for Population 0). Skipping is deterministic because it depends only on earlier results. Do **not** skip a roll the reference requires: the Atmosphere roll for Size 0 is required.
3. Keep `reseedForHex` per hex. To make later steps independent of earlier ones (for example, adding the temperature roll without shifting every later roll), you can reseed each step with the existing functions: `mulberry32(hashString(masterSeed + "-" + hexKey + "-" + stepName))`. This is optional and changes outputs, so bump `engineVersion` if you adopt it.
4. Do not read roll totals from the trace module. The TL code currently sums `pendingRoll` from `core/trace.js` (`mgt2e_socio_engine.js:2480-2481`). It works because `pendingRoll` is a live ESM binding, but any `tResult`/`tSection` call placed between the roll and that read would zero the total. Keep the roll in a local variable.

## 4. Algorithm: one world, in canonical order

### 4.0 World occurrence (star mapping, ref:45-57)
Roll 1D + density DM. On **4+** a world is present; otherwise the hex is empty. If the hex is empty, stop.

### 4.1 Size (ref:255-305)
`Size = 2D - 2` (range 0-10). No DMs.

| Size | Diameter | Example | Gravity (G) |
|---|---|---|---|
| 0 | < 1,000 km | Asteroid, orbital complex | Negligible |
| 1 | 1,600 km | Triton | 0.05 |
| 2 | 3,200 km | Luna, Europa | 0.15 |
| 3 | 4,800 km | Mercury, Ganymede | 0.25 |
| 4 | 6,400 km | Mars | 0.35 |
| 5 | 8,000 km | | 0.45 |
| 6 | 9,600 km | | 0.7 |
| 7 | 11,200 km | | 0.9 |
| 8 | 12,800 km | Earth | 1.0 |
| 9 | 14,400 km | | 1.25 |
| A | 16,000 km | | 1.4 |

### 4.2 Atmosphere (ref:343-347)
`Atm = 2D - 7 + Size`, then clamp below at 0 (range 0-15). **The reference has no Size-0 or Size-1 exception.** ref:301-305 says such worlds are "much too small to retain a breathable atmosphere", but that is description, not a dice rule. Roll it anyway.

| Code | Composition | Pressure | Gear |
|---|---|---|---|
| 0 | None | 0.00 | Vacc Suit |
| 1 | Trace | 0.001-0.09 | Vacc Suit |
| 2 | Very Thin, Tainted | 0.1-0.42 | Respirator, Filter |
| 3 | Very Thin | 0.1-0.42 | Respirator |
| 4 | Thin, Tainted | 0.43-0.7 | Filter |
| 5 | Thin | 0.43-0.7 | |
| 6 | Standard | 0.71-1.49 | |
| 7 | Standard, Tainted | 0.71-1.49 | Filter |
| 8 | Dense | 1.5-2.49 | |
| 9 | Dense, Tainted | 1.5-2.49 | Filter |
| A | Exotic | Varies | Air Supply |
| B | Corrosive | Varies | Vacc Suit |
| C | Insidious | Varies | Vacc Suit |
| D | Very Dense | 2.5+ | |
| E | Low | 0.5 or less | |
| F | Unusual | Varies | Varies |

### 4.3 Temperature (ref:399-462)
`T = 2D + AtmDM + hzEdge`

| Atmosphere | DM |
|---|---|
| 0, 1 | 0 (day/night swings from roasting to frozen) |
| 2, 3 | -2 |
| 4, 5, E | -1 |
| 6, 7 | 0 |
| 8, 9 | +1 |
| A, D, F | +2 |
| B, C | +6 |

Optional referee DM: hot edge of the habitable zone +4, cold edge -4.

| T | Type | Average | Description |
|---|---|---|---|
| ≤2 | Frozen | ≤ -51° | No liquid water, very dry atmosphere |
| 3-4 | Cold | -51° to 0° | Icy, little liquid water, extensive ice caps |
| 5-9 | Temperate | 0° to 30° | Earth-like |
| 10-11 | Hot | 31° to 80° | Small or no ice caps, little liquid water |
| ≥12 | Boiling | 81°+ | No ice caps, little liquid water |

### 4.4 Hydrographics (ref:464-499)
1. If Size is 0 or 1: Hydro = 0. Make no roll.
2. Otherwise: `Hydro = 2D - 7 + Atm + DMs`, where
   - Atm 0, 1, or A-F: DM -4
   - Temperature DMs, applied only if Atm is not D and not a Panthalassic F: Hot -2, Boiling -6.
     **AMBIGUOUS:** the reference does not say how to decide that an F atmosphere is Panthalassic. Use the `panthalassic` input (default false, so the DM applies).
3. Clamp to 0-10.

| Code | Percentage | Description |
|---|---|---|
| 0 | 0-5% | Desert world |
| 1 | 6-15% | Dry world |
| 2 | 16-25% | A few small seas |
| 3 | 26-35% | Small seas and oceans |
| 4 | 36-45% | Wet world |
| 5 | 46-55% | A large ocean |
| 6 | 56-65% | Large oceans |
| 7 | 66-75% | Earth-like world |
| 8 | 76-85% | Only a few islands and archipelagos |
| 9 | 86-95% | Almost entirely water |
| A | 96-100% | Waterworld |

### 4.5 Population (ref:501-524)
`Pop = 2D - 2` (range 0-10). The referee may optionally raise a world to B or C. The reference gives no dice rule for that, so it is a manual override only.

| Code | Inhabitants | Code | Inhabitants |
|---|---|---|---|
| 0 | None | 7 | Tens of millions |
| 1 | Few (1+) | 8 | Hundreds of millions |
| 2 | Hundreds | 9 | Billions |
| 3 | Thousands | A | Tens of billions |
| 4 | Tens of thousands | B | Hundreds of billions |
| 5 | Hundreds of thousands | C | Trillions |
| 6 | Millions | | |

### 4.6 Population 0 rule (ref:533-534)
If Pop = 0, then Gov = 0, Law = 0, TL = 0. Skip rolls 4.7, 4.8 and 4.10.

### 4.7 Government (ref:535-541)
`Gov = 2D - 7 + Pop`, clamp below at 0 (maximum 15).

| Code | Type | Example contraband |
|---|---|---|
| 0 | None | None |
| 1 | Company/Corporation | Weapons, Drugs, Travellers |
| 2 | Participating Democracy | Drugs |
| 3 | Self-Perpetuating Oligarchy | Technology, Weapons, Travellers |
| 4 | Representative Democracy | Drugs, Weapons, Psionics |
| 5 | Feudal Technocracy | Technology, Weapons, Computers |
| 6 | Captive Government | Weapons, Technology, Travellers |
| 7 | Balkanisation | Varies |
| 8 | Civil Service Bureaucracy | Drugs, Weapons |
| 9 | Impersonal Bureaucracy | Technology, Weapons, Drugs, Travellers, Psionics |
| A | Charismatic Dictator | None |
| B | Non-Charismatic Leader | Weapons, Technology, Computers |
| C | Charismatic Oligarchy | Weapons |
| D | Religious Dictatorship | Varies |
| E | Religious Autocracy | Varies |
| F | Totalitarian Oligarchy | Varies |

### 4.8 Law Level (ref:919-1004)
`Law = 2D - 7 + Gov`, clamp below at 0.
**AMBIGUOUS:** the Law table stops at "9+" and the reference sets no upper limit. Gov F with a roll of 12 gives 20. The code clamps to F (15) when it writes the UWP (`mgt2e_socio_engine.js:2630`). Make the choice explicit: either clamp to 15 or write eHex.

| Law | Weapons banned | Armour |
|---|---|---|
| 0 | No restrictions | |
| 1 | Poison gas, explosives, undetectable weapons, WMD | Battle dress |
| 2 | Portable energy and laser weapons | Combat armour |
| 3 | Military weapons | Flak |
| 4 | Light assault weapons and SMGs | Cloth |
| 5 | Personal concealable weapons | Mesh |
| 6 | All firearms except shotguns & stunners | |
| 7 | Shotguns | |
| 8 | All bladed weapons, stunners | All visible armour |
| 9+ | All weapons | All armour |

### 4.9 Starport (ref:1094-1125)
`S = 2D + DM`, where the DM is +1 for Pop 8-9, +2 for Pop 10+, -1 for Pop 3-4, and -2 for Pop 2 or less (including 0).

| 2D+DM | ≤2 | 3-4 | 5-6 | 7-8 | 9-10 | 11+ |
|---|---|---|---|---|---|---|
| Class | X | E | D | C | B | A |

### 4.10 Tech Level (ref:1224-1267)
`TL = 1D + DMs`, clamp below at 0. If Pop = 0, TL = 0 and no roll is made (4.6).

**Note on the source table:** the text extraction of the Tech Level table (ref:1249-1266) lost its column alignment. The table below places each value by column position. That placement is consistent across all rows: Atmosphere 0-3 and A-F always +1, and Size 0-4 always present. The resulting starport column (A +6, B +4, C +2, X -4) has **no entries for D or E**.

| Code | Starport | Size | Atm | Hydro | Pop | Gov |
|---|---|---|---|---|---|---|
| 0 | | +2 | +1 | +1 | | +1 |
| 1 | | +2 | +1 | | +1 | |
| 2 | | +1 | +1 | | +1 | |
| 3 | | +1 | +1 | | +1 | |
| 4 | | +1 | | | +1 | |
| 5 | | | | | +1 | +1 |
| 6 | | | | | | |
| 7 | | | | | | +2 |
| 8 | | | | | +1 | |
| 9 | | | | +1 | +2 | |
| A | +6 | | +1 | +2 | +4 | |
| B | +4 | | +1 | | | |
| C | +2 | | +1 | | | |
| D | | | +1 | | | -2 |
| E | | | +1 | | | -2 |
| F | | | +1 | | | |
| X | -4 | | | | | |

Population B and C have **no** TL DM, and Government F has **no** TL DM.

Environmental limits (ref:1269-1283). These are **not** a clamp: "a world can have a Tech Level lower than this limit but the population cannot maintain or repair their life support systems and are likely doomed". Record a flag (e.g. `belowEnvMinimum`) and leave TL unchanged.

| Atmosphere | Minimum TL |
|---|---|
| 0, 1 | 8 |
| 2, 3 | 5 |
| 4, 7, 9 | 3 |
| A | 8 |
| B | 9 |
| C | 10 |
| D, E | 5 |
| F | 8 |
| 5, 6, 8 | none listed |

### 4.11 Highport (ref:1127-1158, 1192-1194)
Roll this only for the classes listed: A 6+, B 8+, C 10+, D 12+. E and X have no highport.
`2D + DM`: +1 if TL 9-11, +2 if TL 12+, +1 if Pop 9+, -1 if Pop 6 or less.

### 4.12 Bases (ref:1127-1158, 1195-1200)
"Roll 2D for each base type listed" for the starport class:

| Class | Quality | Berthing | Fuel | Facilities | Military | Naval | Scout | Corsair |
|---|---|---|---|---|---|---|---|---|
| A | Excellent | 1D×Cr1000 | Refined | Shipyard (all), Repair | 8+ | 8+ | 10+ | — |
| B | Good | 1D×Cr500 | Refined | Shipyard (spacecraft), Repair | 8+ | 8+ | 9+ | — |
| C | Routine | 1D×Cr100 | Unrefined | Shipyard (small craft), Repair | 10+ | — | 9+ | — |
| D | Poor | 1D×Cr10 | Unrefined | Limited Repair | — | — | 8+ | 12+ |
| E | Frontier | 0 | None | None | — | — | — | 10+ |
| X | No starport | 0 | None | None | — | — | — | 10+ |

Corsair DM: +2 if Law 0, -2 if Law 2+. Canonical roll order (ENGINE CONVENTION): Military, Naval, Scout, Corsair. Base codes are M, N, S, C. Depot (D) and Way Station (W) are described (ref:1299-1305, 1324-1326) but have no roll in the reference, so they are manual only.

### 4.13 Gas giant (ref:78-80)
Roll 2D once. On **10+ there is no gas giant**; on 2-9 a gas giant is present. Roll it **once only**.

### 4.14 Trade codes (ref:1345-1367)
A world gets every code whose requirements it meets in full. A blank cell means no requirement.

| Code | Size | Atm | Hydro | Pop | Gov | Law | TL |
|---|---|---|---|---|---|---|---|
| Ag | | 4-9 | 4-8 | 5-7 | | | |
| As | 0 | 0 | 0 | | | | |
| Ba | | | | 0 | 0 | 0 | |
| De | | 2-9 | 0 | | | | |
| Fl | | 10+ | 1+ | | | | |
| Ga | 6-8 | 5, 6, 8 | 5-7 | | | | |
| Hi | | | | 9+ | | | |
| Ht | | | | | | | 12+ |
| Ic | | 0-1 | 1+ | | | | |
| In | | 0-2, 4, 7, 9-12 | | 9+ | | | |
| Lo | | | | 1-3 | | | |
| Lt | | | | **1+** | | | 5- |
| Na | | 0-3 | 0-3 | 6+ | | | |
| Ni | | | | 4-6 | | | |
| Po | | 2-5 | 0-3 | | | | |
| Ri | | 6, 8 | | 6-8 | 4-9 | | |
| Va | | 0 | | | | | |
| Wa | | 3-9, 13+ | 10+ | | | | |

The column alignment was also lost in the extraction (ref:1346-1367). The placement above is the only one consistent with the column order and with the descriptions in ref:1375-1405. Satellite (`Sa`) is **not** in the reference.

### 4.15 Travel zone (ref:95-107, 1327-1343)
"A world with Atmosphere 10+, a Government 0, 7 or 10 and Law Level 0 or 9+ should be considered for Amber status. Red codes are applied at the discretion of the referee."
- **AMBIGUOUS:** the sentence can mean that all three conditions are required (AND) or that each one qualifies on its own (ANY). Expose it as a setting `amberRule: 'all' | 'any'`. In both readings the result is "consider for Amber". Do not apply Red automatically: Red is never set by a dice or table rule.
- Output `A` for Amber, `R` for Red, and blank for Green/unclassified.

### 4.16 Optional detail: factions and culture (ref:745-917)
- Number of factions = `D3 + DM`: +1 if Gov 0 or 7, -1 if Gov 10+. For each faction, take a Government type from the Government table. **AMBIGUOUS:** the reference does not say whether to roll 2D-7+Pop again. Then roll 2D for strength: 2-3 Obscure, 4-5 Fringe, 6-7 Minor, 8-9 Notable, 10-11 Significant, 12 Overwhelming. A faction with the same or a similar government to the ruling one is a splinter faction; one radically different is a rebel group.
- Culture: roll D66 on the Cultural Differences table (ref:793-917). 25 = roll again once, 26 = roll again twice. The reference does not specify how many rolls to make; the plain reading is one.

### 4.17 UWP assembly
`uwp = Starport + hex(Size) + hex(Atm) + hex(Hydro) + hex(Pop) + hex(Gov) + hex(Law) + "-" + hex(TL)`
Bases string = the concatenated M/N/S/C letters (a highport is a facility, not a base code). Trade codes are separated by spaces. Zone = A, R or blank.

## 5. Test vectors (fixed dice, computed strictly by the rules above)

Dice are listed in canonical order. Skipped rolls are not listed. These were checked with a standalone reference implementation.

| # | Dice (in order) | Result |
|---|---|---|
| V1 | Size 10, Atm 5, Temp 7, Hydro 8, Pop 8, Gov 6, Law 9, Port 7, TL 4, Highport 9, Mil 11, Scout 8, GG 6 | `C867657-7`, Temperate (7+0), highport no (9-1=8 <10), bases **M**, gas giant yes, **Ag Ga Ni Ri**, zone none |
| V2 | Size 2, Atm 9, Temp 6, (Hydro skipped), Pop 5, Gov 7, Law 4, Port 8, TL 3, Highport 7, Mil 5, Scout 10, GG 11 | `C020330-A`, Cold (6-2=4), highport no, bases **S**, no gas giant, **De Lo Po**, Amber: any=yes (Law 0), all=no |
| V3 | Size 12, Atm 12, Temp 8, Hydro 9, Pop 2, (Gov/Law/TL skipped), Port 5, Corsair 8, GG 10 | `EAFA000-0`, Hot (8+2=10), hydro 9-7+15-4-2=11→A, bases **C** (8+2=10), no gas giant, **Ba Fl Wa**, Amber: any=yes, all=yes |
| V4 | Size 9, Atm 7, Temp 7, Hydro 5, Pop 12, Gov 12, Law 2, Port 3, TL 2, Highport 11, Scout 7, Corsair 12, GG 4 | `D775AFA-6` (TL = 2 + Pop A +4; no DM for Port D or Gov F), highport yes (11+1=12), no bases (corsair 12-2=10 <12), gas giant yes, **Hi In**, Amber: any=yes (Law A), all=no |
| V5 | Size 6, Atm 4, Temp 3, Hydro 11, Pop 4, Gov 3, Law 6, Port 4, TL 1, Corsair 9, GG 12 | `X411200-1` (TL 1-4+1+1+1+1=1; below env minimum 8 → flag only), Cold, bases **C** (9+2=11), no gas giant, **Ic Lo Lt**, Amber: any=yes, all=no; **no Red** |

What the current code gives for the same dice (ignoring its different roll order):
- V2: `C000330-A`, **As Lo Va**, because Size 0 forces Atm 0.
- V3: **Ba Fl Lt Wa**, because Lt is given to Pop 0.
- V4: `D775AFA-5`, **Hi In Lt**, because of Starport D +1 and Gov F -2.
- V5: zone **Red**, because of the automatic Red for starport X.

## 6. Current implementation audit

### 6.1 Which code runs
- `packages/generation/src/index.ts:63-113` `generateHex`. For edition `MgT2E` it calls `buildOne(state, hexKey)` (`packages/engines/src/mgt2e_build.js:79-90`). `buildStage` (lines 46-53) picks one of three paths:
  - **flesh**: the state already carries a profile (`t5Data`, etc.). Runs `generateMgT2ESystemTopDown(hexKey, profile, t5Socio)`, and the main-world UWP is **inherited, not rolled** (`mgt2e_topdown_generator.js:63-85`).
  - **generate**: no profile (`{type:'SYSTEM_PRESENT'}`). Runs `generateMgT2ESystemTopDown(hexKey, null)`, which calls `generateMainworldUWP` (`mgt2e_socio_engine.js:2225-2670`) and then `generateCoreSocial`. **This is where the reference procedure runs.**
  - **society**: only extends an existing system.
- Live Worker:
  - Truth/sector builds (`apps/api/src/jobs/truth_build.ts` → `buildSectorSlice`) hard-code `edition: 'MgT2E', mode: 'flesh'` (`index.ts:191-193`) on canonical TSV rows, so **no UWP is rolled** for canonical sectors.
  - Builder generation (`apps/api/src/routes/builder.ts:234-276`, `jobs/generate_queue.ts:52-62`) passes `summary: {type:'SYSTEM_PRESENT'}` and runs the **generate** path. `builderPairReady` (`packages/shared/src/schemas/builder.ts:43-45`) allows only `MgT2E/top-down` and `AoW/bottom-up`, and the edition comes from the request.
  - `/generate/preview` (`routes/generate.ts:46-56`) uses the request's edition and inputs.
- Rule table: `rules/mgt2e_data.js` (copied verbatim into `packages/engines/src/generated/rules/mgt2e_data.js`). The main-world code reads `starport`, `bases`, `tradeCodes`, `techLevel.environmentalMinimums`. **It does not read** `techLevel.modifiers`: those DMs are hard-coded in `mgt2e_socio_engine.js:2442-2472`.

### 6.2 Deviations, most important first
| # | Rule (ref) | Code location | What the code does | Fix |
|---|---|---|---|---|
| 1 | Gas giant: one 2D roll, absent on 10+ (ref:78-80) | `mgt2e_socio_engine.js:2588-2589` and `mgt2e_stellar_engine.js:893-894` | Rolls twice and ORs the results: `let ggExists = ggRoll <= 9 \|\| (mainworldBase && mainworldBase.gasGiant);`. Presence is 35/36 ≈ 97% (measured 96.9% over 1,500 systems) against 30/36 ≈ 83%. | Roll presence once. In `generateSystemInventory`, use `mainworldBase.gasGiant` when it is defined instead of rolling again. |
| 2 | Lt requires Pop 1+ (ref:1361) | `mgt2e_socio_engine.js:112`; data `rules/mgt2e_data.js:140` | `check('Lt', tl <= cLt.maxTl, …)`. Every Pop 0 world (TL 0) gets Lt (541/541 in a 20k sample). | Add `pop >= 1` (add `minPop: 1` to the data). |
| 3 | TL starport DMs A+6 B+4 C+2 X-4 only (ref:1261-1267) | `mgt2e_socio_engine.js:2446`; data `rules/mgt2e_data.js:58` | `else if (starport === 'D' \|\| starport === 'E') tDM('Starport D/E', 1);`. The data also has `"F": 1`. | Remove the D/E branch. Remove D, E and F from `techLevel.modifiers.starport`. |
| 4 | Atmosphere 2D-7+Size for every size (ref:343-347) | `mgt2e_socio_engine.js:2257-2266` | `if (size > 0) {…} else { tSkip('Size 0 forces Atm 0'); }`. Size 0 always gets Atm 0; by the reference, 15/36 of them should get Atm 1-5. The skipped draw also shifts every later roll. | Always roll. Clamp below at 0. |
| 5 | Temperature roll 2D + Atm DMs (ref:399-462) | Not in `generateMainworldUWP` (searched for `Temperature`/`tempBand` in `mgt2e_socio_engine.js`) | **Missing.** The main world's temperature is later derived from orbit/HZCO deviation (`mgt2e_world_engine.js:229-245, 761`), which is a different method. `getAtmDM` (`mgt2e_stellar_engine.js:1011-1018`) matches the reference DMs but is used only to back-calculate the orbit, with `tempBand` undefined, so it defaults to Temperate (lines 1036, 1054). | Roll temperature after Atmosphere and store `tempBand`. Pass it to orbit placement (which already supports it). |
| 6 | Hydro Hot -2 / Boiling -6 unless Atm D or Panthalassic F (ref:477-481) | `mgt2e_socio_engine.js:2271-2281` | **Missing** for the main world. Only Atm DMs are applied: `let rawHydro = hydroRoll - 7 + atm + hydroDM;`. Subordinate worlds apply the DMs (`mgt2e_world_engine.js:1429-1430`) but only exclude `atmCode !== 13`, so F is never treated as Panthalassic. | After 4.3, apply the temperature DMs with the D/Panthalassic-F exception. |
| 7 | TL Gov DMs: 0 +1, 5 +1, 7 +2, D -2, E -2 (ref:1251-1265) | `mgt2e_socio_engine.js:2472`; data `:63` | `else if (gov >= 13) tDM('Government D+', -2);` also hits Gov F (reachable: Pop A, roll 12). | Use `gov === 13 \|\| gov === 14`. Remove `"15": -2` from the data. |
| 8 | Highport DM -1 if Pop 6- (ref:1193-1194) | `mgt2e_socio_engine.js:1741-1745` (extended socio) | Applies Pop 9+ +1, TL 9-11 +1 and TL 12+ +2, but **not Pop ≤6 -1**. | Add `if (base.pop <= 6) hxScore -= 1;`. |
| 9 | Bases appear in the world profile (ref:185-187) | `packages/generation/src/index.ts:170`; booleans set at `mgt2e_socio_engine.js:2525-2562` | `navalBase/scoutBase/militaryBase/corsairBase` are never turned into a string, so `chartEntry` writes `bases: ''` for every generated hex (0 of 300 had a string; 139 had at least one base flag). | Build `bases` (M/N/S/C) in `generateMainworldUWP` and store it on the main world. |
| 10 | Factions = D3 + DM (ref:754-756) | `mgt2e_socio_engine.js:880-891` | `numExternalFactions = totalFactions - 1`, so it generates one fewer faction than the reference. Same-government check uses strict equality (ref also counts "similar"). | Generate `max(0, D3+DM)` factions. |
| 11 | UWP fixed once rolled | lunar main-world demotion, `mgt2e_stellar_engine.js:1561-1616, ~1727` (root cause not fully traced) | Measured: in 5 of 800 systems a lunar main world's final UWP differs from the rolled one (e.g. `C567000-0`→`C500000-0`, `D977000-0`→`D98A000-0`). All 5 were Pop 0. | Lock size/atm/hydro on the lunar main-world copy as is done for `type==='Mainworld'` bodies, and add an assertion that the rolled UWP equals the final UWP. |
| 12 | TL Pop DMs stop at A (ref:1261-1263) | `mgt2e_socio_engine.js:2467`; data `:62` | `else if (pop >= 10) tDM('Population 10+', 4);` also gives +4 to B-F. Only reachable through `generationPopMod`/manual. | `pop === 10`. |

### 6.3 Extras (behaviour beyond the reference)
- Starport X ⇒ automatic **Red** (`mgt2e_socio_engine.js:2613-2615`). The reference leaves Red to the referee. Measured 5.8% Red worlds. Remove it, or put it behind an explicit opt-in setting.
- `Sa` (Satellite) trade code (`mgt2e_socio_engine.js:140`, and `mgt2e_stellar_engine.js:1616, 1731`). It is not in the reference, and 27% of generated main worlds carry it.
- Native-sophont rules: Pop floor 6, Starport DM-2, size/atm/hydro TL DMs skipped (`mgt2e_socio_engine.js:2318-2322, 2369-2372, 2449`; data `:52, :69-72`).
- Settings knobs: `generationPopMod/PopMax/StarportMod/StarportMax/TlMod/TlMax/UseTlFloor/NoTravelZones/PopCheckFrequency` (`core/settings.js`). They are neutral at their defaults (`apps/api/src/universe/defaults.ts`). Pop-check-frequency forces Pop 0 and caps the starport at E (`mgt2e_socio_engine.js:2313-2316, 2411-2414`).
- The cultural quirk count is `round(culD/4)` (`mgt2e_socio_engine.js:1390`), which is a different procedure from the reference's D66 roll.
- PBG / belt counts / gas giant counts come from WBH-style inventory (`mgt2e_stellar_engine.js:864-905`). None of it is in the reference.

### 6.4 Matches
Size 2D-2 (`:2248-2251`). Atm lower clamp. Hydro Size 0-1 → 0 (`:2271`). Hydro 2D-7+Atm with DM-4 for 0, 1, A-F (`:2272-2280`). Hydro clamp 0-10 (`:2280, :2627`). Pop 2D-2 (`:2309-2312`). Pop 0 → Gov/Law/TL 0 (`:2419, :2517-2519`). Gov 2D-7+Pop (`:2421-2425`). Law 2D-7+Gov (`:2430-2434`). Starport DMs and class table (`rules/mgt2e_data.js:38-51`, `:2383-2393`). TL Size/Atm/Hydro DMs (`:2451-2460`). TL Pop DMs 1-9, A (`:2464-2467`). TL lower clamp (`:2482`). Environmental minimums: data matches, no clamp by default (`:2501-2512`). Military/Naval/Scout/Corsair targets and Corsair Law DMs (`rules/mgt2e_data.js:75-95`, `:2528-2562`). Trade codes Ag, As, Ba, De, Fl, Ga, Hi, Ht, Ic, In, Lo, Na, Ni, Po, Ri, Va, Wa (`rules/mgt2e_data.js:128-146`). UWP format (`:2633`). Faction strength table (`:895-901`). Faction DMs (`:883-884`).

Order: the code rolls Starport before Gov/Law (`:2353-2436`). The reference describes Gov → Law → Starport. The starport depends only on Pop, so the distributions are the same; only the dice stream differs.

### 6.5 Ambiguities that need an owner decision
1. Amber rule: AND or ANY (code: AND, `:2607`).
2. Law above F (code: clamps at output).
3. How to mark F as Panthalassic.
4. How a faction's government is rolled.
5. Number of culture rolls.

### 6.6 World occurrence (ref:45-57)
**Missing** on the Cloudflare path: hexes come from canonical TSV rows or from the user's selection in the builder. The legacy `js/macro_orchestrator.js:526-541` `autoPopulate(chance)` rolls `roll1D() <= chance` with 2/3/4 for sparse/standard/dense, which is equivalent to 4+ with DM -1/0/+1. It has no rift (DM-2 → 1/6) option.

### 6.7 Legacy `js/` copies
`js/mgt2e_socio_engine.js` contains the same deviations: Lt at :119, Size 0 atmosphere at :2273, Starport D/E at :2454, Gov D+ at :2480, gas giant at :2597. Apply the same fixes if hex_map.html is still used.

## 7. Implementation checklist (owners in `packages/engines/src`)

| Step | Owner function | Action |
|---|---|---|
| 4.0 Occurrence | new helper next to `shouldGeneratePopulation` in `core/rng.js`, or a caller in `packages/generation` | Add 1D+density ≥4 if automatic population is wanted on the Worker. |
| 4.1 Size | `mgt2e_socio_engine.js` `generateMainworldUWP` | Keep. |
| 4.2 Atmosphere | `generateMainworldUWP` | Remove the Size-0 shortcut. |
| 4.3 Temperature | `generateMainworldUWP` (new section after Atmosphere) | Add a 2D roll with the Atm DMs and `hzEdge`. Store `tempBand`, which `allocateOrbits`/`isMainworldInHZ` already read. |
| 4.4 Hydrographics | `generateMainworldUWP` | Add the Hot/Boiling DMs with the D / Panthalassic-F exception. Align `mgt2e_world_engine.js:1429-1430`. |
| 4.5-4.8 Pop/Gov/Law | `generateMainworldUWP` | Keep. Decide the Law > F policy. |
| 4.9 Starport | `generateMainworldUWP` | Keep (optionally move after Law to match the reference order). |
| 4.10 TL | `generateMainworldUWP` | Read DMs from `MgT2EData.techLevel.modifiers` (after fixing the data: no D/E/F starport, Pop B+ none, Gov F none). Use a local roll variable, not `pendingRoll`. |
| 4.11 Highport | move from `generateExtendedSocioeconomics` (`:1731-1753`) to `generateMainworldUWP`, or fix it in place | Add Pop ≤6 DM-1. |
| 4.12 Bases | `generateMainworldUWP` | Keep the rolls. Emit a `bases` string. |
| 4.13 Gas giant | `generateMainworldUWP` (roll) + `mgt2e_stellar_engine.js` `generateSystemInventory` (consume) | Roll once only. |
| 4.14 Trade codes | `calculateMgT2ETradeCodes` + `rules/mgt2e_data.js` `tradeCodes` | Add Lt Pop 1+. Move `Sa` behind a non-reference flag. |
| 4.15 Travel zone | `generateMainworldUWP` + `rules/mgt2e_data.js` `travelZones` | Add the `amberRule` setting. Remove automatic Red for X. |
| 4.16 Factions/culture | `generateExtendedSocioeconomics` | Use D3+DM factions. Make the culture roll count explicit. |
| Output | `packages/generation/src/index.ts` `chartEntry` | Make sure the generated `bases` string reaches the index entry. |
| Regression | new unit tests in `packages/engines` | Use the section 5 vectors with an injected dice sequence, plus distribution checks: P(GG)≈30/36, P(Lt\|Pop0)=0, P(Atm>0\|Size0)≈15/36. |

Bump `engineVersion` when these changes ship, because outputs for existing seeds will change.
