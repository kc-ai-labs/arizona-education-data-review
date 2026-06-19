window.METHODOLOGY_DATA = {
  "pageMeta": {
    "title": "Methodology",
    "phase": "Phase 1: Correlation and Outlier Analysis",
    "asOfDate": "2026-03-03",
    "sourceMode": "generated_snapshot",
    "scopeNote": "Generated requirement-centric snapshot for REQ-001 through REQ-007 with evidence links, required gaps, and separate non-requirement backlog.",
    "generatedAtUtc": "2026-03-03T23:17:32.633414+00:00",
    "traceabilityLastVerified": "2026-02-22 (against live Unity Catalog data)",
    "snapshotVersion": "2026-02-24",
    "snapshotCreatedAtUtc": "2026-02-24T02:17:57.400715+00:00",
    "repoCommitSha": "ab5bd664fff345aeb7df928c3ee2c9e2011a7ed9",
    "sourceArtifacts": [
      ".planning/REQUIREMENTS.md",
      "docs/REQUIREMENTS_TRACEABILITY.md",
      "delivery/reference-stack/seed/phase1-demo/manifest.json",
      "phase-01-correlation/00a_data_cleaning.py",
      "phase-01-correlation/01_analysis.py",
      "phase-01-correlation/01b_pair_selection_audit.py",
      "phase-01-correlation/02_isolation_forest.py"
    ]
  },
  "requirements": [
    {
      "id": "REQ-001",
      "title": "Identify Outliers within Correlations",
      "status": "met",
      "status_reason": "Met via OLS trend outlier detection with Cook's D and studentized residual thresholds written to phase-1 outputs.",
      "required_gaps": [],
      "evidence": [
        {
          "label": "Delivery outlier rows",
          "value": "502,150",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        },
        {
          "label": "Pair metadata rows",
          "value": "467",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "01_analysis.py (OLS thresholds)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "doc",
          "label": "Requirements traceability (REQ-001)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_notebook",
          "label": "Notebook: 01_analysis",
          "url": "",
          "status": "resolved",
          "note": "Resolved from Databricks workspace metadata."
        },
        {
          "type": "databricks_run",
          "label": "Databricks rollout run: 01_analysis",
          "url": "",
          "status": "resolved",
          "note": "Latest successful 01_analysis run."
        }
      ],
      "code_samples": [
        {
          "title": "Outlier threshold logic (Cook's D OR |std resid|)",
          "language": "python",
          "code": "    # Cook's D threshold = 4/n: standard rule of thumb. For ~1,586 schools this is ~0.0025\n    thresh_cook = 4.0 / n_obs\n    # Studentized residual threshold = 2.5 standard deviations from the line\n    thresh_resid = 2.5\n\n    # Look up the Spearman correlation for this pair (computed in Section 3)\n    spearman_row = selected_pairs_df[\n        (selected_pairs_df[\"feature\"] == feat) & (selected_pairs_df[\"target\"] == target)\n    ].iloc[0]\n\n    # -----------------------------------------------------------------------\n    # CONFIDENCE INTERVALS for the model coefficient.\n    # The coefficient tells us \"for each 1-unit increase in X, Y changes by\n    # this much.\" The confidence interval gives the range where the TRUE\n    # coefficient likely falls (95% confidence).\n    # Example: If coef=0.3 with CI [0.2, 0.4], we're 95% confident the true\n    # effect is between 0.2 and 0.4 per unit of X.\n    # -----------------------------------------------------------------------\n    conf_int = model.conf_int()\n    feat_ci_low = float(conf_int.loc[feat, 0]) if feat in conf_int.index else np.nan\n    feat_ci_high = float(conf_int.loc[feat, 1]) if feat in conf_int.index else np.nan\n\n    # Prediction confidence band: for each school, where does the TRUE trend\n    # line likely fall? This is different from the coefficient CI \u2014 it gives\n    # a range for each predicted Y value along the line.\n    pred_frame = model.get_prediction(X).summary_frame(alpha=0.05)\n\n    # -----------------------------------------------------------------------\n    # Loop through every school in this pair and record its diagnostics.\n    # -----------------------------------------------------------------------\n    for i, idx in enumerate(subset.index):\n        resid_val = float(model.resid.iloc[i])  # Raw residual: actual Y minus predicted Y\n        # Flag as outlier if Cook's D OR studentized residual exceeds threshold\n        is_outlier = (cooks_d[i] > thresh_cook) or (abs(std_resid[i]) > thresh_resid)",
          "source_label": "phase-01-correlation/01_analysis.py:890-923",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-002",
      "title": "Data Preprocessing Pipeline:",
      "status": "met",
      "status_reason": "Met via rule-based preparation and cleaning pipeline (`00a_data_cleaning.py`), with one-hot encoding applied in the Isolation Forest workflow.",
      "required_gaps": [],
      "evidence": [
        {
          "label": "Isolation forest rows",
          "value": "1,586",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        },
        {
          "label": "Data cleaning pair summary rows",
          "value": "467",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "00a_data_cleaning.py",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "repo_file",
          "label": "02_isolation_forest.py (one-hot encoding)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_notebook",
          "label": "Notebook: 00a_data_cleaning",
          "url": "",
          "status": "resolved",
          "note": "Resolved from Databricks workspace metadata."
        },
        {
          "type": "databricks_run",
          "label": "Databricks verification run: codex-temp-correlation-cleaning-verify",
          "url": "",
          "status": "resolved",
          "note": "Includes 00a_data_cleaning, 01_analysis, and 02_isolation_forest tasks."
        }
      ],
      "code_samples": [
        {
          "title": "Cleaning pipeline load + key integrity checks",
          "language": "python",
          "code": "# Load source tables from Unity Catalog.\nschools_prepared_df = spark.table(\"helios.correlation_analysis.schools_prepared\").toPandas()\nschool_range_df = spark.table(\"helios.correlation_analysis.school_range\").toPandas()\nfields_df = spark.table(\"helios.correlation_analysis.fields\").toPandas()\n\nprint(\"schools_prepared shape:\", schools_prepared_df.shape)\nprint(\"school_range shape:\", school_range_df.shape)\nprint(\"fields shape:\", fields_df.shape)\n\nif \"SchoolCode\" not in schools_prepared_df.columns:\n    raise ValueError(\"schools_prepared missing SchoolCode\")\nif schools_prepared_df[\"SchoolCode\"].duplicated().any():\n    raise ValueError(\"schools_prepared has duplicate SchoolCode values\")\nif \"SchoolCode\" not in school_range_df.columns:\n    raise ValueError(\"school_range missing SchoolCode\")\nif school_range_df[\"SchoolCode\"].duplicated().any():\n    raise ValueError(\"school_range has duplicate SchoolCode values\")",
          "source_label": "phase-01-correlation/00a_data_cleaning.py:40-56",
          "source_url": ""
        },
        {
          "title": "One-hot encoding in Isolation Forest pipeline",
          "language": "python",
          "code": "if cat_cols:\n    enc = OneHotEncoder(handle_unknown=\"ignore\", sparse=False)\n    X_cat = enc.fit_transform(work_df[cat_cols])       # learn categories & transform in one step\n    X_cat_df = pd.DataFrame(X_cat, columns=enc.get_feature_names_out(cat_cols), index=work_df.index)\nelse:\n    X_cat_df = pd.DataFrame(index=work_df.index)       # no categorical columns \u2014 empty DataFrame",
          "source_label": "phase-01-correlation/02_isolation_forest.py:162-167",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-003",
      "title": "Comprehensive Correlation Analysis:",
      "status": "partial",
      "status_reason": "Partial: Spearman + FDR + MI are implemented, but Pearson, ANOVA, and Chi-Square are not yet implemented as explicit artifacts.",
      "required_gaps": [
        "Implement Pearson correlation outputs.",
        "Implement ANOVA analyses for categorical predictor vs numeric outcome.",
        "Implement Chi-Square analyses (with strength metric such as Cramer's V).",
        "Replace approximate Spearman p-values with exact `scipy.stats.spearmanr` p-values."
      ],
      "evidence": [
        {
          "label": "Pair metadata rows",
          "value": "467",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        },
        {
          "label": "Traceability status",
          "value": "Partially Met",
          "source_label": "Requirements traceability",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "01_analysis.py (Spearman + FDR + ranking)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "doc",
          "label": "Requirements traceability (REQ-003 gaps)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_notebook",
          "label": "Notebook: 01_analysis",
          "url": "",
          "status": "resolved",
          "note": "Resolved from Databricks workspace metadata."
        },
        {
          "type": "databricks_run",
          "label": "Databricks rollout run: 01_analysis",
          "url": "",
          "status": "resolved",
          "note": "Latest successful 01_analysis run."
        }
      ],
      "code_samples": [
        {
          "title": "Spearman + FDR correction",
          "language": "python",
          "code": "reject, pvals_corrected, _, _ = multipletests(\n    spearman_df[\"p_value\"].fillna(1.0).values, method=\"fdr_bh\"\n)\nspearman_df[\"p_value_fdr\"] = pvals_corrected      # Adjusted p-values\nspearman_df[\"significant_fdr\"] = reject            # True/False: still significant after correction?\nspearman_df[\"abs_r\"] = spearman_df[\"spearman_r\"].abs()  # Absolute correlation strength",
          "source_label": "phase-01-correlation/01_analysis.py:662-667",
          "source_url": ""
        },
        {
          "title": "Combined ranking (0.6 Spearman + 0.4 MI)",
          "language": "python",
          "code": "# Combined rank score: 60% weight on Spearman strength + 40% weight on MI signal.\n# This blends two complementary views of the relationship's importance.\nspearman_df[\"rank_score\"] = 0.6 * spearman_df[\"abs_r\"] + 0.4 * spearman_df[\"mi_score_norm\"]\n",
          "source_label": "phase-01-correlation/01_analysis.py:679-682",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-004",
      "title": "General Anomaly Detection:",
      "status": "met",
      "status_reason": "Met via Isolation Forest (`contamination=0.05`, `random_state=42`) with one-hot encoding and standardized feature scaling.",
      "required_gaps": [],
      "evidence": [
        {
          "label": "Isolation forest rows",
          "value": "1,586",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        },
        {
          "label": "Traceability status",
          "value": "Met",
          "source_label": "Requirements traceability",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "02_isolation_forest.py",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_notebook",
          "label": "Notebook: 02_isolation_forest",
          "url": "",
          "status": "resolved",
          "note": "Resolved from Databricks workspace metadata."
        },
        {
          "type": "databricks_run",
          "label": "Databricks rollout run: 02_isolation_forest",
          "url": "",
          "status": "resolved",
          "note": "Latest successful 02_isolation_forest run."
        }
      ],
      "code_samples": [
        {
          "title": "One-hot + scaling + IsolationForest configuration",
          "language": "python",
          "code": "if cat_cols:\n    enc = OneHotEncoder(handle_unknown=\"ignore\", sparse=False)\n    X_cat = enc.fit_transform(work_df[cat_cols])       # learn categories & transform in one step\n    X_cat_df = pd.DataFrame(X_cat, columns=enc.get_feature_names_out(cat_cols), index=work_df.index)\nelse:\n    X_cat_df = pd.DataFrame(index=work_df.index)       # no categorical columns \u2014 empty DataFrame\n\n# Ensure all numeric columns are float type, then combine numeric + encoded\n# categorical columns side-by-side into one feature matrix called X.\n# X now has one row per school and one column per feature (all numeric).\nX_num_df = work_df[num_cols].astype(float)\nX = pd.concat([X_num_df, X_cat_df], axis=1)\n\n# ---------------------------------------------------------------------------\n# STANDARDIZE / SCALE ALL FEATURES\n#\n# What is StandardScaler?\n# Different columns have very different numeric ranges.  For example:\n#   - EstimatedIncome_Census might be 30,000 \u2013 150,000\n#   - K8Proficiency might be 0 \u2013 100\n#   - FRL_Percent might be 0 \u2013 1\n#\n# Without scaling, the income column would dominate the algorithm simply\n# because its numbers are bigger, NOT because it is more important.\n#\n# StandardScaler fixes this by transforming every column so that:\n#   - Its mean (average) becomes 0\n#   - Its standard deviation (spread) becomes 1\n# After scaling, all columns are on an equal footing.\n# ---------------------------------------------------------------------------\nscaler = StandardScaler()\nX_scaled = scaler.fit_transform(X)  # learn mean/std from X, then rescale X\n\n# ---------------------------------------------------------------------------\n# RUN ISOLATION FOREST\n#\n# What is Isolation Forest?\n# It identifies schools that are unusual across ALL their characteristics at\n# once (not just one metric).  It works by building many random decision trees.\n# Each tree picks a random feature and a random split value, repeatedly\n# dividing schools into smaller groups.  \"Normal\" schools sit in dense clusters\n# and take many splits to separate.  \"Anomalous\" schools sit in sparse, unusual\n# regions of the data and get isolated in very few splits.  A school that is\n# consistently isolated quickly across many trees is flagged as an anomaly.\n#\n# Parameters:\n#   contamination=0.05 \u2014 tells the algorithm to expect that roughly 5% of\n#       schools are anomalies.  For our ~1,586 schools, that is about 79\n#       schools.  This threshold is a judgment call; 5% is a common default.\n#   random_state=42 \u2014 fixed seed so results are reproducible every run.\n#\n# Key outputs:\n#   fit_predict() returns a label for every school:\n#       -1 = anomaly (unusual school)\n#        1 = normal / inlier\n#   decision_function() returns a continuous \"anomaly score\" for every school:\n#       More negative = more anomalous (further from normal).\n#       Values near zero or positive = normal.\n#       This score lets us rank schools by HOW anomalous they are, rather than\n#       just getting a binary yes/no flag.\n# ---------------------------------------------------------------------------\niso_forest = IsolationForest(contamination=0.05, random_state=42)\nanomaly_labels = iso_forest.fit_predict(X_scaled)     # train the model and get -1/1 labels\nanomaly_scores = iso_forest.decision_function(X_scaled)  # get continuous anomaly scores",
          "source_label": "phase-01-correlation/02_isolation_forest.py:162-225",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-005",
      "title": "Reproducible Analysis:",
      "status": "met",
      "status_reason": "Met: notebooks use fixed seeds, table overwrite semantics, and were verified in Databricks runs with reproducible output artifacts.",
      "required_gaps": [],
      "evidence": [
        {
          "label": "Traceability last verified",
          "value": "2026-02-22 (against live Unity Catalog data)",
          "source_label": "Requirements traceability",
          "source_url": ""
        },
        {
          "label": "Snapshot version",
          "value": "2026-02-24",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "01_analysis.py (seed + overwrite)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "repo_file",
          "label": "02_isolation_forest.py (seed + overwrite)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_run",
          "label": "Databricks verification run: codex-temp-correlation-cleaning-verify",
          "url": "",
          "status": "resolved",
          "note": "Recent multi-notebook verification run."
        }
      ],
      "code_samples": [
        {
          "title": "Deterministic seed in analysis",
          "language": "python",
          "code": "# Fix the random seed so results are exactly reproducible every time\n# (some algorithms like MI use randomness internally)\nnp.random.seed(42)",
          "source_label": "phase-01-correlation/01_analysis.py:57-59",
          "source_url": ""
        },
        {
          "title": "Idempotent overwrite write path",
          "language": "python",
          "code": "spark.createDataFrame(outlier_results_df).write.mode(\"overwrite\").option(\"overwriteSchema\", \"true\").saveAsTable(\n    \"helios.correlation_analysis.outlier_results\"\n)\n\n# Table 2: pair_metadata \u2014 one row per feature-outcome pair.\n# Contains model summary stats: R-squared, coefficient, confidence intervals,\n# diagnostic test results, and outlier counts.\nspark.createDataFrame(pair_metadata_df).write.mode(\"overwrite\").option(\"overwriteSchema\", \"true\").saveAsTable(\n    \"helios.correlation_analysis.pair_metadata\"",
          "source_label": "phase-01-correlation/01_analysis.py:1352-1360",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-006",
      "title": "Technical Reporting:",
      "status": "partial",
      "status_reason": "Partial: methodology/report artifacts exist, but `01_analysis.py` TLDR still has placeholder values.",
      "required_gaps": [
        "Replace TLDR placeholders in `01_analysis.py` with validated final numbers from the latest outputs."
      ],
      "evidence": [
        {
          "label": "TLDR placeholder state",
          "value": "Still placeholder values (TBD)",
          "source_label": "01_analysis.py",
          "source_url": ""
        },
        {
          "label": "Traceability status",
          "value": "Partially Met",
          "source_label": "Requirements traceability",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "01_analysis.py TLDR section",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "doc",
          "label": "Requirements traceability (REQ-006 gap)",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "databricks_notebook",
          "label": "Notebook: 01_analysis",
          "url": "",
          "status": "resolved",
          "note": "Resolved from Databricks workspace metadata."
        }
      ],
      "code_samples": [
        {
          "title": "Current TLDR placeholders",
          "language": "python",
          "code": "# MAGIC ## Executive Summary / TLDR\n# MAGIC _To be completed after full analysis (Task 5.5)._  \n# MAGIC - Placeholder: total modeled pairs = TBD  \n# MAGIC - Placeholder: unique outlier schools = TBD  \n# MAGIC - Placeholder: strongest finding = TBD",
          "source_label": "phase-01-correlation/01_analysis.py:14-18",
          "source_url": ""
        }
      ]
    },
    {
      "id": "REQ-007",
      "title": "Outlier Export:",
      "status": "met",
      "status_reason": "Met (operational interpretation): structured export is available through phase-1 delivery CSV snapshot files and loader pipeline.",
      "required_gaps": [],
      "evidence": [
        {
          "label": "Snapshot outlier export rows",
          "value": "502,150",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        },
        {
          "label": "Snapshot source system",
          "value": "mssql_analytics",
          "source_label": "Phase-1 snapshot manifest",
          "source_url": ""
        }
      ],
      "links": [
        {
          "type": "repo_file",
          "label": "Phase-1 demo snapshot manifest",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "repo_file",
          "label": "Snapshot loader script",
          "url": "",
          "status": "resolved",
          "note": null
        },
        {
          "type": "repo_file",
          "label": "Snapshot outlier CSV",
          "url": "",
          "status": "resolved",
          "note": "Large file; link points to repository object."
        }
      ],
      "code_samples": [
        {
          "title": "Snapshot row-count evidence",
          "language": "json",
          "code": "  \"row_counts\": {\n    \"correlation_outlier_results\": 502150,\n    \"correlation_pair_metadata\": 467,\n    \"data_cleaning_pair_summary\": 467,\n    \"isolation_forest_results\": 1586\n  },",
          "source_label": "delivery/reference-stack/seed/phase1-demo/manifest.json:74-79",
          "source_url": ""
        }
      ]
    }
  ],
  "requiredGaps": [
    {
      "id": "req003-pearson",
      "req_id": "REQ-003",
      "label": "Implement Pearson correlation outputs",
      "why": "REQ-003 explicitly requires baseline statistical correlations beyond Spearman + MI.",
      "source_label": "Requirements traceability",
      "source_url": ""
    },
    {
      "id": "req003-anova",
      "req_id": "REQ-003",
      "label": "Implement ANOVA analyses",
      "why": "REQ-003 requires categorical predictor vs numeric outcome statistical testing.",
      "source_label": "Requirements traceability",
      "source_url": ""
    },
    {
      "id": "req003-chi-square",
      "req_id": "REQ-003",
      "label": "Implement Chi-Square analyses with association strength",
      "why": "REQ-003 requires categorical-categorical association testing.",
      "source_label": "Requirements traceability",
      "source_url": ""
    },
    {
      "id": "req003-spearman-exact",
      "req_id": "REQ-003",
      "label": "Replace approximate Spearman p-values with exact `scipy.stats.spearmanr`",
      "why": "Removes a documented methodology caveat and improves statistical correctness.",
      "source_label": "Requirements traceability",
      "source_url": ""
    },
    {
      "id": "req006-tldr",
      "req_id": "REQ-006",
      "label": "Populate final Executive Summary / TLDR in `01_analysis.py`",
      "why": "REQ-006 remains partial until placeholder values are replaced with validated output values.",
      "source_label": "Requirements traceability",
      "source_url": ""
    }
  ],
  "backlog": {
    "recommended_improvement": [
      {
        "label": "Tighten pair selection gating for weak-significance exploratory pairs",
        "why": "Improves interpretation quality by reducing emphasis on flat relationships.",
        "source_label": "Requirements traceability",
        "source_url": ""
      },
      {
        "label": "Surface OLS assumption diagnostics in delivery-facing views",
        "why": "Makes caveats visible to reviewers without opening notebooks.",
        "source_label": "Requirements traceability",
        "source_url": ""
      }
    ],
    "optional_extension": [
      {
        "label": "Add DBSCAN or alternate anomaly triangulation",
        "why": "Adds an optional second anomaly perspective for deeper methodology review.",
        "source_label": "Research notes",
        "source_url": ""
      },
      {
        "label": "Add Databricks Lakeview dashboard",
        "why": "Could provide a persistent shared dashboard backed by the same output tables.",
        "source_label": "Context decisions",
        "source_url": ""
      },
      {
        "label": "Expand Methodology page beyond Phase 1",
        "why": "Current page scope is REQ-001..REQ-007 only; same structure can support REQ-008..REQ-016.",
        "source_label": "Requirements",
        "source_url": ""
      }
    ]
  }
};
