# Adaptive expenditure estimator

This implementation is an original estimator built from published physiology. It is **not** a reproduction of MacroFactor's proprietary Expenditure V3 algorithm.

## Core equation

Over a time window, energy conservation gives:

```text
TDEE = average energy intake - average change in stored body energy
```

A falling body-energy store is negative, so expenditure is higher than intake during weight loss.

## Research-backed components

### 1. Cold-start resting expenditure

The estimator uses Mifflin-St Jeor only as a prior while little user data exists:

```text
male:   RMR = 10W + 6.25H - 5A + 5
female: RMR = 10W + 6.25H - 5A - 161
```

References:

- Mifflin MD, St Jeor ST, Hill LA, Scott BJ, Daugherty SA, Koh YO. *A new predictive equation for resting energy expenditure in healthy individuals.* Am J Clin Nutr. 1990;51(2):241-247. PMID 2305711. https://pubmed.ncbi.nlm.nih.gov/2305711/
- Frankenfield D, Roth-Yousey L, Compher C. *Comparison of predictive equations for resting metabolic rate in healthy nonobese and obese adults.* J Am Diet Assoc. 2005;105(5):775-789. PMID 15883556. https://pubmed.ncbi.nlm.nih.gov/15883556/

The initial activity multiplier is deliberately treated as a weak prior. Once enough intake and weight data exist, observed energy balance drives the estimate.

### 2. Body-weight change is not assigned one fixed kcal/kg value

The implementation follows Hall's use of Forbes body-composition partitioning. For small changes, the fraction of weight change attributed to fat-free mass is:

```text
lean_fraction = 10.4 / (10.4 + fat_mass_kg)
```

Hall's proposed metabolizable energy densities are:

```text
fat-mass change:       39.5 MJ/kg
fat-free-mass change:   7.6 MJ/kg
```

The estimator combines these according to the current predicted fat/lean partition.

References:

- Hall KD. *Body fat and fat-free mass inter-relationships: Forbes's theory revisited.* Br J Nutr. 2007;97(6):1059-1063. PMID 17367567. https://pubmed.ncbi.nlm.nih.gov/17367567/
- Hall KD. *What is the required energy deficit per unit weight loss?* Int J Obes. 2008;32(3):573-576. PMID 17848938. https://pubmed.ncbi.nlm.nih.gov/17848938/
- Hall KD, Sacks G, Chandramohan D, et al. *Quantification of the effect of energy imbalance on bodyweight.* Lancet. 2011;378(9793):826-837. PMID 21872751. https://pubmed.ncbi.nlm.nih.gov/21872751/

If body-fat data are unavailable, the implementation falls back to 7,000 kcal/kg. The production profile loader currently does not supply body fat, so both expenditure and targets use this fallback. The optional Hall/Forbes calculation is not the full NIH dynamic model. Neither 7,000 nor 7,700 is a physiological constant; choosing between them requires validation beyond synthetic data.

## Engineering choices

These are product/modeling decisions, not claims that a paper established these exact parameters.

### Weight smoothing

Scale measurements contain short-term noise from fluid, glycogen, sodium, gut contents and measurement error. The implementation uses exponential smoothing with alpha 0.10 for daily measurements. The first real measurement seeds the trend, regardless of leading empty calendar days. On missing days the trend holds; the next measurement uses `1 - 0.9^min(gapDays, 3)` to account for short gaps without extrapolating weight velocity.

The filter is causal: today's estimate does not look at future measurements.

### Evidence window and timing

A morning weight on day N is paired with completed calorie intake through day N-1. The expenditure window uses up to 20 completed intake days bounded by the corresponding morning trend-weight change. Today's food cannot change that morning's expenditure or confidence. Before 20 days, a shorter window can be used after the minimum evidence threshold is met.

An observed expenditure update begins once there are at least:

- 14 calendar intervals since the first real weigh-in
- 10 completed calorie days and at least 70% calorie coverage in the window
- 6 scale measurements across the bounded weight window
- a weigh-in no more than 3 days old
- no more than 3 missing nutrition days in the preceding 7 completed days

Normal expenditure smoothing uses alpha 0.10, or 0.20 while fewer than 21 completed food days exist. Steps can increase this by at most 35%. The existing daily change limits and 1,200-5,000 kcal bounds remain. These are engineering choices, not recovered MacroFactor coefficients.

### Missing intake

A missing food-log day is **not zero calories**. Only diary days explicitly marked complete are supplied as intake. Food edits reopen a day. Missing intake is imputed from the median of prior logged intake within 14 calendar days, falling back to the current estimate when none exists. Imputed days never count toward coverage or maturity.

Updates pause when more than three of the previous seven nutrition days are missing, a weigh-in is over three days old, or the evidence thresholds are no longer met. The estimate holds while confidence decays by 20% per paused day. New adequate evidence resumes updates. `status` distinguishes `building`, `active`, and `paused`; a previously learned estimate remains `isAdaptive` while paused.

This is intentionally conservative because self-reported energy intake is known to contain substantial measurement error. Missing-day imputation should later be calibrated against our own user data rather than presented as directly measured intake.

### Apple Health / Conduit activity

Steps and workout records are optional. They are not converted into calories and are not directly added to the calorie budget.

A substantial change in steps can increase the estimator's update rate by at most 35%. Long-term TDEE still has to be supported by intake + trend-weight energy balance.

This choice is supported by contemporary Apple Watch validation evidence: step-count accuracy is materially more useful than wearable energy-expenditure estimates, for which errors are inconsistent and frequently large.

Reference:

- *The accuracy of Apple Watch measurements: a living systematic review and meta-analysis.* npj Digital Medicine. 2026. https://www.nature.com/articles/s41746-025-02238-1

## Calorie target

The daily calorie target no longer adds exercise calories to a static base target. It uses:

```text
target intake = adaptive TDEE + desired daily change in stored body energy
```

For a weight-loss goal, the stored-body-energy term is negative. Its magnitude uses the same Hall/Forbes energy density as the expenditure estimator rather than a fixed 7,700 kcal/kg rule.

Example for a -0.40 kg/week goal:

```text
daily energy adjustment = (-0.40 kg / 7) × current predicted kcal/kg
calorie target = adaptive TDEE + daily energy adjustment
```

Because adaptive TDEE is relearned continuously, metabolic and activity changes can flow into the target without separately adding wearable exercise calories.

## Confidence

Confidence is derived from:

- number of actually completed food days, excluding today's intake
- calorie-log coverage in the evidence window
- weight-measurement coverage in the evidence window
- age of the latest weigh-in, with a factor of `0.8^ageDays`

The maturity factor is `(completedFoodDays - 9) / 21`, bounded to 0.2-1.0 once evidence is sufficient. The final score is capped at 0.98. Leading empty calendar days are discarded, internal calendar gaps are filled as missing, and duplicate dates count once. This is an engineering evidence score, not a calibrated probability of accuracy; the UI calls it evidence and explicitly labels paused estimates.

## Shared calculation

`lib/expenditure-data.ts` loads the same 120-day window of completed nutrition, daily weights, steps, and dated profile data for daily budgets and Trends. Historical calculations exclude future weights. Trends calculates its current target from this estimate rather than using an arbitrary latest saved target. Home receives the result through `resolveDailyPlan`, which preserves the existing snapshot persistence and manual adjustment behavior.

## Regression checks

Run `npm run test:expenditure` for estimator, shared data/budget, and weight-progress tests. Database calls are mocked in the shared-loader tests; no user records are changed.

The 2026-09 comparison used constant 2,500 kcal/day expenditure and intake, with a temporary +2 kg scale change on days 50-54. The old Kalman/14-day estimator had a maximum error of 624 kcal/day; exponential smoothing with the 20-day window reduced it to 134 kcal/day using the same 7,000 kcal/kg conversion.

This stability trades off responsiveness. For a sustained 400 kcal/day expenditure change in either direction, the new filter's error was about 172 kcal/day after 28 days and 19 after 56 days; the old filter was about 2 kcal/day off after 28 days. These fixtures verify behavior, not real-world accuracy. Tests also cover steady loss/gain, isolated outliers, missing nutrition, stale weights, resuming tracking, startup padding, and steps without calorie double-counting.

## Production data contract

The estimator accepts one daily record:

```ts
{
  date: "2026-09-05",
  caloriesKcal: 2410, // completed intake for this date; optional
  weightKg: 87.2,     // preferably morning weight; optional
  steps: 9842,        // optional Apple Health
  workoutMinutes: 42  // optional Apple Health
}
```

Profile input:

```ts
{
  ageYears: 30,
  sex: "male",
  heightCm: 178,
  weightKg: 87.2,
  bodyFatPercent: 24.6, // optional
  activityFactor: 1.45  // cold-start prior only
}
```

## Validation before calling this production-grade

The equations are research-based, but our **combined estimator and its filter parameters are new and therefore need validation**. Before using its output for automatic calorie-target changes, we should backtest against longitudinal users with high food/weight adherence and report at minimum:

- 7-, 14-, and 28-day TDEE stability
- error in predicted subsequent weight change
- sensitivity to one missing calorie day
- sensitivity to one anomalous weigh-in
- behavior during rapid step-count changes
- calibration of the displayed confidence score

Where possible, external validation against doubly labelled water datasets is preferable because DLW is the reference method for free-living total energy expenditure.

Reference:

- Westerterp KR. *Doubly labelled water assessment of energy expenditure: principle, practice, and promise.* Eur J Appl Physiol. 2017;117:1277-1285. PMID 28508113. https://pmc.ncbi.nlm.nih.gov/articles/PMC5486561/
