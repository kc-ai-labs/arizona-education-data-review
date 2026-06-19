window.METHODOLOGY_DATA = {
  pageMeta: {
    title: "Methodology",
    phase: "Phase 1: Correlation and Outlier Analysis",
    asOfDate: "2026-03-01",
    sourceDocPath: "docs/REQUIREMENTS_TRACEABILITY.md",
    scopeNote: "Frontend snapshot summarizing Phase 1 methods, requirement status (REQ-001 to REQ-007), required gaps, optional next steps, and Codex/context-engineering workflow trace."
  },
  requirements: [
    {
      id: "REQ-001",
      title: "Identify Outliers within Correlations",
      status: "met",
      artifact: "01_analysis.py Section 4",
      methodSummary: "OLS regression per pair with Cook's Distance (>4/n), Studentized Residuals (>|2.5|), and positive/negative direction labels.",
      verifiedOutput: "278 unique outlier schools across 14 pairs (538 total flags) in UC outlier_results.",
      gapSummary: "No blocking gap for Phase 1 correlation outlier detection."
    },
    {
      id: "REQ-002",
      title: "Data Preprocessing Pipeline",
      status: "met",
      artifact: "00_load.py",
      methodSummary: "Unity Catalog loads + merge of selected school_range fields, conflict handling, duplicate checks, null-rate validation, and prepared table write.",
      verifiedOutput: "schools_prepared written with 1,586 rows and 70 columns.",
      gapSummary: "Requirement text mentions one-hot encoding; this is applied in Isolation Forest workflow rather than global prep table."
    },
    {
      id: "REQ-003",
      title: "Comprehensive Correlation Analysis",
      status: "partial",
      artifact: "01_analysis.py Sections 2-3",
      methodSummary: "Spearman screening with FDR correction plus Mutual Information (regression/classification) and combined ranking for pair selection.",
      verifiedOutput: "14 pairs selected and written to UC pair_metadata.",
      gapSummary: "Pearson, ANOVA, and Chi-Square are not implemented yet; current Spearman p-values are approximated instead of exact scipy spearmanr p-values."
    },
    {
      id: "REQ-004",
      title: "General Anomaly Detection",
      status: "met",
      artifact: "02_isolation_forest.py",
      methodSummary: "Isolation Forest on normalized feature matrix with OneHotEncoder for categoricals, StandardScaler, contamination=0.05, random_state=42.",
      verifiedOutput: "80 anomalies (5.04%) with overlap analysis vs OLS outliers stored in isolation_forest_results.",
      gapSummary: "Supplementary method complete for current scope; DBSCAN validation remains optional."
    },
    {
      id: "REQ-005",
      title: "Reproducible Analysis",
      status: "met",
      artifact: "00_load.py to 03_dashboard.py",
      methodSummary: "Databricks SOURCE notebooks, deterministic seeds, self-contained UC reads/writes, and overwrite mode for idempotent outputs.",
      verifiedOutput: "All four notebooks serverless-verified end-to-end in Databricks.",
      gapSummary: "No blocking gap; ongoing maintenance is runtime compatibility checks."
    },
    {
      id: "REQ-006",
      title: "Technical Reporting",
      status: "partial",
      artifact: "01_analysis.py markdown + 03_dashboard.py",
      methodSummary: "Narrative notebook report with charts and interpretations, plus Plotly dashboard for exploration/highlights.",
      verifiedOutput: "Notebook and dashboard artifacts exist and execute successfully.",
      gapSummary: "01_analysis.py Executive Summary/TLDR placeholders still need final populated numbers."
    },
    {
      id: "REQ-007",
      title: "Outlier Export",
      status: "met",
      artifact: "01_analysis.py Section 5 + UC tables",
      methodSummary: "Structured outlier export is implemented as Unity Catalog tables with contextual joins available in dashboard workflows.",
      verifiedOutput: "outlier_results populated (11,049 school-pair rows, including flags and context-ready identifiers).",
      gapSummary: "Traceability marks this met via UC tables; if strict CSV file delivery is required, add an export cell/step."
    }
  ],
  sections: [
    {
      id: "data-prep",
      label: "Data Preprocessing Pipeline",
      status: "met",
      mappedRequirementIds: ["REQ-002"],
      questionAnswered: "How did we build a clean, analysis-ready school dataset before correlation and outlier modeling?",
      approachSummary: "00_load.py reads Unity Catalog source tables, merges selected non-duplicate fields from school_range into schools, validates dataset integrity, and writes a reusable schools_prepared table for downstream notebooks.",
      keyVariables: [
        "Primary join key: SchoolCode (1:1 across core tables)",
        "Source tables: helios.correlation_analysis.schools, school_range, fields",
        "Merged unique context columns include TitleOneYesNo, RaceRange, SchoolType, GradesTaught, GEOID, LATITUDE, LONGITITUDE"
      ],
      methodsAndThresholds: [
        "Duplicate and row-count validation after merge (fail-fast if unexpected row changes)",
        "Column conflict resolution for overlapping names (e.g., teacher pay / enrollment variants)",
        "Null-rate reporting and schema validation before writing UC output",
        "Output table written with overwrite mode for idempotent reruns"
      ],
      outputsAndTables: [
        "UC table: helios.correlation_analysis.schools_prepared",
        "Verified shape: 1,586 rows and 70 columns (traceability snapshot)"
      ],
      limitations: [
        "REQ-002 mentions one-hot encoding, but one-hot encoding is applied inside the Isolation Forest workflow rather than globally in the prepared table",
        "Prepared table favors analysis-ready numeric/raw fields over bucketed range fields for statistical modeling"
      ],
      remainingWork: [
        "Optional: add a dedicated documented schema contract/QC artifact for schools_prepared in the delivery UI or docs"
      ]
    },
    {
      id: "correlation-discovery",
      label: "Correlation Discovery and Pair Selection",
      status: "partial",
      mappedRequirementIds: ["REQ-003"],
      questionAnswered: "Which relationships are statistically strong or interesting enough to warrant trend modeling and outlier analysis?",
      approachSummary: "01_analysis.py combines broad Mutual Information discovery with Spearman correlation screening and FDR correction to select a focused set of outcome-feature pairs for OLS outlier analysis. Context decisions in .planning/1-CONTEXT.md prioritize both strength and actionability.",
      keyVariables: [
        "Outcome targets are metadata-driven (fields category = Outcome), including both level and change metrics",
        "Actionable school variables (e.g., teacher pay, student-teacher ratio, chronic absenteeism) are prioritized for reporting when meaningful",
        "Selection balances statistical strength, actionability, and narrative value rather than only strongest raw correlations"
      ],
      methodsAndThresholds: [
        "Mutual Information: mutual_info_regression / mutual_info_classif depending on target type",
        "Spearman correlation screening across candidate pairs",
        "FDR correction (Benjamini-Hochberg) to control false discovery rate",
        "Combined ranking used to choose final modeled pairs (traceability notes 0.6 Spearman + 0.4 MI weighting)",
        "Current implementation approximates Spearman p-values instead of using exact scipy.stats.spearmanr p-values"
      ],
      outputsAndTables: [
        "UC table: helios.correlation_analysis.pair_metadata",
        "Traceability snapshot: 14 pairs selected for downstream OLS modeling"
      ],
      limitations: [
        "REQ-003 is partially met because Pearson, ANOVA, and Chi-Square are not yet implemented as explicit artifacts",
        "Some selected pairs entered via actionable keyword filters despite weak FDR significance, so downstream outliers on flat relationships require caution"
      ],
      remainingWork: [
        "Add Pearson correlation outputs for linear-comparison diagnostics",
        "Add ANOVA for categorical predictor vs numeric outcome analyses",
        "Add Chi-Square (and strength metric such as Cramer's V) for categorical-categorical associations",
        "Replace approximate Spearman p-values with scipy.stats.spearmanr exact p-values"
      ]
    },
    {
      id: "ols-outliers",
      label: "OLS-Based Correlation Outlier Detection",
      status: "met",
      mappedRequirementIds: ["REQ-001"],
      questionAnswered: "Which schools deviate meaningfully from the expected trend line for a specific correlation?",
      approachSummary: "For each selected pair, 01_analysis.py fits a bivariate OLS regression and flags schools that are unusually influential or far from the fitted trend using standardized residual and influence thresholds. This directly addresses 'outliers within correlations' rather than global anomaly scoring.",
      keyVariables: [
        "Predictor-outcome pairs selected from correlation discovery step",
        "Raw-value reporting in stakeholder-facing charts/tables (percentages, dollars, counts) per Phase 1 context decisions",
        "Direction labeling indicates whether a school performs above or below trend"
      ],
      methodsAndThresholds: [
        "OLS regression per selected pair",
        "Studentized residual threshold: |std_resid| > 2.5",
        "Cook's Distance threshold: cooks_d > 4/n",
        "Uniform thresholds across pairs for comparability",
        "Binary outlier flag plus raw metrics retained for analyst interpretation"
      ],
      outputsAndTables: [
        "UC table: helios.correlation_analysis.outlier_results",
        "Traceability snapshot: 278 unique outlier schools across 14 pairs (538 total outlier flags)",
        "Pair-level fitted values and prediction interval fields included for visualization and explanation"
      ],
      limitations: [
        "OLS assumption diagnostics show normality violations in residuals, so OLS-derived p-values and confidence intervals should be treated as approximate",
        "Outliers from weak or flat relationships are less meaningful than outliers from strong trends and should be interpreted cautiously"
      ],
      remainingWork: [
        "Optional: tighten pair-selection gating so weak-significance pairs are excluded from primary outlier narratives",
        "Optional: surface assumption diagnostic summaries directly in the delivery UI for each pair"
      ]
    },
    {
      id: "isolation-forest",
      label: "General Anomaly Detection (Isolation Forest)",
      status: "met",
      mappedRequirementIds: ["REQ-004"],
      questionAnswered: "Which schools look globally unusual across many variables, independent of any single correlation trend line?",
      approachSummary: "02_isolation_forest.py runs a supplementary anomaly workflow using Isolation Forest over a processed mixed-type feature matrix. This complements OLS trend outliers by answering a different question: global unusualness instead of pair-specific trend deviation.",
      keyVariables: [
        "Mixed numeric and categorical school features",
        "Categorical features encoded for model input",
        "Scaled feature matrix to stabilize multi-feature anomaly scoring"
      ],
      methodsAndThresholds: [
        "OneHotEncoder for categorical features",
        "StandardScaler for normalization",
        "IsolationForest contamination=0.05",
        "random_state=42 for reproducibility",
        "Overlap analysis vs OLS outlier results to compare anomaly types"
      ],
      outputsAndTables: [
        "UC table: helios.correlation_analysis.isolation_forest_results",
        "Traceability snapshot: 80 anomalies (5.04%), with 38 overlapping OLS outliers"
      ],
      limitations: [
        "Isolation Forest is supplementary for Phase 1 and less directly interpretable for stakeholder stories than correlation-specific outliers",
        "Anomaly flag meaning depends on feature set and contamination assumption"
      ],
      remainingWork: [
        "Optional: add DBSCAN or alternate anomaly validation method for triangulation",
        "Optional: expose anomaly score distribution and threshold rationale in the UI"
      ]
    },
    {
      id: "reproducibility",
      label: "Reproducibility and Idempotent Execution",
      status: "met",
      mappedRequirementIds: ["REQ-005"],
      questionAnswered: "Can the Phase 1 analysis be rerun consistently without manual cleanup or hidden state dependencies?",
      approachSummary: "Phase 1 is implemented as four Databricks SOURCE notebooks that read/write Unity Catalog tables, use fixed seeds for randomized methods, and overwrite outputs to support safe reruns and auditable results.",
      keyVariables: [
        "Random seeds for stochastic methods (np.random.seed and random_state=42)",
        "Databricks Runtime compatibility constraints from serverless verification",
        "Unity Catalog output tables used as notebook boundaries"
      ],
      methodsAndThresholds: [
        "Notebook independence: downstream notebooks read from UC, not prior notebook memory",
        "Idempotent writes via overwrite mode",
        "Serverless verification runs executed for 00_load, 01_analysis, 02_isolation_forest, and 03_dashboard",
        "Local py_compile and notebook SOURCE format checks recorded in verification docs",
        "Execution workflow references: .planning/1-CONTEXT.md, .planning/phases/01-correlation-outlier/01-02-PLAN.md, and .planning/phases/01-correlation-outlier/01-02-VERIFICATION.md"
      ],
      outputsAndTables: [
        "Verification artifacts: .planning/phases/01-correlation-outlier/01-02-VERIFICATION.md",
        "UC outputs: schools_prepared, outlier_results, pair_metadata, isolation_forest_results"
      ],
      limitations: [
        "Reproducibility depends on runtime/library compatibility; verification notes document several compatibility adjustments",
        "This Methodology page is a curated snapshot and does not live-read notebook run status"
      ],
      remainingWork: [
        "Optional: expose notebook run IDs / last verified dates in a generated metadata artifact for UI display"
      ]
    },
    {
      id: "reporting-dashboard",
      label: "Technical Reporting and Dashboard Delivery",
      status: "partial",
      mappedRequirementIds: ["REQ-006"],
      questionAnswered: "How are methods and findings communicated for technical review and stakeholder interpretation?",
      approachSummary: "The primary report is the Databricks narrative notebook (01_analysis.py) with markdown + charts, supported by a Plotly dashboard notebook (03_dashboard.py) for exploration and curated highlights. This reference stack web app provides a separate delivery scaffold for delivery-aligned interfaces.",
      keyVariables: [
        "Top 5 deep-dive correlations plus broader correlation index/context (per Phase 1 context decisions)",
        "Plain-language interpretation requirements for educational stakeholders",
        "Interactive dashboard views backed by UC output tables"
      ],
      methodsAndThresholds: [
        "Narrative markdown cells interleaved with analysis code",
        "Scatter visual standards: labeled axes, CI bands, n annotations, selective outlier labels",
        "Plotly dashboard sections for exploration and presentation",
        "Delivery translation path: Databricks UC outputs -> load_phase1_outputs_to_mssql.py -> analytics schema -> Java API -> web pages"
      ],
      outputsAndTables: [
        "Artifacts: phase-01-correlation/01_analysis.py and 03_dashboard.py",
        "Traceability notes delivery is partially met due to unfinished Executive Summary placeholders"
      ],
      limitations: [
        "01_analysis.py TLDR/Executive Summary still contains placeholder values instead of finalized numbers",
        "REQ-006 quality depends on narrative completeness, not only notebook execution success"
      ],
      remainingWork: [
        "Populate final Executive Summary/TLDR numbers in 01_analysis.py from latest validated outputs",
        "Optional: add more explicit methodology caveats/assumption summaries in dashboard-facing views"
      ]
    },
    {
      id: "export-delivery",
      label: "Outlier Export and Delivery Artifacts",
      status: "met",
      mappedRequirementIds: ["REQ-007"],
      questionAnswered: "How are outlier findings exported in a structured form for downstream analysis and delivery surfaces?",
      approachSummary: "Phase 1 exports structured results to Unity Catalog tables in long-form schemas designed for joins and dashboards. This satisfies structured export needs for analysis pipelines, but differs from the original requirement wording that explicitly called for CSV output.",
      keyVariables: [
        "Normalized long-format row grain: one row per school-pair combination in outlier_results",
        "SchoolCode as join key to enrich with school context from schools_prepared",
        "Pair metadata and anomaly tables provide companion outputs"
      ],
      methodsAndThresholds: [
        "UC table writes with overwrite mode",
        "Outlier metrics include cooks_d, std_resid, direction, fitted values, and prediction interval bounds",
        "Context columns are joined downstream rather than denormalized into outlier_results"
      ],
      outputsAndTables: [
        "UC tables: outlier_results, pair_metadata, schools_prepared, isolation_forest_results",
        "Traceability snapshot notes 11,049 rows in outlier_results (all school-pair combinations)"
      ],
      limitations: [
        "REQ-007 calls for CSV export; current implementation delivers UC tables only",
        "CSV extraction path is documented as easy to add but not yet implemented as notebook output"
      ],
      remainingWork: [
        "Add an optional notebook cell or utility step to export selected outlier tables to CSV when file-based delivery is required"
      ]
    },
    {
      id: "remaining-gaps",
      label: "Remaining Work and Known Gaps (Roll-Up)",
      status: "planned",
      mappedRequirementIds: ["REQ-003", "REQ-006", "REQ-007"],
      questionAnswered: "What still needs to be done to close requirement gaps, and what additional improvements are available next?",
      approachSummary: "This roll-up aggregates unfinished required items from requirements traceability plus context-driven optional enhancements that could improve rigor, interpretability, or delivery experience.",
      keyVariables: [
        "Required requirement gaps vs optional enhancements are tracked separately",
        "Priority should favor requirements closure before additional methods or UI polish"
      ],
      methodsAndThresholds: [
        "Use traceability doc as the authoritative status snapshot for this page version",
        "Treat optional extensions as backlog candidates, not implied commitments"
      ],
      outputsAndTables: [
        "Rendered as grouped backlog sections on this page (Required Gaps, Recommended Improvements, Optional Enhancements)"
      ],
      limitations: [
        "Static snapshot can drift from notebooks/docs unless manually updated",
        "This page is explanatory; it does not execute or validate notebooks"
      ],
      remainingWork: [
        "Refresh this page whenever requirements traceability or Phase 1 verification changes"
      ]
    }
  ],
  openItems: [
    {
      kind: "required_gap",
      label: "Implement Pearson correlation outputs",
      why: "REQ-003 requires baseline statistical correlations beyond Spearman + MI, and Pearson adds a linear comparison lens.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (REQ-003 gap)"
    },
    {
      kind: "required_gap",
      label: "Implement ANOVA analyses",
      why: "REQ-003 explicitly calls for ANOVA for categorical predictor vs numeric outcome relationships.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (REQ-003 gap)"
    },
    {
      kind: "required_gap",
      label: "Implement Chi-Square analyses (with association strength metric)",
      why: "REQ-003 explicitly calls for categorical-categorical association testing; include a strength metric for interpretability.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (REQ-003 gap)"
    },
    {
      kind: "required_gap",
      label: "Replace approximate Spearman p-values with scipy.stats.spearmanr exact p-values",
      why: "Improves statistical correctness for REQ-003 and removes a documented methodology caveat.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (Spearman p-value approximation note)"
    },
    {
      kind: "required_gap",
      label: "Populate final Executive Summary / TLDR numbers in 01_analysis.py",
      why: "REQ-006 is partially met until the technical report's summary placeholders are replaced with validated values.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (REQ-006 gap); .planning/phases/01-correlation-outlier/01-02-SUMMARY.md"
    },
    {
      kind: "recommended_improvement",
      label: "Add CSV export step for outlier outputs when strict file-based delivery is needed",
      why: "REQ-007 is traceability-met via UC tables, but add CSV export if file-based delivery is required by a downstream consumer.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (REQ-007 note)"
    },
    {
      kind: "recommended_improvement",
      label: "Tighten pair selection gating for weak-significance 'actionable' pairs",
      why: "Traceability notes some modeled pairs are statistically weak; filtering or labeling them more explicitly would improve interpretation quality.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (Non-Significant Pairs in OLS Analysis)"
    },
    {
      kind: "recommended_improvement",
      label: "Surface OLS assumption diagnostics in delivery-facing views",
      why: "Residual normality and other assumption caveats are documented but not yet visible in the reference stack UI.",
      source: "docs/REQUIREMENTS_TRACEABILITY.md (OLS assumption violations)"
    },
    {
      kind: "optional_extension",
      label: "Add DBSCAN (or alternate method) as anomaly-validation triangulation",
      why: "The research notes recommend optional validation from a different perspective; useful for deeper methodology comparison, not required for Phase 1 closure.",
      source: ".planning/research/correlation_analysis.md"
    },
    {
      kind: "optional_extension",
      label: "Add Databricks Lakeview dashboard backed by the same UC tables",
      why: "Context docs defer Lakeview as a future enhancement if persistent shared dashboards are needed.",
      source: ".planning/1-CONTEXT.md (Deferred Ideas)"
    },
    {
      kind: "optional_extension",
      label: "Expand Methodology page to cover Phase 2 and Phase 3 requirements",
      why: "Current page scope is intentionally Phase 1 only, but the same structure can support REQ-008 to REQ-016 later.",
      source: ".planning/REQUIREMENTS.md"
    }
  ]
};
