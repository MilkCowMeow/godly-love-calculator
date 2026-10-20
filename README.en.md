<div align="center">

<img src="docs/assets/game-icon.png" width="88" alt="Godly Love">

# 💚 Godly Love
### Character & Event Catalog Four-Member Team Damage Calculator

[![GitHub Pages](https://img.shields.io/badge/GitHub_Pages-Open_website-193b34?logo=github)](https://milkcowmeow.github.io/godly-love-calculator/)
![Browser based](https://img.shields.io/badge/Runtime-Client_side-a1814a)
![Offline ready](https://img.shields.io/badge/Offline-Supported-678969)

[简体中文](README.md) **English**

[🧮 Damage Calculator](https://milkcowmeow.github.io/godly-love-calculator/) [📖 Character Catalog](https://milkcowmeow.github.io/godly-love-calculator/catalog.html)

</div>

## ✨ About

An unofficial reference and calculation project for **Godly Love** (《神明恋爱放送中》). It combines a readable character/event catalog with a continuous-battle calculator implemented from the local client's configurations and native methods.

The two pages link to each other through their top navigation. Calculations run in your browser; no sign-in or installation is required. The application interface is currently in Simplified Chinese.

Card credits and portraits follow each card's native character configuration, preserving both solo cards and two-character cards. Rebuild the catalog with `python scripts/build_catalog.py`; the [attribution audit](evidence/card_character_attribution.md) records the mapping.

The catalog contains 192 cards, including 88 R cards hidden by default. Enable **显示 R 卡** or choose R in the rarity selector to reveal them. The selectors support SSR/SR/R and both individual characters and couples.

Data synchronized on 20 October 2026 with `catalog_014774`: C02_SSR_006 heals for 8% of caster max HP and has a 4-turn ultimate cooldown. Built-in resistance is 10%; Trial boss/companion status resistance is 10%/5%. Current event dates and both pages are synchronized. See the [update audit](evidence/client_update_014774.md).

## 🧮 Damage Calculator

| Feature | Details |
|---|---|
| 👥 Four-member teams | Choose each card, level, star rank, and optional base-stat overrides; duplicate copies of the same card are disallowed |
| 📊 Round table | Per-member damage, row subtotals, cumulative damage, and team totals |
| 🎬 Event log | Inspect skills, assists, counters, statuses, and damage in execution order |
| 🎯 Target presets | Original enemy setups for Trial Floors 1–50, defaulting to Floor 50; an unlimited-HP training dummy |
| 🕹️ Action policies | Game AI, basic only, ultimate priority, or wait; optional per-row overrides |
| 🎲 Random simulations | Reproducible single battles or means over 32/128/256 independent battles |
| 💾 Team management | Local browser saves, JSON import/export, and CSV damage-table export |
| 💡 Help tooltips | Hover or focus the circled question marks beside calculation mode and seed |
| 🧑‍🎨 Custom characters | Build independent stats, growth, active skills and conditional passives; save, edit, duplicate, and add them to a team |
| 🎨 Five themes | Jade, mist blue, plum, warm sand, and midnight; consistent controls and dialogs with a remembered preference |
| 📐 Combat mechanics | Twelve sections on stats, scheduling, penetration, hits, statuses, healing and reporting, with offline LaTeX formulas |

![Calculator](docs/assets/calculator-preview.jpg)

### ⏱️ What does a table row mean?

The game schedules individual actors using speed and action gauges. Each table row collects events until every surviving team member has completed at least one new main action. Faster members may act more than once. Assists, counters, and damage over time belong to the row in which they occur. Row boundaries do not reset statuses, cooldowns, or gauges.

Damage totals use post-shield calculated damage and retain overkill. Actual HP loss is additionally constrained by remaining HP and survival effects. Rows after a battle ends do not generate more damage.

### 🎯 Targets

- **Trial Floors 1–50:** use the small arrow beside the Trial button to select a floor. Each floor loads its original enemy levels, boss, companions, skills, and AI. Floor 50 is the default, retaining 《烟光迷离》 and 《最佳调味》. Companions can be disabled for a boss-only comparison. Saved teams and exported plans retain the selected floor.
- **Training dummy:** unlimited HP, no active attacks or newly applied effects, but it can receive statuses. Its reference maximum HP supports percentage-based skills while its HP ratio remains 100%. Speed controls its status-tick timing.

### 🧑‍🎨 Custom characters

Open **Custom characters** or create a character from the card picker. Base stats refer to a chosen reference level at zero stars, with optional per-level and per-star growth. Configure two active skills, attack/defence/HP scaling, targets, cooldowns, critical bonuses, penetration, and status/heal/shield/gauge/cleanse/dispel effects. Conditional passives can trigger at battle start, before/after a turn, after a skill, or after receiving one.

Definitions stay in the current browser. Exported team plans include the custom characters they use, so they can be imported on another device. Conflicting definitions receive a new ID rather than replacing local characters. Custom characters use the existing combat resolver; unsupported configurations still stop with an explicit error.

### 🎲 Single battles, averages, and seeds

- **Single battle:** samples a complete random battle.
- **Multiple-battle mean:** maintains each battle independently, then averages its output. Fractional action counts are cross-battle means.
- **Seed:** fixes the random sequence. The same setup, mode, sample count, and seed reproduce the same result.

## 📖 Character & Event Catalog

- 🖼️ Card art, thumbnails, and available future/pre-release artwork.
- ⚔️ Skills, elements, roles, and contextual status explanations.
- 🧑‍🤝‍🧑 Character portraits, full illustrations, and profiles.
- 🎪 Event banners, related cards, and verifiable schedule information.
- 🔎 Search and filters with desktop/mobile layouts.

![Catalog](docs/assets/catalog-preview.jpg)

## 🧪 Data & Verification

| Item | Status |
|---|---|
| 📦 Client version | `1.0.1.014517` |
| 🗓️ Data reviewed | `2026-10-16` |
| 🃏 Calculator dataset | 192 cards, 586 related skills, 97 statuses, 50 Trial floors |
| 🧩 Unit checks | Scalar damage, configuration parsing, statuses, scheduling, complex effects, and AI |
| 🔁 Continuous simulations | 288 mixed-team scenarios plus damage-total conservation checks |
| 🖥️ Interface checks | Desktop, 390px mobile, cross-page navigation, and worker-based calculation |
| 🎞️ Community video review | Key frames and old/new client configurations checked; [review notes in Chinese](evidence/community_video_review.md) |
| 🎮 Native client comparison | MuMu Trial Floor 50: [15 damage samples plus stats, stacking, and DOT values checked](evidence/native_client_comparison.md), using a local data service |

**One explicit configuration correction:** on 2026-10-18, the unmodified APK and native dispatch confirmed that 《誓约束缚》's basic skill places the random-application function name in its status-ID field. Following the user's explicit choice, the calculator corrects this exact row to use the existing random-application function, preserving the source data, 75% base probability, four candidates and one-turn duration. The card can now be simulated; see the [audit and correction rationale](evidence/random_add_status_audit.md). This does not imply that the unmodified client behaves identically, or that a pre-release card has launched.

Native-method/configuration audit summaries are in [`evidence/`](evidence/). This client comparison exposed and fixed stat-precision and early-rounding issues. Full character-by-character, turn-by-turn verification using an official-server account has not been completed.

## 🚀 Local Use & Development

### 📂 Open directly

Download the repository and open `docs/index.html` or `docs/catalog.html` in a modern browser. Both files embed their required data and visual assets for offline use.

### 🛠️ Edit the calculator

Use Python 3 to build and Node.js to pre-render LaTeX formulas and run checks. KaTeX is a build-time dependency; published pages embed the rendered formulas and fonts without a CDN dependency.

```bash
npm ci --ignore-scripts
python scripts/build_calculator.py
python scripts/run_tests.py
```

The builder retains embedded data, images, and fonts from the published HTML and combines the modules in `src/calculator/`. Maintain the font resources when expanding their character coverage.

The mechanics text lives in `src/calculator/mechanics.html`. Its claim-by-claim evidence index, [`evidence/mechanics_claims.json`](evidence/mechanics_claims.json), stays in the repository rather than the page. Checks cover evidence anchors, formula compilation, numerical examples, and synchronization of card credits and images. Both tools contain 192 cards; usable images are synchronized for 86 of the 88 R cards.

```text
docs/                 🌐 GitHub Pages site and offline HTML
src/calculator/       🧮 Calculator UI and battle interpreter
src/catalog/          📖 Catalog interface source
scripts/              🛠️ Portable build and test helpers
tests/                🧪 Mechanic and continuous-battle checks
evidence/             🔬 Native-method audit summaries
```

### ☁️ GitHub Pages

The publishing source is `/docs` on the `main` branch, with `.nojekyll` included. Subsequent pushes redeploy the site at the same public URLs.

## 🤝 Feedback & Credits

Please report issues through [GitHub Issues](https://github.com/MilkCowMeow/godly-love-calculator/issues). Mechanic reports are most useful with card IDs, levels/star ranks, both sides' stats, skill order, and observed damage. Exported calculator JSON helps reproduce a setup.

The team-selection/round-table layout was inspired by the [NU: Carnival damage calculator](https://linecross.github.io/nuCarnivalAttackCalculator/Main.html). Battle rules are implemented from Godly Love's own data and native methods.

Game names, characters, artwork, and trademarks belong to their respective rights holders. This is an unofficial fan reference tool and is not affiliated with or endorsed by the game developers, publisher, or EROLABS.

## Healing and combat reports

The round table now switches between damage, skill/follow-up damage, status damage, healing throughput, applied shields and actual HP damage taken. Click healing or shield values for recipient breakdowns. Healing values display effective recovery (overheal); chart coordinates use their sum. Prevented healing is tracked separately and excluded from throughput. Both recovery and overheal retain their source and recipient. Periodic healing is attributed to its original status caster.

Starting HP is configurable in member details. Eight independent charts are automatically generated for damage, HP damage taken, healing throughput, healing throughput received, shields applied, shields received, shield absorption and remaining HP. Filter metric groups, toggle individual characters, switch per-round/cumulative values, inspect points and expand numerical tables. HP remains an end-of-round snapshot. All chart data can be exported as CSV. Team-wide level, star and strategy settings, role filters, named saved teams and result snapshots are included.

The accounting hooks do not draw random numbers or change combat state. Averages combine every independent sample, and completed battles retain their final HP state without generating later output. See the [feature comparison](evidence/calculator_feature_comparison.md).
