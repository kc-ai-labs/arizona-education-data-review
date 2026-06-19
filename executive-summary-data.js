window.EXEC_SUMMARY_DATA = {
  overviewBullets: [
    "This page surfaces the most policy-relevant outlier schools from Phase 1 by combining trend outlier evidence and relationship quality.",
    "A school appears when it is unusually above or below expected trend lines in one or more modeled predictor-outcome relationships.",
    "KPIs and Top 10 lists are live from the delivery API and filtered by county and pair scope."
  ],
  technicalBullets: [
    "Outlier rule: Cook's Distance > 4/n OR |studentized residual| > 2.5, computed per predictor->outcome model.",
    "Metric definitions and formula-level interpretation are in the How to Interpret section above the Top 10 table.",
    "Pair quality signals come from correlation metadata (default visibility rank, |Spearman's rho|, R-squared, and high-signal flags).",
    "Top schools are ranked deterministically: high-signal outlier relationship count, then severity, then influence, then pair-quality tie-breakers.",
    "Relationship rows are ordered by absolute studentized residual, then pair-quality tie-breakers; no arbitrary weighted score is used."
  ],
  metricGlossary: [
    {
      metric: "Relationship",
      plainEnglish: "The predictor and outcome being compared for a school.",
      equation: "predictor -> outcome",
      interpretation: "Use this as the business question for the row (for example, FRL_Percent -> MathAssessPercentPassADE)."
    },
    {
      metric: "Direction",
      plainEnglish: "Whether the school is above expected or below expected for this relationship.",
      equation: "sign(residual), where residual = actual outcome - fitted outcome",
      interpretation: "positive = above expected; negative = below expected."
    },
    {
      metric: "Studentized Residual",
      plainEnglish: "How unusual the school is after scaling by typical model spread.",
      equation: "std_resid = residual / residual_spread",
      interpretation: "Larger |Studentized Residual| means farther from the expected trend."
    },
    {
      metric: "Cook's Distance",
      plainEnglish: "How much this school can influence the fitted regression line.",
      equation: "influence distance from OLS diagnostics",
      interpretation: "Higher Cook's Distance means the point has stronger influence on model fit."
    },
    {
      metric: "Cook's Distance Threshold (4 / n)",
      plainEnglish: "Rule-of-thumb influence threshold for the pair, based on sample size n.",
      equation: "threshold = 4 / n",
      interpretation: "Lower threshold at larger n; compare Cook's Distance against this value."
    },
    {
      metric: "Cook's Distance Exceedance",
      plainEnglish: "How far Cook's Distance is above or below the 4/n threshold.",
      equation: "exceedance = Cook's Distance / (4 / n)",
      interpretation: "Values > 1.0 are above threshold."
    },
    {
      metric: "Spearman's rho",
      plainEnglish: "Rank-based relationship strength and direction across schools for the pair.",
      equation: "rho in [-1, 1]",
      interpretation: "|rho| closer to 1 means stronger monotonic association; sign gives direction."
    },
    {
      metric: "False Discovery Rate (FDR) p-value",
      plainEnglish: "Multiple-testing-adjusted probability used to judge whether the pair is statistically credible after testing many relationships.",
      equation: "Benjamini-Hochberg adjusted p-value",
      interpretation: "Lower False Discovery Rate (FDR) p-values mean stronger evidence that the relationship is not a chance finding."
    },
    {
      metric: "Relationship Rank Tier",
      plainEnglish: "Bucketed version of the pair's default visibility ranking in the statewide modeled results.",
      equation: "Top-tier: rank <= 15; Mid-tier: rank <= 75; Lower-tier: remaining modeled pairs",
      interpretation: "Top-tier relationships are the default statewide relationships the app emphasizes first."
    },
    {
      metric: "R-squared",
      plainEnglish: "Share of variation explained by the fitted OLS line.",
      equation: "R^2 in [0, 1]",
      interpretation: "Higher R^2 means the line explains more of the outcome variation."
    },
    {
      metric: "Quality Band",
      plainEnglish: "Pair classification used for visibility and decision support priority.",
      equation: "quality_band metadata label",
      interpretation: "High-signal rows appear by default; exploratory rows require all-scope views."
    }
  ],
  qualityBandDefinitions: {
    high_signal_sparse_exception: "High-signal relationship with sparse but meaningful exceptions; prioritized in default visibility.",
    actionable_exploratory: "Exploratory relationship with potential operational value, but below default high-signal threshold.",
    selected_other: "Modeled pair retained for exploratory review but not default high-signal visibility.",
    default: "Modeled pair quality classification from correlation metadata."
  },
  caveats: [
    "Observational school-level data supports association analysis, not causal inference.",
    "Small-school volatility and confounding variables can amplify apparent outlier patterns.",
    "This view is a decision-support lens and should be combined with local context before policy action."
  ],
  provenanceTrace: [
    {
      label: "Planning context",
      artifact: ".planning/1-CONTEXT.md",
      note: "Defines pair selection logic, outlier thresholds, and reporting standards used by implementation work."
    },
    {
      label: "Execution blueprint",
      artifact: ".planning/phases/01-correlation-outlier/01-02-PLAN.md",
      note: "Specifies notebook architecture, UC outputs, QC checks, and delivery expectations for Phase 1."
    },
    {
      label: "Requirements traceability",
      artifact: "docs/REQUIREMENTS_TRACEABILITY.md",
      note: "Maps REQ-001 to REQ-007 to methods, outputs, and remaining gaps, used for stakeholder-ready reporting language."
    },
    {
      label: "Delivery integration",
      artifact: "delivery/asu-reference-stack/scripts/load_phase1_outputs_to_mssql.py",
      note: "Bridges Databricks outputs into MSSQL analytics tables consumed by API and web pages."
    },
    {
      label: "Verification evidence",
      artifact: ".planning/phases/01-correlation-outlier/01-02-VERIFICATION.md",
      note: "Documents notebook execution checks, table validations, and reproducibility evidence used in this summary narrative."
    }
  ]
};
