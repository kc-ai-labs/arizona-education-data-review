const { fetchJson } = window.HeliosApi;

const state = {
  chart: null,
  pairRows: [],
  filteredPairRows: [],
  selectedPairKey: null,
  selectedSchoolCode: null,
  predictiveDetail: null,
  pointLookup: new Map(),
  definitionsByField: new Map(),
  startupWarning: null,
  deepLink: {
    pairKey: null,
    schoolCode: null,
    requestedCounty: null,
    requestedScope: null,
    retriedScopeAll: false,
    pairResolved: false
  }
};

function pairKey(row) {
  return `${row.predictor}:::${row.outcome}`;
}

function showError(message) {
  const el = document.getElementById("api-error");
  el.hidden = false;
  el.textContent = message;
}

function clearError() {
  const el = document.getElementById("api-error");
  el.hidden = true;
  el.textContent = "";
}

function addStartupWarning(message) {
  if (!message) return;
  if (!state.startupWarning) {
    state.startupWarning = message;
    return;
  }
  if (!state.startupWarning.includes(message)) {
    state.startupWarning = `${state.startupWarning} ${message}`;
  }
}

function popStartupWarning() {
  const warning = state.startupWarning;
  state.startupWarning = null;
  return warning;
}

function parseDeepLinkFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const predictor = params.get("predictor");
  const outcome = params.get("outcome");
  const county = params.get("county");
  const scope = params.get("scope");
  const schoolCode = params.get("schoolCode");

  state.deepLink = {
    pairKey: null,
    schoolCode: null,
    requestedCounty: county || null,
    requestedScope: scope || null,
    retriedScopeAll: false,
    pairResolved: false
  };

  if ((predictor && !outcome) || (!predictor && outcome)) {
    addStartupWarning("Deep-link pair requires both predictor and outcome parameters; ignoring partial pair request.");
  } else if (predictor && outcome) {
    state.deepLink.pairKey = `${predictor}:::${outcome}`;
  }

  if (schoolCode != null && schoolCode !== "") {
    if (/^-?\d+$/.test(schoolCode)) {
      state.deepLink.schoolCode = Number(schoolCode);
    } else {
      addStartupWarning(`Requested schoolCode '${schoolCode}' is invalid; ignoring school focus.`);
    }
  }

  if (scope && scope !== "default" && scope !== "all") {
    addStartupWarning(`Requested scope '${scope}' is invalid; using current page default.`);
    state.deepLink.requestedScope = null;
  }
}

function applyDeepLinkControlSelections() {
  const countyEl = document.getElementById("co-county");
  const scopeEl = document.getElementById("co-scope");

  if (state.deepLink.requestedCounty) {
    if ([...countyEl.options].some(o => o.value === state.deepLink.requestedCounty)) {
      countyEl.value = state.deepLink.requestedCounty;
    } else {
      addStartupWarning(`Requested county '${state.deepLink.requestedCounty}' is unavailable; using current county selection.`);
    }
  }

  if (state.deepLink.requestedScope) {
    if (state.deepLink.requestedScope === "default" || state.deepLink.requestedScope === "all") {
      scopeEl.value = state.deepLink.requestedScope;
    }
  }
}

function safeText(value) {
  return value == null || value === "" ? "-" : String(value);
}

function safeNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function selectedCounty() {
  return document.getElementById("co-county").value || "all";
}

function selectedCountyLabel() {
  const el = document.getElementById("co-county");
  return el?.options?.[el.selectedIndex]?.text || "All";
}

function selectedScope() {
  return document.getElementById("co-scope")?.value || "default";
}

function selectedScopeLabel() {
  return selectedScope() === "all" ? "All modeled pairs (including exploratory)" : "High-signal only";
}

function qualityBandLabel(value) {
  const v = String(value || "").toLowerCase();
  if (v === "high_signal_sparse_exception") return "High-signal sparse exception";
  if (v === "actionable_exploratory") return "Exploratory";
  if (v) return v.replaceAll("_", " ");
  return "Unlabeled";
}

function buildPairEvidence(pair) {
  const helper = window.HeliosCorrelationEvidence;
  if (!pair || !helper?.buildEvidenceModel) return null;
  return helper.buildEvidenceModel({
    nObs: pair.nObs,
    spearmanR: pair.spearmanR,
    spearmanPCorrected: pair.spearmanPCorrected,
    rSquared: pair.rSquared,
    qualityBand: pair.qualityBand,
    isHighSignalDefault: pair.isHighSignalDefault,
    defaultVisibilityRank: pair.defaultVisibilityRank
  });
}

function describeCorrelationStrength(spearmanR) {
  if (spearmanR == null || Number.isNaN(Number(spearmanR))) return "unknown";
  const abs = Math.abs(Number(spearmanR));
  if (abs < 0.2) return "weak";
  if (abs < 0.4) return "modest";
  if (abs < 0.6) return "moderate";
  return "strong";
}

function describeAssociationDirection(spearmanR) {
  if (spearmanR == null || Number.isNaN(Number(spearmanR))) return "unknown";
  const value = Number(spearmanR);
  if (Math.abs(value) < 1e-9) return "roughly flat";
  return value > 0 ? "positive (higher predictor is usually associated with higher outcome)" : "negative (higher predictor is usually associated with lower outcome)";
}

function explainWarnings(pair) {
  const notes = [];
  if (pair?.hasJbWarning) {
    notes.push("JB residual warning: the residuals do not look normally distributed, so treat exact regression-based thresholds with extra caution.");
  }
  if (pair?.hasBpWarning) {
    notes.push("BP variance warning: the spread around the line changes across the predictor range (uneven variance), so the line fit may be less stable for some schools.");
  }
  return notes;
}

function renderCorrelationInterpretation(detail) {
  const root = document.getElementById("co-interpret-content");
  if (!root) return;

  const pair = detail?.pair;
  if (!pair) {
    root.innerHTML = `
      <p class="subtle">Select a pair to see a plain-English explanation of what the chart, metrics, and outlier tables mean.</p>
      <p class="interpret-note">This page compares one predictor and one outcome at a time and highlights schools unusually above or below the expected trend.</p>
    `;
    return;
  }

  const pairName = `${pair.predictorLabel || pair.predictor} -> ${pair.outcomeLabel || pair.outcome}`;
  const strength = describeCorrelationStrength(pair.spearmanR);
  const directionText = describeAssociationDirection(pair.spearmanR);
  const evidence = buildPairEvidence(pair);
  const warnings = explainWarnings(pair);
  const cleaning = detail?.dataCleaning || {};
  const thresholds = detail?.thresholds || {};
  const lowSample = Number(pair.nObs || 0) > 0 && Number(pair.nObs || 0) < 30;
  const scopeLabel = selectedScopeLabel();

  const metricRows = [
    ["Schools (n)", safeText(pair.nObs), "Included schools used to fit this pair after data cleaning."],
    ["Outliers", safeText(pair.nOutliers), "Schools flagged as unusually far above or below the fitted line."],
    ["Outlier %", safeText(safeNumber(pair.outlierPct, 2)), "Share of included schools flagged for this pair (lower can be more interesting when the trend is strong)."],
    ["Positive / Negative", `${safeText(pair.nPositive)}/${safeText(pair.nNegative)}`, "Outliers above expected trend vs below expected trend."],
    ["R²", safeText(safeNumber(pair.rSquared, 3)), "How much of the outcome variation is explained by the fitted line (higher means the line explains more variation)."],
    ["Spearman rho (rho)", safeText(safeNumber(pair.spearmanR, 3)), `Monotonic association strength and direction for this pair (${strength}).`],
    ["FDR-adjusted p", safeText(safeNumber(pair.spearmanPCorrected, 4)), "Multiple-testing-adjusted significance check for the Spearman association."],
    ["Significance tier", safeText(evidence?.significanceBand?.label), "Tiered significance interpretation using the FDR-adjusted p-value."],
    ["Evidence tier", safeText(evidence?.evidenceTier?.label), "User-friendly evidence level from n, rho, R², FDR p, and pair class context."],
    ["Relationship rank tier", safeText(evidence?.rankTier?.label), "Categorical rank from modeled default visibility ordering (Top-tier / Mid-tier / Lower-tier)."],
    ["Pair Class", safeText(qualityBandLabel(pair.qualityBand)), "High-signal pairs are shown by default; exploratory pairs can be revealed with the Pair Scope control."],
    ["IF Overlap", safeText(pair.ifOverlapCount), "Outlier schools that were also flagged by Isolation Forest (a separate anomaly method)."],
    ["Excluded (cleaning)", safeText(pair.nExcludedCleaningTotal), "Schools removed before modeling because the predictor or outcome was missing or invalid."],
    ["Cook's D threshold", safeText(safeNumber(thresholds.cooksDThreshold, 4)), "Influence threshold used in the outlier flag rule for this pair."],
    ["Std residual threshold", safeText(safeNumber(thresholds.studentizedResidualThreshold, 2)), "Residual-based threshold used with Cook's D to flag correlation outliers."]
  ];

  const metricRowsHtml = metricRows.map(([label, value, meaning]) => `
    <div class="interpret-metric-row">
      <dt>${escapeHtml(label)}</dt>
      <dd><span class="mono">${escapeHtml(String(value))}</span> <span class="subtle">${escapeHtml(meaning)}</span></dd>
    </div>
  `).join("");

  const warningHtml = warnings.length
    ? `<ul class="interpret-list">${warnings.map(w => `<li>${escapeHtml(w)}</li>`).join("")}</ul>`
    : `<p class="subtle">No JB/BP warning badges are shown for this pair.</p>`;

  const lowSampleHtml = lowSample
    ? `<p class="interpret-note">Caution: this pair uses fewer than 30 schools after cleaning, so the fitted trend and outlier thresholds may be less stable.</p>`
    : "";

  root.innerHTML = `
    <div class="interpret-grid">
      <section class="interpret-section">
        <h3>What this pair means</h3>
        <p>This pair compares <strong>${escapeHtml(pair.predictorLabel || pair.predictor)}</strong> (predictor) with <strong>${escapeHtml(pair.outcomeLabel || pair.outcome)}</strong> (outcome).</p>
        <p>The fitted line shows the expected outcome trend for schools with similar predictor values. Outlier schools are unusually above or below that expected trend.</p>
        <p>For the selected county filter (<strong>${escapeHtml(selectedCountyLabel())}</strong>), this pair shows a <strong>${escapeHtml(strength)}</strong> association and a <strong>${escapeHtml(directionText)}</strong> pattern based on Spearman rho.</p>
        <p>Evidence status: <strong>${escapeHtml(evidence?.evidenceTier?.label || "Limited evidence")}</strong>; significance: <strong>${escapeHtml(evidence?.significanceBand?.label || "Unknown significance")}</strong>; relationship rank tier: <strong>${escapeHtml(evidence?.rankTier?.label || "Lower-tier")}</strong>.</p>
        <p>This page is currently showing the pair list scope <strong>${escapeHtml(scopeLabel)}</strong>. A pair can appear in the Scatter Plot page but not the default list here if it is modeled as exploratory rather than high-signal.</p>
        <p><strong>Plain English:</strong> this chart helps you find schools doing better or worse than expected compared with other schools that have similar predictor values for this pair.</p>
        ${lowSampleHtml}
      </section>

      <section class="interpret-section">
        <h3>How to read the chart</h3>
        <ul class="interpret-list">
          <li>Gray points show typical variation around the trend line.</li>
          <li>Colored points are correlation outliers (unusually far above or below the line).</li>
          <li><code>positive</code> outliers are above expected for their predictor value; <code>negative</code> outliers are below expected.</li>
          <li>Gold point borders indicate overlap with Isolation Forest (a separate anomaly method).</li>
          <li>The solid line is the OLS fit (the average trend). Dashed lines show a 95% prediction/confidence-style band used for visual context around that trend.</li>
          <li>Points far from the line (especially outside the dashed band) are visually unusual, but the formal outlier rule uses residual diagnostics, not just eye test distance.</li>
        </ul>
      </section>

      <section class="interpret-section">
        <h3>How to read the pair metrics and tables</h3>
        <ul class="interpret-list">
          <li>The metric chips summarize included schools, outlier counts, relationship strength, and cleaning exclusions for the selected pair.</li>
          <li>The <strong>Selected Pair Outlier Schools</strong> table lists the flagged schools and key diagnostics.</li>
          <li><strong>Dir</strong> shows above/below expected trend. <strong>Std Resid</strong> shows how unusual the school is (distance from line scaled by typical spread). <strong>Cook's D</strong> shows how strongly the point influences the fitted line. <strong>IF</strong> shows overlap with the global anomaly model.</li>
          <li>The <strong>School Detail</strong> card explains one school in context: actual value, expected value (fitted), residual (<code>actual - expected</code>), standardized residual, Cook's D, and IF score.</li>
        </ul>
      </section>

      <section class="interpret-section">
        <h3>Statistical methods and warnings</h3>
        <ul class="interpret-list">
          <li><strong>OLS regression</strong>: fits the best straight-line summary of the association for this pair and provides each school's expected outcome (fitted value).</li>
          <li><strong>Residual</strong>: <code>actual outcome - fitted outcome</code>. Positive residual means above expected; negative means below expected.</li>
          <li><strong>Studentized / standardized residual</strong>: residual divided by its estimated spread, so schools can be compared on a common scale. Larger absolute values mean the point is more unusual.</li>
          <li><strong>Cook's Distance</strong>: how much a school influences the fitted line. A point can matter because it is unusual and/or because it strongly shifts the line.</li>
          <li><strong>Spearman rho (rho)</strong>: rank-based association strength/direction. It is useful when the pattern is monotonic but not perfectly linear.</li>
          <li><strong>R²</strong>: the share of outcome variation explained by the OLS line. Higher R² means the line explains more variation, but it still does not imply causation.</li>
          <li><strong>Isolation Forest overlap</strong>: a separate anomaly signal across many features. Overlap means the school looks unusual in this pair and in the broader anomaly scan.</li>
          <li><strong>JB / BP warnings</strong>: diagnostic checks for residual shape and uneven variance. Warnings mean "interpret with caution," not "ignore this pair."</li>
        </ul>
        ${warningHtml}
      </section>

      <section class="interpret-section interpret-section-full">
        <h3>Numbers shown on this pair (and what they mean)</h3>
        <dl class="interpret-metric-list">${metricRowsHtml}</dl>
        <p class="interpret-note">How to read the key numbers together: <strong>n</strong> tells you how much data the pair used, <strong>R²</strong> and <strong>rho</strong> describe the trend strength, and <strong>Std Resid / Cook's D</strong> explain why a school was flagged as an outlier.</p>
        <p class="interpret-note">${escapeHtml(cleaning.noteText || "Pair-level data cleaning note is unavailable for this pair.")}</p>
        <p class="interpret-note">Missing and invalid values are tracked separately. The pair's <strong>n</strong> uses only the included schools after cleaning.</p>
        <p class="interpret-note">${escapeHtml(window.HeliosCorrelationEvidence?.scopeNote || "Correlation strength/significance values are sourced from the latest statewide modeled run.")}</p>
        <p class="interpret-note">Interpretation rule: this page shows <strong>association</strong>, not proof that the predictor causes the outcome. Confounding and small-school volatility can affect patterns.</p>
      </section>
    </div>
  `;
}

function updateKpis(summary, scope) {
  const modeledPairsLabel = document.getElementById("kpi-modeled-pairs-label");
  if (modeledPairsLabel) {
    modeledPairsLabel.textContent = scope === "all" ? "Modeled Pairs (All)" : "Modeled Pairs (High-signal)";
  }
  document.getElementById("kpi-modeled-pairs").textContent = summary?.modeledPairs ?? 0;
  document.getElementById("kpi-outlier-schools").textContent = summary?.uniqueCorrelationOutlierSchools ?? 0;
  document.getElementById("kpi-if-schools").textContent = summary?.isolationForestAnomalySchools ?? 0;
  document.getElementById("kpi-overlap").textContent = summary?.overlapSchools ?? 0;
}

function sortPairs(rows) {
  return [...rows].sort((a, b) => {
    const highA = a.isHighSignalDefault ? 1 : 0;
    const highB = b.isHighSignalDefault ? 1 : 0;
    const byHigh = highB - highA;
    if (byHigh !== 0) return byHigh;
    const rankA = Number.isFinite(Number(a.defaultVisibilityRank)) ? Number(a.defaultVisibilityRank) : Number.MAX_SAFE_INTEGER;
    const rankB = Number.isFinite(Number(b.defaultVisibilityRank)) ? Number(b.defaultVisibilityRank) : Number.MAX_SAFE_INTEGER;
    const byRank = rankA - rankB;
    if (byRank !== 0) return byRank;
    const outPctA = Number.isFinite(Number(a.outlierPct)) ? Number(a.outlierPct) : Number.POSITIVE_INFINITY;
    const outPctB = Number.isFinite(Number(b.outlierPct)) ? Number(b.outlierPct) : Number.POSITIVE_INFINITY;
    const byOutPct = outPctA - outPctB;
    if (byOutPct !== 0) return byOutPct;
    const byAbsR = Math.abs(Number(b.spearmanR || 0)) - Math.abs(Number(a.spearmanR || 0));
    if (byAbsR !== 0) return byAbsR;
    const byR2 = Number(b.rSquared || 0) - Number(a.rSquared || 0);
    if (byR2 !== 0) return byR2;
    return pairKey(a).localeCompare(pairKey(b));
  });
}

function applyPairSearch() {
  const query = document.getElementById("pair-search").value.trim().toLowerCase();
  state.filteredPairRows = state.pairRows.filter(row => {
    if (!query) return true;
    const haystack = [
      row.predictor, row.outcome, row.predictorLabel, row.outcomeLabel
    ].filter(Boolean).join(" ").toLowerCase();
    return haystack.includes(query);
  });
  renderPairList();
}

async function resolvePairSelection({ preferDeepLink = false } = {}) {
  if (!state.filteredPairRows.length) {
    state.selectedPairKey = null;
    renderEmptyDetailState();
    return;
  }

  if (preferDeepLink && state.deepLink.pairKey && !state.deepLink.pairResolved) {
    const requestedPair = state.pairRows.find(row => pairKey(row) === state.deepLink.pairKey);
    if (requestedPair) {
      state.deepLink.pairResolved = true;
      await selectPair(requestedPair);
      return;
    }

    if (selectedScope() === "default" && !state.deepLink.retriedScopeAll) {
      state.deepLink.retriedScopeAll = true;
      document.getElementById("co-scope").value = "all";
      await refreshPage({ preferDeepLink: true });
      return;
    }

    addStartupWarning(`Requested pair '${state.deepLink.pairKey}' is unavailable for current filters; showing default top pair instead.`);
    state.deepLink.pairResolved = true;
  }

  const selectedRow = state.filteredPairRows.find(row => pairKey(row) === state.selectedPairKey);
  if (selectedRow) {
    renderPairList();
    return;
  }

  await selectPair(state.filteredPairRows[0]);
}

function renderPairList() {
  const tbody = document.getElementById("pair-list-body");
  const empty = document.getElementById("pair-list-empty");

  tbody.innerHTML = "";
  empty.hidden = state.filteredPairRows.length !== 0;

  state.filteredPairRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    if (pairKey(row) === state.selectedPairKey) tr.classList.add("is-selected");
    tr.addEventListener("click", () => selectPair(row));
    const evidence = buildPairEvidence(row);

    const warnText = [row.hasJbWarning ? "JB" : null, row.hasBpWarning ? "BP" : null].filter(Boolean).join(", ") || "-";
    const pairLabel = `${row.predictorLabel || row.predictor} → ${row.outcomeLabel || row.outcome}`;
    const pairBadges = [
      row.isHighSignalDefault ? '<span class="chip info-chip">High-signal</span>' : '<span class="chip">Exploratory</span>',
      row.isActionablePair ? '<span class="chip warn-chip">Actionable</span>' : null
    ].filter(Boolean).join(" ");
    const cells = [
      pairLabel,
      row.nOutliers ?? 0,
      `${row.nPositive ?? 0}/${row.nNegative ?? 0}`,
      safeNumber(row.rSquared, 3),
      safeNumber(row.spearmanR, 3),
      safeNumber(row.spearmanPCorrected, 4),
      evidence?.evidenceTier?.label || "-",
      evidence?.rankTier?.label || "-",
      row.ifOverlapCount ?? 0,
      warnText
    ];
    cells.forEach((cell, idx) => {
      const td = document.createElement("td");
      if (idx === 0) {
        td.classList.add("pair-label-cell");
        td.innerHTML = `
          <div>${escapeHtml(String(cell))}</div>
          <div class="chip-row" style="margin-top:4px;">${pairBadges}</div>
          <div class="subtle" style="margin-top:3px;">${escapeHtml(qualityBandLabel(row.qualityBand))}${row.outlierPct == null ? "" : ` · outlier % ${escapeHtml(safeNumber(row.outlierPct, 2))}`}</div>
        `;
      } else {
        td.textContent = String(cell);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function renderEmptyDetailState() {
  document.getElementById("pair-title").textContent = "No pair selected";
  document.getElementById("pair-subtitle").textContent = "Adjust filters or search.";
  document.getElementById("pair-warning-chips").innerHTML = "";
  document.getElementById("pair-metrics").innerHTML = "";
  document.getElementById("pair-outliers-body").innerHTML = "";
  document.getElementById("pair-outliers-empty").hidden = false;
  document.getElementById("school-detail").innerHTML = `<p class="subtle">Select an outlier school from the table or chart.</p>`;
  document.getElementById("selected-definitions").innerHTML = `<p class="subtle">Definitions appear after a pair is selected.</p>`;
  const correlationNote = document.getElementById("pair-correlation-note");
  if (correlationNote) correlationNote.textContent = "Correlation summary appears after a pair is selected.";
  const cleaningNote = document.getElementById("pair-cleaning-note");
  if (cleaningNote) cleaningNote.textContent = "Pair-level data cleaning exclusions appear after a pair is selected.";
  renderCorrelationInterpretation(null);
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
}

function renderPairSummary(detail) {
  const pair = detail?.pair;
  if (!pair) {
    renderEmptyDetailState();
    return;
  }

  document.getElementById("pair-title").textContent = `${pair.predictorLabel || pair.predictor} → ${pair.outcomeLabel || pair.outcome}`;
  document.getElementById("pair-subtitle").textContent = `Predictor: ${pair.predictor} | Outcome: ${pair.outcome} | ${qualityBandLabel(pair.qualityBand)}`;
  const evidence = buildPairEvidence(pair);

  const metrics = [
    ["Schools (n)", pair.nObs],
    ["Outliers", pair.nOutliers],
    ["Positive", pair.nPositive],
    ["Negative", pair.nNegative],
    ["R²", safeNumber(pair.rSquared, 3)],
    ["Spearman ρ", safeNumber(pair.spearmanR, 3)],
    ["FDR p", safeNumber(pair.spearmanPCorrected, 4)],
    ["Significance tier", safeText(evidence?.significanceBand?.label)],
    ["Evidence tier", safeText(evidence?.evidenceTier?.label)],
    ["Rank tier", safeText(evidence?.rankTier?.label)],
    ["Outlier %", safeNumber(pair.outlierPct, 2)],
    ["IF Overlap", pair.ifOverlapCount],
    ["Excluded (cleaning)", pair.nExcludedCleaningTotal],
    ["Cook's D Threshold", safeNumber(detail?.thresholds?.cooksDThreshold, 4)]
  ];
  document.getElementById("pair-metrics").innerHTML = metrics.map(([label, value]) => `
    <div class="metric-chip">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `).join("");

  const warnChips = [];
  warnChips.push(`<span class="chip info-chip">${escapeHtml(qualityBandLabel(pair.qualityBand))}</span>`);
  if (pair.isActionablePair) warnChips.push('<span class="chip warn-chip">Actionable pair</span>');
  if (pair.hasJbWarning) warnChips.push('<span class="chip warn-chip">JB residual warning</span>');
  if (pair.hasBpWarning) warnChips.push('<span class="chip warn-chip">BP variance warning</span>');
  document.getElementById("pair-warning-chips").innerHTML = warnChips.join("");
  const correlationNote = document.getElementById("pair-correlation-note");
  const selectedRow = state.pairRows.find(r => pairKey(r) === pairKey(pair)) || null;
  const strengthCaption = window.HeliosCorrelationEvidence?.buildScatterStrengthCaption
    ? window.HeliosCorrelationEvidence.buildScatterStrengthCaption({
      spearmanR: pair.spearmanR ?? selectedRow?.spearmanR,
      spearmanPCorrected: pair.spearmanPCorrected ?? selectedRow?.spearmanPCorrected,
      nObs: pair.nObs ?? selectedRow?.nObs
    })
    : null;
  if (correlationNote) {
    if (strengthCaption) {
      correlationNote.innerHTML = `<strong>${escapeHtml(strengthCaption)}</strong>`;
    } else {
      correlationNote.textContent = "Correlation summary is unavailable for this pair.";
    }
  }
  const cleaningNote = document.getElementById("pair-cleaning-note");
  if (cleaningNote) {
    const noteText = detail?.dataCleaning?.noteText || "Pair-level data cleaning exclusions are unavailable for this pair.";
    cleaningNote.textContent = noteText;
  }

  renderDefinitionsForPair(pair);
}

function renderDefinitionsForPair(pair) {
  const root = document.getElementById("selected-definitions");
  const predictorDef = state.definitionsByField.get(pair.predictor);
  const outcomeDef = state.definitionsByField.get(pair.outcome);
  const cards = [
    ["Predictor", pair.predictor, pair.predictorLabel, predictorDef],
    ["Outcome", pair.outcome, pair.outcomeLabel, outcomeDef]
  ];
  root.innerHTML = cards.map(([title, field, label, def]) => `
    <article class="definition-mini-card">
      <h3>${escapeHtml(title)}</h3>
      <p><strong>${escapeHtml(label || field)}</strong></p>
      <p class="mono">${escapeHtml(field)}</p>
      <p class="subtle">${escapeHtml(def?.constantDesc || "No definition text available in analytics.dim_fields.")}</p>
      <p class="subtle">Category: ${escapeHtml(def?.category || "-")}</p>
      <p class="subtle">Cleaning: ${escapeHtml(def?.cleaningEnabled ? (def.cleaningDataKind || "enabled") : "not configured")}</p>
      <p class="subtle">${escapeHtml(def?.cleaningRuleNotes || "")}</p>
    </article>
  `).join("");
}

function buildChartDatasets(points) {
  const non = [];
  const pos = [];
  const neg = [];
  const ordered = [...points].sort((a, b) => Number(a.predictorValue || 0) - Number(b.predictorValue || 0));

  state.pointLookup = new Map();

  points.forEach(p => {
    const point = { x: p.predictorValue, y: p.outcomeValue, meta: p };
    if (p.isOutlier) {
      if ((p.direction || "").toLowerCase() === "negative") neg.push(point);
      else pos.push(point);
    } else {
      non.push(point);
    }
  });

  [non, pos, neg].forEach((dataset, datasetIndex) => {
    dataset.forEach((point, index) => {
      if (point.meta?.schoolCode != null) {
        state.pointLookup.set(Number(point.meta.schoolCode), { datasetIndex, index });
      }
    });
  });

  return [
    {
      label: "Non-outlier",
      data: non,
      showLine: false,
      pointRadius: (ctx) => isHighlightedPoint(ctx) ? 7 : 4,
      pointHoverRadius: 6,
      pointBackgroundColor: "rgba(190, 204, 214, 0.35)",
      pointBorderColor: "rgba(220, 232, 240, 0.6)",
      pointBorderWidth: 0.8
    },
    {
      label: "Positive outlier",
      data: pos,
      showLine: false,
      pointRadius: (ctx) => isHighlightedPoint(ctx) ? 8 : 5,
      pointHoverRadius: 7,
      pointBackgroundColor: "rgba(53, 196, 153, 0.82)",
      pointBorderColor: (ctx) => borderColorForPoint(ctx, "#35c499"),
      pointBorderWidth: (ctx) => borderWidthForPoint(ctx)
    },
    {
      label: "Negative outlier",
      data: neg,
      showLine: false,
      pointRadius: (ctx) => isHighlightedPoint(ctx) ? 8 : 5,
      pointHoverRadius: 7,
      pointBackgroundColor: "rgba(236, 104, 124, 0.82)",
      pointBorderColor: (ctx) => borderColorForPoint(ctx, "#ee687c"),
      pointBorderWidth: (ctx) => borderWidthForPoint(ctx)
    },
    {
      label: "OLS fit",
      data: ordered.map(p => ({ x: p.predictorValue, y: p.fittedValue })),
      showLine: true,
      pointRadius: 0,
      borderColor: "rgba(77, 163, 209, 0.95)",
      borderWidth: 2
    },
    {
      label: "95% CI upper",
      data: ordered.map(p => ({ x: p.predictorValue, y: p.predCiUpper })),
      showLine: true,
      pointRadius: 0,
      borderColor: "rgba(118, 168, 197, 0.8)",
      borderWidth: 1.5,
      borderDash: [5, 5]
    },
    {
      label: "95% CI lower",
      data: ordered.map(p => ({ x: p.predictorValue, y: p.predCiLower })),
      showLine: true,
      pointRadius: 0,
      borderColor: "rgba(118, 168, 197, 0.8)",
      borderWidth: 1.5,
      borderDash: [5, 5]
    }
  ];
}

function isHighlightedPoint(ctx) {
  const schoolCode = ctx.raw?.meta?.schoolCode;
  return schoolCode != null && state.selectedSchoolCode != null && Number(schoolCode) === Number(state.selectedSchoolCode);
}

function borderWidthForPoint(ctx) {
  const isIf = !!ctx.raw?.meta?.isIfAnomaly;
  const highlighted = isHighlightedPoint(ctx);
  if (highlighted && isIf) return 3;
  if (highlighted) return 2.4;
  if (isIf) return 2;
  return 0.8;
}

function borderColorForPoint(ctx, baseColor) {
  if (isHighlightedPoint(ctx)) return "#ffffff";
  if (ctx.raw?.meta?.isIfAnomaly) return "#f6d978";
  return baseColor;
}

function renderChart(detail) {
  const canvas = document.getElementById("correlation-outlier-chart");
  const ctx = canvas.getContext("2d");
  const datasets = buildChartDatasets(detail?.points || []);
  if (state.chart) state.chart.destroy();

  state.chart = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: {
          labels: {
            color: "#d8e6ee",
            filter: (item) => !item.text.includes("CI ")
          }
        },
        tooltip: {
          callbacks: {
            label: (tooltipCtx) => {
              const m = tooltipCtx.raw?.meta;
              if (!m) return `${safeNumber(tooltipCtx.parsed.x)} / ${safeNumber(tooltipCtx.parsed.y)}`;
              const parts = [
                safeText(m.schoolName || `School ${m.schoolCode}`),
                `X=${safeNumber(m.predictorValue, 1)}`,
                `Y=${safeNumber(m.outcomeValue, 1)}`
              ];
              if (m.direction) parts.push(m.direction);
              if (m.stdResid != null) parts.push(`std=${safeNumber(m.stdResid, 2)}`);
              if (m.cooksD != null) parts.push(`Cook's D=${safeNumber(m.cooksD, 4)}`);
              if (m.isIfAnomaly) parts.push("IF overlap");
              return parts.join(" | ");
            }
          }
        }
      },
      onClick: async (_event, activeEls) => {
        if (!activeEls.length) return;
        const first = activeEls[0];
        const raw = state.chart.data.datasets[first.datasetIndex]?.data?.[first.index];
        if (raw?.meta?.schoolCode != null) {
          await selectSchool(raw.meta.schoolCode);
        }
      },
      scales: {
        x: {
          grid: { color: "#355869" },
          ticks: { color: "#d8e6ee" },
          title: { display: true, color: "#d8e6ee", text: safeText(detail?.pair?.predictorLabel || detail?.pair?.predictor) }
        },
        y: {
          grid: { color: "#355869" },
          ticks: { color: "#d8e6ee" },
          title: { display: true, color: "#d8e6ee", text: safeText(detail?.pair?.outcomeLabel || detail?.pair?.outcome) }
        }
      }
    }
  });
}

function focusChartPoint(schoolCode) {
  if (!state.chart) return;
  const hit = state.pointLookup.get(Number(schoolCode));
  if (!hit) {
    state.chart.update("none");
    return;
  }
  const pointEl = state.chart.getDatasetMeta(hit.datasetIndex)?.data?.[hit.index];
  const center = pointEl?.getCenterPoint ? pointEl.getCenterPoint() : { x: 0, y: 0 };
  state.chart.tooltip.setActiveElements([{ datasetIndex: hit.datasetIndex, index: hit.index }], center);
  state.chart.update("none");
}

function syncOutlierSelection() {
  document.querySelectorAll("#pair-outliers-body tr").forEach(tr => {
    const code = Number(tr.dataset.schoolCode);
    tr.classList.toggle("is-selected", state.selectedSchoolCode != null && code === Number(state.selectedSchoolCode));
  });
}

function renderOutlierTable(detail) {
  const tbody = document.getElementById("pair-outliers-body");
  const empty = document.getElementById("pair-outliers-empty");
  tbody.innerHTML = "";

  const rows = detail?.outliers || [];
  empty.hidden = rows.length !== 0;

  rows.forEach(row => {
    const tr = document.createElement("tr");
    tr.className = "clickable-row";
    tr.dataset.schoolCode = String(row.schoolCode);
    [
      safeText(row.schoolName || `School ${row.schoolCode}`),
      safeText(row.county),
      safeText(row.direction),
      safeNumber(row.stdResid, 2),
      safeNumber(row.cooksD, 4),
      row.isIfAnomaly ? "Yes" : "No"
    ].forEach(text => {
      const td = document.createElement("td");
      td.textContent = String(text);
      tr.appendChild(td);
    });
    tr.addEventListener("mouseenter", () => focusChartPoint(row.schoolCode));
    tr.addEventListener("click", async () => {
      await selectSchool(row.schoolCode);
    });
    tbody.appendChild(tr);
  });
  syncOutlierSelection();
}

function renderSchoolDetail(detail) {
  const root = document.getElementById("school-detail");
  const first = detail?.rows?.[0];
  if (!first) {
    root.innerHTML = `<p class="subtle">${escapeHtml(detail?.metadata?.summaryText || "Select an outlier school from the table or chart.")}</p>`;
    return;
  }

  const ifBadge = detail.isIfAnomaly ? '<span class="chip info-chip">IF anomaly</span>' : "";
  const predictive = state.predictiveDetail;
  const predictiveDrivers = (predictive?.topDrivers || []).slice(0, 5);
  const predictiveSection = predictive == null
    ? ""
    : !predictive.available
      ? `
        <section class="predictive-insight-card">
          <h4>Predictive Insight</h4>
          <p class="subtle">${escapeHtml(predictive?.metadata?.emptyReason || "Predictive insight is unavailable for this school/outcome.")}</p>
        </section>
      `
      : `
        <section class="predictive-insight-card">
          <div class="school-detail-head">
            <h4>Predictive Insight</h4>
            <div class="chip-row">${predictive.isModelSurprise ? '<span class="chip warn-chip">Model surprise</span>' : '<span class="chip info-chip">Within expected range</span>'}</div>
          </div>
          <p class="predictive-note">This section compares the school against the XGBoost multivariable expectation for <strong>${escapeHtml(predictive.outcome)}</strong>. It complements the pair-specific OLS outlier above; it does not replace it.</p>
          <dl class="summary-list compact-summary">
            <div><dt>Actual</dt><dd>${escapeHtml(safeNumber(predictive.actualValue, 1))}</dd></div>
            <div><dt>Predicted</dt><dd>${escapeHtml(safeNumber(predictive.predictedValue, 1))}</dd></div>
            <div><dt>Residual</dt><dd>${escapeHtml(safeNumber(predictive.residual, 2))}</dd></div>
            <div><dt>Std Resid</dt><dd>${escapeHtml(safeNumber(predictive.stdResidual, 2))}</dd></div>
            <div><dt>Holdout RMSE</dt><dd>${escapeHtml(safeNumber(predictive.modelMetrics?.holdoutRmse, 2))}</dd></div>
            <div><dt>Holdout R²</dt><dd>${escapeHtml(safeNumber(predictive.modelMetrics?.holdoutR2, 3))}</dd></div>
          </dl>
          <p class="predictive-note">Top driver signals from SHAP for this school:</p>
          ${predictiveDrivers.length
            ? `<ul class="predictive-driver-list">${predictiveDrivers.map(driver => `
                <li>
                  <strong>${escapeHtml(driver.featureLabel || driver.featureName)}</strong>
                  <span class="subtle">(${escapeHtml(driver.direction || "mixed")} influence, SHAP ${escapeHtml(safeNumber(driver.shapValue, 2))}, value ${escapeHtml(safeText(driver.featureValue))})</span>
                </li>
              `).join("")}</ul>`
            : `<p class="subtle">No school-level driver rows are available for this prediction.</p>`}
        </section>
      `;
  root.innerHTML = `
    <div class="school-detail-head">
      <div>
        <h3>${escapeHtml(detail.schoolName || `School ${detail.schoolCode}`)}</h3>
        <p class="subtle">SchoolCode ${escapeHtml(detail.schoolCode)} | ${escapeHtml(detail.districtName)} | ${escapeHtml(detail.county)}</p>
      </div>
      <div class="chip-row">${ifBadge}</div>
    </div>
    <p class="school-summary">${escapeHtml(detail.metadata?.summaryText || "")}</p>
    <dl class="summary-list compact-summary">
      <div><dt>Direction</dt><dd>${escapeHtml(first.direction)}</dd></div>
      <div><dt>Predictor Value</dt><dd>${escapeHtml(safeNumber(first.predictorValue, 1))}</dd></div>
      <div><dt>Outcome Value</dt><dd>${escapeHtml(safeNumber(first.outcomeValue, 1))}</dd></div>
      <div><dt>Fitted Value</dt><dd>${escapeHtml(safeNumber(first.fittedValue, 1))}</dd></div>
      <div><dt>Residual</dt><dd>${escapeHtml(safeNumber(first.residual, 2))}</dd></div>
      <div><dt>Std Resid</dt><dd>${escapeHtml(safeNumber(first.stdResid, 2))}</dd></div>
      <div><dt>Cook's D</dt><dd>${escapeHtml(safeNumber(first.cooksD, 4))}</dd></div>
      <div><dt>IF Score</dt><dd>${escapeHtml(first.ifAnomalyScore == null ? "-" : safeNumber(first.ifAnomalyScore, 4))}</dd></div>
    </dl>
    ${predictiveSection}
  `;
}

async function loadSchoolDetail() {
  if (state.selectedSchoolCode == null) {
    state.predictiveDetail = null;
    renderSchoolDetail(null);
    return;
  }
  const selectedPair = state.pairRows.find(r => pairKey(r) === state.selectedPairKey);
  if (!selectedPair) {
    state.predictiveDetail = null;
    renderSchoolDetail(null);
    return;
  }
  const [payload, predictivePayload] = await Promise.all([
    fetchJson(
      `/correlation-outliers/school?schoolCode=${encodeURIComponent(state.selectedSchoolCode)}&predictor=${encodeURIComponent(selectedPair.predictor)}&outcome=${encodeURIComponent(selectedPair.outcome)}`
    ),
    fetchJson(
      `/predictive-insights/school?schoolCode=${encodeURIComponent(state.selectedSchoolCode)}&outcome=${encodeURIComponent(selectedPair.outcome)}`
    ).catch(() => ({
      schoolCode: state.selectedSchoolCode,
      outcome: selectedPair.outcome,
      available: false,
      topDrivers: [],
      metadata: { emptyReason: "Predictive insight could not be loaded right now." }
    }))
  ]);
  state.predictiveDetail = predictivePayload;
  renderSchoolDetail(payload);
}

async function selectSchool(schoolCode) {
  state.selectedSchoolCode = Number(schoolCode);
  syncOutlierSelection();
  focusChartPoint(schoolCode);
  await loadSchoolDetail();
}

async function loadPairDetail(row) {
  const payload = await fetchJson(
    `/correlation-outliers/pair-detail?predictor=${encodeURIComponent(row.predictor)}&outcome=${encodeURIComponent(row.outcome)}&county=${encodeURIComponent(selectedCounty())}`
  );
  renderPairSummary(payload);
  renderCorrelationInterpretation(payload);
  renderChart(payload);
  renderOutlierTable(payload);

  if (state.deepLink.schoolCode != null) {
    const requestedCode = Number(state.deepLink.schoolCode);
    state.deepLink.schoolCode = null;
    if (state.pointLookup.has(requestedCode)) {
      await selectSchool(requestedCode);
      return;
    }
    addStartupWarning(`Requested school ${requestedCode} is not available for the selected pair/county; defaulting to first outlier row.`);
  }

  const firstOutlierCode = payload?.outliers?.[0]?.schoolCode;
  if (firstOutlierCode != null) {
    await selectSchool(firstOutlierCode);
  } else {
    state.selectedSchoolCode = null;
    renderSchoolDetail({ rows: [], metadata: { summaryText: "No outlier schools for this pair in the selected county." } });
  }
}

async function selectPair(row) {
  state.selectedPairKey = pairKey(row);
  state.selectedSchoolCode = null;
  state.predictiveDetail = null;
  renderPairList();
  await loadPairDetail(row);
}

async function refreshPage({ preferDeepLink = false } = {}) {
  clearError();
  const county = selectedCounty();
  const scope = selectedScope();
  const [summary, pairsPayload] = await Promise.all([
    fetchJson(`/correlation-outliers/summary?county=${encodeURIComponent(county)}&scope=${encodeURIComponent(scope)}`),
    fetchJson(`/correlation-outliers/pairs?county=${encodeURIComponent(county)}&scope=${encodeURIComponent(scope)}&sort=high_signal_sparse_default`)
  ]);

  updateKpis(summary, scope);
  state.pairRows = sortPairs(pairsPayload?.pairs || []);
  applyPairSearch();
  await resolvePairSelection({ preferDeepLink });

  const warning = popStartupWarning();
  if (warning) showError(warning);
}

function initializeCountySelect() {
  const select = document.getElementById("co-county");
  select.length = 0;
  select.add(new Option("All", "all"));
}

async function loadCounties() {
  initializeCountySelect();
  const select = document.getElementById("co-county");
  const payload = await fetchJson("/filters");
  (payload.counties || []).forEach(county => select.add(new Option(county, county)));
  if (!(payload.counties || []).length) {
    addStartupWarning("County filters are unavailable right now. Using All counties.");
  }
}

async function loadDefinitions() {
  const payload = await fetchJson("/definitions?includeUnavailable=true");
  state.definitionsByField = new Map();
  (payload.definitions || []).forEach(def => {
    if (def.schoolField && !state.definitionsByField.has(def.schoolField)) {
      state.definitionsByField.set(def.schoolField, def);
    }
  });
}

function wireTabs() {
  const buttons = [...document.querySelectorAll(".tab-btn")];
  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      buttons.forEach(other => {
        const active = other === btn;
        other.classList.toggle("active", active);
        other.setAttribute("aria-selected", String(active));
      });
      document.querySelectorAll(".tab-panel").forEach(panel => {
        panel.hidden = panel.id !== `tab-${tab}`;
      });
    });
  });
}

function wireControls() {
  document.getElementById("co-county").addEventListener("change", async () => {
    try {
      await refreshPage();
    } catch (err) {
      showError(err.message || "Unable to refresh correlation outlier page");
    }
  });
  document.getElementById("co-scope").addEventListener("change", async () => {
    try {
      await refreshPage();
    } catch (err) {
      showError(err.message || "Unable to refresh correlation outlier page");
    }
  });
  document.getElementById("pair-search").addEventListener("input", async () => {
    try {
      applyPairSearch();
      await resolvePairSelection({ preferDeepLink: false });
    } catch (err) {
      showError(err.message || "Unable to apply pair search");
    }
  });
}

async function init() {
  parseDeepLinkFromQuery();
  wireTabs();
  wireControls();
  await loadDefinitions();
  try {
    await loadCounties();
  } catch (err) {
    console.warn("county filter load failed; continuing with All county", err);
    addStartupWarning("County filters are unavailable right now. Using All counties.");
  }
  applyDeepLinkControlSelections();
  await refreshPage({ preferDeepLink: true });
}

init().catch(err => {
  console.error(err);
  showError(err.message || "Unable to initialize correlation outlier page");
  renderEmptyDetailState();
});
