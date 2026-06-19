# Arizona Education Data Review

A static, self-contained review of a K-8 outlier, validation, and prediction analysis over Arizona public school data. The full application runs entirely from pre-generated JSON files, with no database or server.

## Pages

- **Executive Summary** — top outlier schools and relationship signals from the correlation analysis.
- **Scatter Plot** — school comparison by selected metrics with a fitted regression line.
- **Correlation Outliers** — predictor-to-outcome relationships, trend outliers, and Isolation Forest overlap.
- **Data Cleaning** — exclusion rules and per-field impact.
- **Validation** — coverage of internal fields validated against official sources.
- **Assessment Predictions / Assessment Overview** — school and county trend forecasts.
- **Summary Stats, Methodology, Field Definitions, Field Mapping** — descriptive statistics and the data dictionary.

## How to read it

- Data reflects a point-in-time snapshot, not a live feed.
- School-level metrics are aggregate, not student-level.
- Forecasts are descriptive trend indicators for review, not decision-ready model predictions.
- Reported relationships describe association, not causation.

## Running locally

Serve the folder with any static file server, for example:

```
python3 -m http.server 8000
```

then open `http://localhost:8000/index.html`.
