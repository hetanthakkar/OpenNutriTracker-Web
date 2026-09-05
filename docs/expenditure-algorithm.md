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

If body-fat data are unavailable, the current implementation falls back to 7,000 kcal/kg and lowers interpretability. Production should prefer a recent body-fat measurement when available but should not require one.

## Engineering choices

These are product/modeling decisions, not claims that a paper established these exact parameters.

### Weight smoothing

Scale measurements contain short-term noise from fluid, glycogen, sodium, gut contents and measurement error. The implementation uses a robust constant-velocity Kalman filter with capped daily innovations. Raw one-day weight differences are never used directly for expenditure.

The filter is causal: today's estimate does not look at future measurements.

### Evidence window

Observed expenditure uses the most recent 14 days once there are at least:

- 7 calendar days of history
- 4 days with calorie intake
- 3 days with scale weight

This makes the estimator degrade gracefully rather than requiring perfect daily logging.

### Missing intake

A missing food-log day is **not zero calories**. The estimator imputes from recent observed intake and reduces confidence based on intake coverage.

This is intentionally conservative because self-reported energy intake is known to contain substantial measurement error. Missing-day imputation should later be calibrated against our own user data rather than presented as directly measured intake.

### Apple Health / Conduit activity

Steps and workout records are optional. They are not converted into calories and are not directly added to the calorie budget.

A substantial change in steps can increase the estimator's update rate by at most 35%. Long-term TDEE still has to be supported by intake + trend-weight energy balance.

This choice is supported by contemporary Apple Watch validation evidence: step-count accuracy is materially more useful than wearable energy-expenditure estimates, for which errors are inconsistent and frequently large.

Reference:

- *The accuracy of Apple Watch measurements: a living systematic review and meta-analysis.* npj Digital Medicine. 2026. https://www.nature.com/articles/s41746-025-02238-1

## Confidence

Confidence is derived from:

- maturity of the user's history
- calorie-log coverage in the evidence window
- weight-measurement coverage in the evidence window

It is capped below 100% because neither food logging nor free-living body-weight inference is a direct calorimetry measurement.

## Production data contract

The estimator accepts one daily record:

```ts
{
  date: "2026-09-05",
  caloriesKcal: 2410, // optional
  weightKg: 87.2,     // optional
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
