const { fetchJson } = window.HeliosApi;

const state = {
  relationshipLookup: new Map(),
  selectedRelationshipKey: null,
  openMenuKey: null
};

const DEFAULT_METRIC_GLOSSARY = [
  {
    metric: "Relationship",
    plainEnglish: "The predictor and outcome being compared for a school.",
    equation: "predictor -> outcome",
    interpretation: "Use this as the business question for the row."
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
    interpretation: "Higher Cook's Distance means stronger influence on model fit."
  },
  {
    metric: "Cook's Distance Threshold (4 / n)",
    plainEnglish: "Rule-of-thumb influence threshold for the pair.",
    equation: "threshold = 4 / n",
    interpretation: "Compare Cook's Distance against this value."
  },
  {
    metric: "Cook's Distance Exceedance",
    plainEnglish: "How far Cook's Distance is above or below the 4/n threshold.",
    equation: "exceedance = Cook's Distance / (4 / n)",
    interpretation: "Values > 1.0 are above threshold."
  },
  {
    metric: "Spearman's rho",
    plainEnglish: "Rank-based relationship strength and direction across schools.",
    equation: "rho in [-1, 1]",
    interpretation: "|rho| closer to 1 means stronger monotonic association."
  },
  {
    metric: "False Discovery Rate (FDR) p-value",
    plainEnglish: "Multiple-testing-adjusted probability used to judge whether the pair remains statistically credible after testing many relationships.",
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
    interpretation: "Higher R^2 means more variation explained by the line."
  },
  {
    metric: "Quality Band",
    plainEnglish: "Pair classification used for visibility and decision-support priority.",
    equation: "quality_band metadata label",
    interpretation: "High-signal pairs appear in default visibility."
  }
];

const DEFAULT_QUALITY_DEFS = {
  high_signal_sparse_exception: "High-signal relationship with sparse but meaningful exceptions; prioritized in default visibility.",
  actionable_exploratory: "Exploratory relationship with potential operational value, but below default high-signal threshold.",
  selected_other: "Modeled pair retained for exploratory review but not default high-signal visibility.",
  default: "Modeled pair quality classification from correlation metadata."
};

function byId(id) {
  return document.getElementById(id);
}

function showError(message) {
  const el = byId("api-error");
  el.textContent = message;
  el.hidden = false;
}

function clearError() {
  const el = byId("api-error");
  el.hidden = true;
  el.textContent = "";
}

function safeText(value) {
  return value == null || value === "" ? "-" : String(value);
}

function escapeHtml(value) {
  return safeText(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toLocaleString(undefined, { maximumFractionDigits: digits });
}

function fmtDate(value) {
  if (!value) return "-";
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return value;
  return dt.toLocaleString();
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function selectedFilters() {
  return {
    county: byId("exec-county").value || "all",
    scope: byId("exec-scope").value || "default"
  };
}

function qualityBandMeaning(qualityBand) {
  const defs = {
    ...DEFAULT_QUALITY_DEFS,
    ...(window.EXEC_SUMMARY_DATA?.qualityBandDefinitions || {})
  };
  if (qualityBand && defs[qualityBand]) return defs[qualityBand];
  return defs.default || "Modeled pair quality classification from correlation metadata.";
}

function buildRelationshipEvidence(rel) {
  const helper = window.HeliosCorrelationEvidence;
  if (!rel || !helper?.buildEvidenceModel) return null;
  return helper.buildEvidenceModel({
    nObs: rel.nObs,
    spearmanR: rel.spearmanR,
    spearmanPCorrected: rel.spearmanPCorrected,
    rSquared: rel.rSquared,
    qualityBand: rel.qualityBand,
    isHighSignalDefault: rel.isHighSignalDefault,
    defaultVisibilityRank: rel.defaultVisibilityRank
  });
}

function relationshipLabel(rel) {
  return `${safeText(rel.predictorLabel || rel.predictor)} -> ${safeText(rel.outcomeLabel || rel.outcome)}`;
}

function directionMeaning(direction) {
  const normalized = String(direction || "").toLowerCase();
  if (normalized === "positive") {
    return "Above expected trend for this relationship (actual outcome is above fitted outcome).";
  }
  if (normalized === "negative") {
    return "Below expected trend for this relationship (actual outcome is below fitted outcome).";
  }
  return "Direction metadata unavailable for this relationship row.";
}

function cooksThreshold(rel) {
  if (isFiniteNumber(rel.cooksDThreshold)) return Number(rel.cooksDThreshold);
  if (isFiniteNumber(rel.nObs) && Number(rel.nObs) > 0) return 4 / Number(rel.nObs);
  return null;
}

function cooksExceedance(rel, threshold) {
  if (isFiniteNumber(rel.cooksDExceedanceRatio)) return Number(rel.cooksDExceedanceRatio);
  if (isFiniteNumber(rel.cooksD) && isFiniteNumber(threshold) && Number(threshold) > 0) {
    return Number(rel.cooksD) / Number(threshold);
  }
  return null;
}

function buildScatterHref(rel, schoolCode, county) {
  const params = new URLSearchParams({
    x: safeText(rel.predictor),
    y: safeText(rel.outcome),
    county: county || "all",
    schoolCode: String(schoolCode)
  });
  return `./scatter.html?${params.toString()}`;
}

function buildCorrelationHref(rel, schoolCode, county, scope) {
  const targetScope = rel.isHighSignalDefault ? (scope || "default") : "all";
  const params = new URLSearchParams({
    predictor: safeText(rel.predictor),
    outcome: safeText(rel.outcome),
    county: county || "all",
    scope: targetScope,
    schoolCode: String(schoolCode)
  });
  return `./correlation-outliers.html?${params.toString()}`;
}

function closeOpenMenus() {
  document.querySelectorAll(".exec-row-menu").forEach(menu => {
    menu.hidden = true;
  });
  document.querySelectorAll(".exec-row-action-btn").forEach(btn => {
    btn.setAttribute("aria-expanded", "false");
  });
  state.openMenuKey = null;
}

function toggleMenuForButton(button) {
  const rowKey = button.dataset.rowKey;
  const menu = button.closest(".exec-row-menu-wrap")?.querySelector(".exec-row-menu");
  if (!menu || !rowKey) return;

  const isOpen = state.openMenuKey === rowKey && !menu.hidden;
  closeOpenMenus();
  if (isOpen) return;

  menu.hidden = false;
  button.setAttribute("aria-expanded", "true");
  state.openMenuKey = rowKey;
}

function selectRelationshipRow(rowKey) {
  if (!rowKey || !state.relationshipLookup.has(rowKey)) return;
  state.selectedRelationshipKey = rowKey;
  syncSelectedRelationshipRow();
  renderWorkedExample();
}

function syncSelectedRelationshipRow() {
  document.querySelectorAll(".executive-rel-row").forEach(row => {
    const active = row.dataset.rowKey === state.selectedRelationshipKey;
    row.classList.toggle("is-selected", active);
    row.setAttribute("aria-selected", String(active));
  });
}

function renderMetricGlossary() {
  const glossaryRoot = byId("exec-metric-glossary");
  const qualityRoot = byId("exec-quality-defs");
  const glossary = (window.EXEC_SUMMARY_DATA?.metricGlossary && window.EXEC_SUMMARY_DATA.metricGlossary.length)
    ? window.EXEC_SUMMARY_DATA.metricGlossary
    : DEFAULT_METRIC_GLOSSARY;
  const qualityDefs = {
    ...DEFAULT_QUALITY_DEFS,
    ...(window.EXEC_SUMMARY_DATA?.qualityBandDefinitions || {})
  };

  glossaryRoot.innerHTML = `
    <div class="table-wrap executive-interpret-table-wrap">
      <table class="definitions-table executive-interpret-table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Plain English</th>
            <th>Math / Operation</th>
            <th>How to Explain It</th>
          </tr>
        </thead>
        <tbody>
          ${glossary.map(item => `
            <tr>
              <td><strong>${escapeHtml(item.metric)}</strong></td>
              <td>${escapeHtml(item.plainEnglish)}</td>
              <td><code>${escapeHtml(item.equation)}</code></td>
              <td>${escapeHtml(item.interpretation)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  qualityRoot.innerHTML = `
    <h3>Quality Labels</h3>
    <ul class="notes-list compact-notes">
      <li><strong>high_signal_sparse_exception:</strong> ${escapeHtml(qualityDefs.high_signal_sparse_exception || "-")}</li>
      <li><strong>actionable_exploratory:</strong> ${escapeHtml(qualityDefs.actionable_exploratory || "-")}</li>
      <li><strong>selected_other:</strong> ${escapeHtml(qualityDefs.selected_other || "-")}</li>
      <li><strong>fallback:</strong> ${escapeHtml(qualityDefs.default || "-")}</li>
    </ul>
  `;
}

function renderWorkedExample() {
  const root = byId("exec-worked-example");
  const selected = state.relationshipLookup.get(state.selectedRelationshipKey);

  if (!selected) {
    root.innerHTML = `
      <h3>Worked Example (Selected Relationship)</h3>
      <p class="subtle">Select a relationship row to generate a row-specific plain-English explanation with formulas.</p>
    `;
    return;
  }

  const { school, relationship: rel } = selected;
  const nObs = isFiniteNumber(rel.nObs) ? Number(rel.nObs) : null;
  const threshold = cooksThreshold(rel);
  const exceedance = cooksExceedance(rel, threshold);
  const cooksD = isFiniteNumber(rel.cooksD) ? Number(rel.cooksD) : null;
  const stdResid = isFiniteNumber(rel.stdResid) ? Number(rel.stdResid) : null;
  const spearmanR = isFiniteNumber(rel.spearmanR) ? Number(rel.spearmanR) : null;
  const rSquared = isFiniteNumber(rel.rSquared) ? Number(rel.rSquared) : null;
  const fdrP = isFiniteNumber(rel.spearmanPCorrected) ? Number(rel.spearmanPCorrected) : null;
  const evidence = buildRelationshipEvidence(rel);

  const thresholdMath = nObs && threshold != null
    ? `4 / ${nObs} = ${fmtNumber(threshold, 4)}`
    : "4 / n (n is unavailable for this row)";

  const exceedanceMath = cooksD != null && threshold != null && threshold > 0 && exceedance != null
    ? `${fmtNumber(cooksD, 4)} / ${fmtNumber(threshold, 4)} = ${fmtNumber(exceedance, 2)}x`
    : "Cook's Distance / (4 / n) (insufficient values to compute)";

  root.innerHTML = `
    <h3>Worked Example (Selected Relationship)</h3>
    <p><strong>${escapeHtml(school.schoolName)}</strong> | ${escapeHtml(relationshipLabel(rel))}</p>
    <p class="subtle">Use this section as your talking script for the selected row.</p>

    <dl class="summary-list compact-summary">
      <div><dt>Direction</dt><dd>${escapeHtml(safeText(rel.direction))}</dd></div>
      <div><dt>Studentized Residual</dt><dd>${escapeHtml(fmtNumber(stdResid, 2))}</dd></div>
      <div><dt>Cook's Distance</dt><dd>${escapeHtml(fmtNumber(cooksD, 4))}</dd></div>
      <div><dt>Cook's Distance Threshold (4 / n)</dt><dd>${escapeHtml(fmtNumber(threshold, 4))}</dd></div>
      <div><dt>Cook's Distance Exceedance</dt><dd>${escapeHtml(fmtNumber(exceedance, 2))}x</dd></div>
      <div><dt>Spearman's rho</dt><dd>${escapeHtml(fmtNumber(spearmanR, 3))}</dd></div>
      <div><dt>R^2</dt><dd>${escapeHtml(fmtNumber(rSquared, 3))}</dd></div>
      <div><dt>False Discovery Rate (FDR) p-value</dt><dd>${escapeHtml(fmtNumber(fdrP, 4))}</dd></div>
      <div><dt>Significance</dt><dd>${escapeHtml(safeText(evidence?.significanceBand?.label))}</dd></div>
      <div><dt>Evidence</dt><dd>${escapeHtml(safeText(evidence?.evidenceTier?.label))}</dd></div>
      <div><dt>Relationship Rank Tier</dt><dd>${escapeHtml(safeText(evidence?.rankTier?.label))}</dd></div>
      <div><dt>Quality Band</dt><dd>${escapeHtml(safeText(rel.qualityBand))}</dd></div>
    </dl>

    <div class="executive-formula-grid">
      <div class="executive-formula-item">
        <strong>Direction meaning</strong>
        <p>${escapeHtml(directionMeaning(rel.direction))}</p>
      </div>
      <div class="executive-formula-item">
        <strong>Cook's Distance threshold</strong>
        <p><code>${escapeHtml(thresholdMath)}</code></p>
      </div>
      <div class="executive-formula-item">
        <strong>Cook's Distance exceedance</strong>
        <p><code>${escapeHtml(exceedanceMath)}</code></p>
      </div>
      <div class="executive-formula-item">
        <strong>Quality Band interpretation</strong>
        <p>${escapeHtml(qualityBandMeaning(rel.qualityBand))}</p>
      </div>
      <div class="executive-formula-item">
        <strong>Evidence interpretation</strong>
        <p>${escapeHtml(safeText(evidence?.evidenceTier?.label))}: ${escapeHtml(safeText(evidence?.significanceBand?.label))}</p>
      </div>
    </div>
    <p class="subtle">${escapeHtml(window.HeliosCorrelationEvidence?.scopeNote || "Correlation strength/significance values are sourced from the latest statewide modeled run.")}</p>
  `;
}

function renderNarrative() {
  const content = window.EXEC_SUMMARY_DATA || {};

  const overview = byId("exec-method-overview");
  const technical = byId("exec-method-technical");
  const provenance = byId("exec-method-provenance");

  overview.innerHTML = `
    <ul class="notes-list compact-notes">
      ${(content.overviewBullets || []).map(item => `<li>${item}</li>`).join("")}
    </ul>
    <h4>Interpretation Caveats</h4>
    <ul class="notes-list compact-notes">
      ${(content.caveats || []).map(item => `<li>${item}</li>`).join("")}
    </ul>
  `;

  technical.innerHTML = `
    <ul class="notes-list compact-notes">
      ${(content.technicalBullets || []).map(item => `<li>${item}</li>`).join("")}
    </ul>
  `;

  provenance.innerHTML = `
    <ul class="notes-list compact-notes">
      ${(content.provenanceTrace || []).map(step => `
        <li>
          <strong>${safeText(step.label)}:</strong> ${safeText(step.note)}
          <div class="subtle mono">${safeText(step.artifact)}</div>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderKpis(kpis) {
  byId("kpi-modeled-pairs").textContent = fmtNumber(kpis?.modeledPairs || 0, 0);
  byId("kpi-outlier-schools").textContent = fmtNumber(kpis?.uniqueCorrelationOutlierSchools || 0, 0);
  byId("kpi-if-schools").textContent = fmtNumber(kpis?.isolationForestAnomalySchools || 0, 0);
  byId("kpi-overlap-schools").textContent = fmtNumber(kpis?.overlapSchools || 0, 0);
  byId("kpi-schools-in-scope").textContent = fmtNumber(kpis?.schoolsInScope || 0, 0);
}

function renderRunMetadata(runMetadata) {
  byId("exec-run-id").textContent = `Run ID: ${safeText(runMetadata?.analysisRunId)}`;
  byId("exec-as-of").textContent = `As of: ${fmtDate(runMetadata?.snapshotTs)}`;
}

function schoolHeader(school, rank) {
  return `
    <div class="executive-school-head">
      <div>
        <h3>${rank}. ${safeText(school.schoolName)}</h3>
        <p class="subtle">${safeText(school.districtName)} | ${safeText(school.county)} | Title I: ${safeText(school.titleOneYesNo)}</p>
      </div>
      <div class="executive-school-kpis">
        <span class="badge">High-signal pairs: ${fmtNumber(school.highSignalOutlierPairCount, 0)}</span>
        <span class="badge">Total pairs: ${fmtNumber(school.totalOutlierPairCount, 0)}</span>
        <span class="badge">Max |Studentized Residual|: ${fmtNumber(school.maxAbsStdResid, 2)}</span>
        <span class="badge">Max Cook's Distance exceedance: ${fmtNumber(school.maxCooksDExceedanceRatio, 2)}x</span>
      </div>
    </div>
  `;
}

function relationshipTableRows(school, relationships, county, scope) {
  let firstRowKey = null;
  const rows = (relationships || []).map((rel, idx) => {
    const evidence = buildRelationshipEvidence(rel);
    const rowKey = `${school.schoolCode}|${safeText(rel.predictor)}|${safeText(rel.outcome)}|${idx}`;
    const scatterHref = buildScatterHref(rel, school.schoolCode, county);
    const correlationHref = buildCorrelationHref(rel, school.schoolCode, county, scope);

    state.relationshipLookup.set(rowKey, {
      school,
      relationship: rel,
      county,
      scope
    });

    if (!firstRowKey) firstRowKey = rowKey;

    return `
      <tr class="executive-rel-row" data-row-key="${escapeHtml(rowKey)}" tabindex="0" aria-selected="false">
        <td>${escapeHtml(relationshipLabel(rel))}</td>
        <td>${escapeHtml(safeText(rel.direction))}</td>
        <td>${escapeHtml(fmtNumber(rel.stdResid, 2))}</td>
        <td>${escapeHtml(fmtNumber(rel.cooksD, 4))}</td>
        <td>${escapeHtml(fmtNumber(cooksThreshold(rel), 4))}</td>
        <td>${escapeHtml(fmtNumber(cooksExceedance(rel, cooksThreshold(rel)), 2))}x</td>
        <td>${escapeHtml(fmtNumber(rel.spearmanR, 3))}</td>
        <td>${escapeHtml(fmtNumber(rel.rSquared, 3))}</td>
        <td>${escapeHtml(fmtNumber(rel.spearmanPCorrected, 4))}</td>
        <td>${escapeHtml(safeText(evidence?.evidenceTier?.label))}</td>
        <td>${escapeHtml(safeText(evidence?.rankTier?.label))}</td>
        <td>${escapeHtml(safeText(rel.qualityBand))}</td>
        <td>
          <div class="exec-row-menu-wrap" data-row-key="${escapeHtml(rowKey)}">
            <button type="button" class="exec-row-action-btn" data-row-key="${escapeHtml(rowKey)}" aria-haspopup="menu" aria-expanded="false" aria-label="Open actions for ${escapeHtml(relationshipLabel(rel))}">⋮</button>
            <div class="exec-row-menu" role="menu" hidden>
              <a role="menuitem" href="${escapeHtml(scatterHref)}">Open in Scatter Plot</a>
              <a role="menuitem" href="${escapeHtml(correlationHref)}">Open in Correlation Outliers</a>
            </div>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  return { rows, firstRowKey };
}

function renderTopSchools(topSchools) {
  const root = byId("exec-top-schools");
  const empty = byId("exec-top-schools-empty");
  const { county, scope } = selectedFilters();

  root.innerHTML = "";
  state.relationshipLookup = new Map();
  closeOpenMenus();

  if (!topSchools || !topSchools.length) {
    state.selectedRelationshipKey = null;
    renderWorkedExample();
    empty.hidden = false;
    return;
  }

  empty.hidden = true;

  let firstGlobalRowKey = null;

  topSchools.forEach((school, idx) => {
    const details = document.createElement("details");
    details.className = "executive-school-item";
    if (idx === 0) details.open = true;

    const summary = document.createElement("summary");
    summary.innerHTML = schoolHeader(school, idx + 1);

    const body = document.createElement("div");
    body.className = "executive-school-body";

    const { rows, firstRowKey } = relationshipTableRows(school, school.relationships, county, scope);
    if (!firstGlobalRowKey && firstRowKey) firstGlobalRowKey = firstRowKey;

    body.innerHTML = rows
      ? `
        <div class="table-wrap executive-rel-table-wrap">
          <table class="definitions-table executive-rel-table">
            <thead>
              <tr>
                <th>Relationship</th>
                <th>Direction</th>
                <th>Studentized Residual</th>
                <th>Cook's Distance</th>
                <th>Cook's Distance Threshold (4 / n)</th>
                <th>Cook's Distance Exceedance</th>
                <th>Spearman's rho</th>
                <th>R^2</th>
                <th>False Discovery Rate (FDR) p-value</th>
                <th>Evidence</th>
                <th>Relationship Rank Tier</th>
                <th>Quality Band</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `
      : `<p class="subtle">No relationship rows available for this school under the selected scope.</p>`;

    details.append(summary, body);
    root.appendChild(details);
  });

  if (!state.selectedRelationshipKey || !state.relationshipLookup.has(state.selectedRelationshipKey)) {
    state.selectedRelationshipKey = firstGlobalRowKey;
  }
  syncSelectedRelationshipRow();
  renderWorkedExample();
}

function renderMethodology(methodology) {
  if (!methodology) return;
  const technical = byId("exec-method-technical");
  let thresholdLine = byId("exec-live-threshold-line");
  if (!thresholdLine) {
    thresholdLine = document.createElement("p");
    thresholdLine.className = "subtle";
    thresholdLine.id = "exec-live-threshold-line";
    technical.appendChild(thresholdLine);
  }
  thresholdLine.textContent = `Live threshold range across shown relationships: 4/n from ${fmtNumber(methodology.minCooksDThreshold, 4)} to ${fmtNumber(methodology.maxCooksDThreshold, 4)}; studentized residual threshold ${fmtNumber(methodology.studentizedResidualThreshold, 2)}.`;
}

async function loadCounties() {
  const county = byId("exec-county");
  const payload = await fetchJson("/filters");
  (payload.counties || []).forEach(name => county.add(new Option(name, name)));
}

async function refresh() {
  clearError();
  const { county, scope } = selectedFilters();
  const path = `/correlation-outliers/executive-summary?county=${encodeURIComponent(county)}&scope=${encodeURIComponent(scope)}&limitSchools=10&limitRelationshipsPerSchool=25`;
  const payload = await fetchJson(path);
  renderRunMetadata(payload.runMetadata || {});
  renderKpis(payload.kpis || {});
  renderTopSchools(payload.topSchools || []);
  renderNarrative();
  renderMethodology(payload.methodology || null);
}

function wireRelationshipInteractions() {
  const topSchoolsRoot = byId("exec-top-schools");

  topSchoolsRoot.addEventListener("click", event => {
    const actionButton = event.target.closest(".exec-row-action-btn");
    if (actionButton) {
      event.preventDefault();
      event.stopPropagation();
      toggleMenuForButton(actionButton);
      return;
    }

    if (event.target.closest(".exec-row-menu")) {
      closeOpenMenus();
      return;
    }

    const row = event.target.closest(".executive-rel-row");
    if (!row) return;
    selectRelationshipRow(row.dataset.rowKey);
    closeOpenMenus();
  });

  topSchoolsRoot.addEventListener("keydown", event => {
    const actionButton = event.target.closest(".exec-row-action-btn");
    if (actionButton) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggleMenuForButton(actionButton);
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeOpenMenus();
      }
      return;
    }

    const row = event.target.closest(".executive-rel-row");
    if (!row) return;

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      selectRelationshipRow(row.dataset.rowKey);
      closeOpenMenus();
    }
  });

  document.addEventListener("click", event => {
    if (!event.target.closest(".exec-row-menu-wrap")) {
      closeOpenMenus();
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeOpenMenus();
  });
}

function wireEvents() {
  byId("exec-county").addEventListener("change", () => refresh().catch(err => showError(err.message || "Unable to load executive summary")));
  byId("exec-scope").addEventListener("change", () => refresh().catch(err => showError(err.message || "Unable to load executive summary")));
}

async function init() {
  renderMetricGlossary();
  renderNarrative();
  renderWorkedExample();
  await loadCounties();
  wireEvents();
  wireRelationshipInteractions();
  await refresh();
}

init().catch(err => {
  showError(err.message || "Unable to initialize executive summary");
  console.error(err);
});
