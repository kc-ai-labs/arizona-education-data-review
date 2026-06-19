const { fetchJson } = window.HeliosApi;
const scatterPairsApi = window.HeliosScatterPairs || {};
const pairKey = scatterPairsApi.pairKey || (row => `${String(row?.predictor ?? "")}:::${String(row?.outcome ?? "")}`);
const normalizeSortState = scatterPairsApi.normalizeSortState || ((sortKey, dir) => ({ sortKey: sortKey || "rank", dir: dir || "asc" }));
const sortPairsBy = scatterPairsApi.sortPairsBy || ((rows) => [...(rows || [])]);
const filterPairs = scatterPairsApi.filterPairs || ((rows) => [...(rows || [])]);
const paginateRows = scatterPairsApi.paginateRows
  || ((rows, page, pageSize) => ({ rows: [...(rows || [])], page: page || 1, pageSize: pageSize || 25, totalRows: Array.isArray(rows) ? rows.length : 0, totalPages: 1 }));
const findPageForPair = scatterPairsApi.findPageForPair || (() => null);
const buildFieldOptionRows = scatterPairsApi.buildFieldOptionRows || (() => []);
const annotatePairSelectability = scatterPairsApi.annotatePairSelectability || (rows => [...(rows || [])]);
const isSelectedPair = scatterPairsApi.isSelectedPair
  || ((row, activeX, activeY) => String(row?.predictor ?? "") === String(activeX ?? "") && String(row?.outcome ?? "") === String(activeY ?? ""));
const DATASET_OPACITY = 0.7;
const CORRELATION_PAIR_LIMIT = 500;
const CORRELATION_PAIR_SCOPE = "all";
const CORRELATION_PAIR_SORT = "high_signal_sparse_default";
const PAIR_PAGE_SIZE = 25;
const PAIR_SORT_DEFAULTS = Object.freeze({
  rank: "asc",
  rho: "desc",
  r2: "desc",
  fdrp: "asc",
  n: "desc"
});
const PAIR_FILTER_PARAM_MAP = Object.freeze({
  anyField: "pairAnyField",
  predictorField: "pairPredictorField",
  outcomeField: "pairOutcomeField"
});

let chart;
const state = {
  pointLookup: new Map(),
  highlightedSchoolCode: null,
  startupWarning: null,
  requestedSchoolCode: null,
  pairRows: [],
  pairRowsFiltered: [],
  selectedPairKey: null,
  pairLoadError: null,
  pairRowsCounty: null,
  availableAxisFields: new Set(),
  pairSortKey: "rank",
  pairSortDir: "asc",
  pairPage: 1,
  pairTotalPages: 1,
  pairPageSize: PAIR_PAGE_SIZE,
  pairFilters: {
    anyField: "",
    predictorField: "",
    outcomeField: ""
  },
  axisFieldOptions: [],
  axisFieldOptionKeys: new Set()
};

const fixedPalette = {
  "Very Low": "#982f2f",
  "Low": "#bc4f6a",
  "Moderate": "#d6c7a6",
  "High": "#9bcfc1",
  "Very High": "#4f9e88",
  "NA": "#7d8c95"
};

function showError(message) {
  const el = document.getElementById("api-error");
  el.textContent = message;
  el.hidden = false;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeMetric(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Number(value).toFixed(digits);
}

function safeInteger(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return Math.round(Number(value));
}

function safePercent(value, digits = 1) {
  if (value == null || Number.isNaN(Number(value))) return null;
  return `${Number(value).toFixed(digits)}%`;
}

function describeTrendDirection(slope) {
  if (slope == null || Number.isNaN(Number(slope))) return "unknown";
  const num = Number(slope);
  if (Math.abs(num) < 1e-9) return "roughly flat";
  return num > 0 ? "positive (upward)" : "negative (downward)";
}

function describeScatterColoring(categoryMetadata) {
  if (!categoryMetadata) return "Colors group schools by the selected Y-axis category bands when available.";
  if (categoryMetadata.mode === "native_range") {
    return `Colors use the native category bands for the selected Y-axis (${categoryMetadata.rangeField || "school_range mapping"}).`;
  }
  return "Colors use computed quintile buckets for the selected Y-axis values in this view (not the original native categories).";
}

function qualityBandLabel(value) {
  const v = String(value || "").toLowerCase();
  if (v === "high_signal_sparse_exception") return "High-signal sparse exception";
  if (v === "actionable_exploratory") return "Exploratory";
  if (v) return v.replaceAll("_", " ");
  return "Unlabeled";
}

function buildScatterEvidence(stats) {
  const helper = window.HeliosCorrelationEvidence;
  if (!stats || !helper?.buildEvidenceModel) return null;
  return helper.buildEvidenceModel({
    nObs: stats.pairNObs,
    spearmanR: stats.spearmanR,
    spearmanPCorrected: stats.spearmanPCorrected,
    rSquared: stats.rSquared,
    qualityBand: stats.qualityBand,
    isHighSignalDefault: stats.isHighSignalDefault,
    defaultVisibilityRank: stats.defaultVisibilityRank
  });
}

function buildScatterMetricRows(scatter, outliersPayload) {
  const stats = scatter?.stats || {};
  const cleaning = scatter?.dataCleaning || {};
  const evidence = buildScatterEvidence(stats);
  const rows = [];
  const included = safeInteger(stats.includedSchools ?? scatter?.schoolCount);
  const outlierCount = safeInteger(stats.outlierCount);
  const outlierRate = safePercent(stats.outlierRatePct);
  const slope = safeMetric(stats.slope, 3);
  const intercept = safeMetric(stats.intercept, 3);
  const sigma = safeMetric(stats.residualSigma, 3);
  const threshold = safeMetric(stats.stdResidualThreshold, 1);
  const pairN = safeInteger(stats.pairNObs);
  const spearmanR = safeMetric(stats.spearmanR, 3);
  const spearmanP = safeMetric(stats.spearmanPCorrected, 4);
  const rSquared = safeMetric(stats.rSquared, 3);
  const pairClass = stats.qualityBand ? qualityBandLabel(stats.qualityBand) : null;

  if (included != null) rows.push(["Included schools", String(included), "Schools included in the chart after filtering and data cleaning."]);
  if (pairN != null) rows.push(["Modeled pair n", String(pairN), "Sample size used for canonical modeled pair metrics (from latest statewide run)."]);
  if (spearmanR != null) rows.push(["Spearman rho (rho)", spearmanR, "Monotonic association strength and direction for this X/Y relationship."]);
  if (spearmanP != null) rows.push(["FDR-adjusted p", spearmanP, "Multiple-testing-adjusted significance check for the relationship's Spearman association."]);
  if (rSquared != null) rows.push(["R²", rSquared, "Share of outcome variation explained by the fitted OLS line for the modeled pair."]);
  if (pairClass != null) rows.push(["Pair class", pairClass, "Modeled relationship class used for default visibility and prioritization."]);
  if (evidence?.significanceBand?.label) rows.push(["Significance tier", evidence.significanceBand.label, "Tiered interpretation from FDR-adjusted p-value."]);
  if (evidence?.evidenceTier?.label) rows.push(["Evidence tier", evidence.evidenceTier.label, "User-friendly relationship evidence level using n, rho, R², FDR p, and pair class context."]);
  if (evidence?.rankTier?.label) rows.push(["Relationship rank tier", evidence.rankTier.label, "Categorical rank based on default modeled pair ordering (Top-tier / Mid-tier / Lower-tier)."]);
  if (safeInteger(cleaning.excludedSchoolsTotal) != null) {
    rows.push(["Excluded (cleaning)", String(safeInteger(cleaning.excludedSchoolsTotal)), "Schools excluded before plotting because X or Y was missing or invalid."]);
  }
  if (outlierCount != null) rows.push(["Outliers", String(outlierCount), "Schools with unusually large standardized residuals for this selected X/Y relationship."]);
  if (outlierRate != null) rows.push(["Outlier rate", outlierRate, "Percent of included schools flagged as outliers in this chart."]);
  if (slope != null) rows.push(["Slope", slope, "Direction and steepness of the fitted line (average change in Y for a one-unit change in X)."]);
  if (intercept != null) rows.push(["Intercept", intercept, "Model baseline where the fitted line crosses Y when X is zero (may not be directly interpretable for every axis)."]);
  if (sigma != null) rows.push(["Residual spread (sigma)", sigma, "Typical vertical spread of points around the line; larger values mean more scatter around the trend."]);
  if (threshold != null) rows.push(["Outlier threshold", `|std residual| > ${threshold}`, "Rule used to flag unusually far points from the fitted line on this page."]);
  if (cleaning.ruleVersion) rows.push(["Cleaning rule version", cleaning.ruleVersion, "Version of cleaning rules used to exclude missing or invalid values."]);

  if (!rows.length && Array.isArray(outliersPayload?.outliers)) {
    rows.push(["Outlier spotlight rows shown", String(outliersPayload.outliers.length), "Top outliers currently listed in the spotlight panel (not the full outlier count)."]);
  }
  return rows;
}

function renderScatterInterpretation(scatterPayload, outliersPayload, xLabel, yLabel, countyLabel) {
  const root = document.getElementById("scatter-interpret-content");
  if (!root) return;

  const stats = scatterPayload?.stats || null;
  const cleaning = scatterPayload?.dataCleaning || null;
  const categoryMetadata = scatterPayload?.categoryMetadata || null;
  const schoolCount = safeInteger(scatterPayload?.schoolCount) ?? 0;
  const trendText = describeTrendDirection(stats?.slope);
  const evidence = buildScatterEvidence(stats);
  const outlierCount = safeInteger(stats?.outlierCount);
  const outlierRateText = safePercent(stats?.outlierRatePct);
  const slopeMovementText = stats?.slope == null || Number.isNaN(Number(stats.slope))
    ? "changes"
    : Math.abs(Number(stats.slope)) < 1e-9
      ? "stays roughly flat"
      : Number(stats.slope) > 0
        ? "tends to move up"
        : "tends to move down";
  const strengthLine = outlierCount != null
    ? `This view currently includes <strong>${escapeHtml(String(schoolCount))}</strong> schools after cleaning, with <strong>${escapeHtml(String(outlierCount))}</strong>${outlierRateText ? ` outliers (${escapeHtml(outlierRateText)})` : " outliers"} flagged by the standardized residual rule.`
    : `This view currently includes <strong>${escapeHtml(String(schoolCount))}</strong> schools after cleaning.`;
  const regressionSentence = stats
    ? `The fitted regression line is <strong>${escapeHtml(trendText)}</strong>${safeMetric(stats.slope, 3) != null ? ` (slope ${escapeHtml(safeMetric(stats.slope, 3))})` : ""}, which means the charted Y value ${escapeHtml(slopeMovementText)} as X increases on average.`
    : "The fitted regression line summarizes the average association in the selected schools.";
  const modeledEvidenceSentence = evidence
    ? `Canonical modeled evidence for this relationship is <strong>${escapeHtml(evidence.evidenceTier?.label || "Limited evidence")}</strong>, with <strong>${escapeHtml(evidence.strengthBand?.label || "Unknown strength")}</strong> strength and <strong>${escapeHtml(evidence.significanceBand?.label || "Unknown significance")}</strong>.`
    : "Canonical modeled relationship evidence is unavailable for this X/Y pair.";
  const evidenceScopeNote = evidence?.scopeNote
    || "Correlation strength/significance values are sourced from the latest statewide modeled run.";

  const missingInvalidText = cleaning
    ? `Data cleaning excludes missing and invalid values separately before plotting. Current exclusions: missing X ${escapeHtml(String(safeInteger(cleaning.excludedMissingX) ?? 0))}, missing Y ${escapeHtml(String(safeInteger(cleaning.excludedMissingY) ?? 0))}, invalid X ${escapeHtml(String(safeInteger(cleaning.excludedInvalidX) ?? 0))}, invalid Y ${escapeHtml(String(safeInteger(cleaning.excludedInvalidY) ?? 0))}.`
    : "Data cleaning exclusions are shown below the chart when available.";

  const rows = buildScatterMetricRows(scatterPayload, outliersPayload);
  const metricRowsHtml = rows.map(([label, value, meaning]) => `
    <div class="interpret-metric-row">
      <dt>${escapeHtml(label)}</dt>
      <dd><span class="mono">${escapeHtml(value)}</span> <span class="subtle">${escapeHtml(meaning)}</span></dd>
    </div>
  `).join("");

  const emptyText = schoolCount === 0
    ? `<p class="interpret-note">No schools matched this X/Y selection after filters and data cleaning. Try a different county or axis combination.</p>`
    : "";

  const spotlightExample = Array.isArray(outliersPayload?.outliers) && outliersPayload.outliers.length
    ? `The Outlier Spotlight list shows the most unusual schools first. A larger absolute <code>std_resid</code> means the school is farther from the fitted line after standardizing for typical spread.`
    : `The Outlier Spotlight list will populate when outliers are available for the selected axes.`;

  root.innerHTML = `
    <div class="interpret-grid">
      <section class="interpret-section">
        <h3>What this chart is asking</h3>
        <p>For schools in <strong>${escapeHtml(countyLabel)}</strong>, how is <strong>${escapeHtml(xLabel)}</strong> associated with <strong>${escapeHtml(yLabel)}</strong>?</p>
        <p>The fitted line shows the typical trend. Points above the line are higher than expected for that X value; points below the line are lower than expected for that X value.</p>
        <p>${regressionSentence}</p>
        <p>${modeledEvidenceSentence}</p>
        <p>${strengthLine}</p>
        ${emptyText}
      </section>

      <section class="interpret-section">
        <h3>How to read the chart</h3>
        <ul class="interpret-list">
          <li>Each dot is one school.</li>
          <li>The X-axis is the selected predictor/context value; the Y-axis is the selected outcome/metric value.</li>
          <li>The regression line is the average trend across included schools (a simple straight-line summary, also called OLS regression).</li>
          <li>The dashed lines show a 95% confidence-style band around the fitted trend. If a point is far outside these lines, it is visually far from the typical trend.</li>
          <li>${escapeHtml(describeScatterColoring(categoryMetadata))}</li>
          <li>Outliers are points flagged by the standardized residual threshold and shown in the Outlier Spotlight list.</li>
        </ul>
      </section>

      <section class="interpret-section">
        <h3>How to read the Outlier Spotlight list</h3>
        <p>${spotlightExample}</p>
        <ul class="interpret-list">
          <li><strong>direction</strong> tells whether the school is above expected (<code>positive</code>) or below expected (<code>negative</code>) for this X value.</li>
          <li><strong>std_resid</strong> (standardized residual) is the distance from the line measured in typical spread units. Roughly speaking: <code>(actual Y - fitted Y) / typical residual spread</code>.</li>
          <li>Larger absolute values (for example 3.5 vs 1.2) mean the school is more unusual relative to the trend.</li>
        </ul>
      </section>

      <section class="interpret-section">
        <h3>Statistical methods used on this page</h3>
        <ul class="interpret-list">
          <li><strong>OLS regression line</strong>: a straight best-fit line summarizing the typical association between the selected X and Y. It gives the chart's expected Y value at each X value.</li>
          <li><strong>Residual</strong>: <code>actual Y - fitted Y</code>. This is how far a school sits above or below the line.</li>
          <li><strong>Standardized residual</strong>: residual divided by the chart's typical residual spread (sigma). This lets schools be compared on the same scale.</li>
          <li><strong>Outlier rule</strong>: schools are flagged when <code>|std residual| &gt; 2.5</code>, meaning they are more than 2.5 typical residual units away from the line.</li>
          <li><strong>Confidence / uncertainty band (95%)</strong>: dashed lines provide a visual guide to typical uncertainty around the fitted line. They help show whether a point is visually far from the trend, but they do not prove a school is good/bad or establish causation.</li>
          <li><strong>Slope and intercept</strong>: the slope describes the direction/steepness of the line; the intercept is the model's Y value at X = 0 (sometimes only a mathematical anchor, not a policy interpretation).</li>
          <li><strong>Data cleaning</strong>: schools with missing or invalid X/Y values are excluded before fitting and plotting.</li>
        </ul>
      </section>

      <section class="interpret-section interpret-section-full">
        <h3>Numbers shown on this page (and what they mean)</h3>
        <dl class="interpret-metric-list">
          ${metricRowsHtml || '<div class="interpret-metric-row"><dt>Metrics</dt><dd><span class="subtle">Detailed metrics are unavailable for this selection.</span></dd></div>'}
        </dl>
        <p class="interpret-note">How to read the key returned numbers: <strong>slope</strong> = direction/steepness of the line, <strong>intercept</strong> = fitted Y at X=0, <strong>residual sigma</strong> = typical spread around the line, and <strong>outlier rate</strong> = percent of included schools flagged by the standardized residual rule.</p>
        <p class="interpret-note">${escapeHtml(missingInvalidText)}</p>
        <p class="interpret-note">${escapeHtml(evidenceScopeNote)}</p>
        <p class="interpret-note">Interpretation rule: this chart shows <strong>association</strong>, not proof that one metric causes another.</p>
      </section>
    </div>
  `;
}

function hexToRgb(hex) {
  if (hex.startsWith("rgb(")) {
    const nums = hex.replace(/[^\d,]/g, "").split(",").map(v => Number(v.trim()));
    return { r: nums[0] || 0, g: nums[1] || 0, b: nums[2] || 0 };
  }
  const value = hex.replace("#", "");
  const normalized = value.length === 3 ? value.split("").map(c => c + c).join("") : value;
  const intVal = parseInt(normalized, 16);
  return { r: (intVal >> 16) & 255, g: (intVal >> 8) & 255, b: intVal & 255 };
}

function withAlpha(hex, alpha) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}

function blendHex(a, b, t) {
  const c1 = hexToRgb(a);
  const c2 = hexToRgb(b);
  const r = lerp(c1.r, c2.r, t).toString(16).padStart(2, "0");
  const g = lerp(c1.g, c2.g, t).toString(16).padStart(2, "0");
  const bCh = lerp(c1.b, c2.b, t).toString(16).padStart(2, "0");
  return `#${r}${g}${bCh}`;
}

function normalizeCategoryLabel(label) {
  const value = (label ?? "").toString().trim();
  return value || "NA";
}

function isStandardFiveBand(labels) {
  const normalized = new Set(labels.map(l => normalizeCategoryLabel(l).toLowerCase()));
  const standard = new Set(["very low", "low", "moderate", "high", "very high", "na"]);
  return [...normalized].every(v => standard.has(v));
}

function buildColorMap(orderedCategories) {
  const normalized = orderedCategories.map(c => normalizeCategoryLabel(c));
  if (isStandardFiveBand(normalized)) {
    const map = {};
    normalized.forEach(c => {
      map[c] = fixedPalette[c] || fixedPalette.NA;
    });
    return map;
  }

  const map = {};
  const nonNa = normalized.filter(c => c !== "NA");
  const anchors = ["#982f2f", "#bc4f6a", "#d6c7a6", "#9bcfc1", "#4f9e88"];
  nonNa.forEach((label, idx) => {
    if (nonNa.length === 1) {
      map[label] = anchors[2];
      return;
    }
    const pos = idx / (nonNa.length - 1);
    const scaled = pos * (anchors.length - 1);
    const left = Math.floor(scaled);
    const right = Math.min(anchors.length - 1, Math.ceil(scaled));
    const frac = scaled - left;
    map[label] = right === left ? anchors[left] : blendHex(anchors[left], anchors[right], frac);
  });
  map.NA = fixedPalette.NA;
  return map;
}

async function loadFilters() {
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  const c = document.getElementById("county");
  state.availableAxisFields = new Set();
  state.axisFieldOptions = [];
  state.axisFieldOptionKeys = new Set();

  x.length = 0;
  y.length = 0;
  c.length = 0;
  c.add(new Option("All", "all"));

  const data = await fetchJson(`/filters?includeUnavailable=true`);

  const axes = Array.isArray(data.axes) ? data.axes : [];
  axes.forEach(a => {
    if (a.available !== false && a.field_name) {
      state.availableAxisFields.add(String(a.field_name));
    }
    const ox = new Option(a.label, a.field_name);
    if (a.available === false) {
      ox.disabled = true;
      ox.text = `${a.label} (Unavailable: ${a.availabilityReason || "Not available"})`;
    }
    if (a.is_default_x) ox.selected = true;
    x.add(ox);

    const oy = new Option(a.label, a.field_name);
    if (a.available === false) {
      oy.disabled = true;
      oy.text = `${a.label} (Unavailable: ${a.availabilityReason || "Not available"})`;
    }
    if (a.is_default_y) oy.selected = true;
    y.add(oy);
  });
  state.axisFieldOptions = buildFieldOptionRows(axes);
  state.axisFieldOptionKeys = new Set(state.axisFieldOptions.map(row => row.value));

  (data.counties || []).forEach(county => c.add(new Option(county, county)));
  state.startupWarning = (data.counties || []).length
    ? null
    : "County filters are unavailable right now. Using All counties.";
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function normalizePairFilterValue(value) {
  const candidate = String(value ?? "");
  if (!candidate) return "";
  return state.axisFieldOptionKeys.has(candidate) ? candidate : "";
}

function normalizePairSortForState(sortKey, dir) {
  return normalizeSortState(sortKey, dir);
}

function applySelectionsFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const x = params.get("x");
  const y = params.get("y");
  const county = params.get("county");
  const schoolCode = params.get("schoolCode");

  const xEl = document.getElementById("x-field");
  const yEl = document.getElementById("y-field");
  const cEl = document.getElementById("county");

  if (x) {
    if (![...xEl.options].some(o => o.value === x)) {
      xEl.add(new Option(`${x} (linked)`, x));
      state.availableAxisFields.add(x);
      addStartupWarning(`Deep-linked X axis '${x}' is outside the default axis list and was added temporarily for this session.`);
    }
    xEl.value = x;
  }
  if (y) {
    if (![...yEl.options].some(o => o.value === y)) {
      yEl.add(new Option(`${y} (linked)`, y));
      state.availableAxisFields.add(y);
      addStartupWarning(`Deep-linked Y axis '${y}' is outside the default axis list and was added temporarily for this session.`);
    }
    yEl.value = y;
  }
  if (county && [...cEl.options].some(o => o.value === county)) cEl.value = county;

  if (schoolCode != null && schoolCode !== "") {
    if (/^-?\d+$/.test(schoolCode)) {
      state.requestedSchoolCode = Number(schoolCode);
    } else {
      addStartupWarning(`Requested schoolCode '${schoolCode}' is invalid; ignoring school focus parameter.`);
    }
  }

  const normalizedSort = normalizePairSortForState(params.get("pairSort"), params.get("pairDir"));
  state.pairSortKey = normalizedSort.sortKey;
  state.pairSortDir = normalizedSort.dir;
  state.pairPage = parsePositiveInteger(params.get("pairPage"), 1);
  state.pairFilters = {
    anyField: normalizePairFilterValue(params.get("pairAnyField")),
    predictorField: normalizePairFilterValue(params.get("pairPredictorField")),
    outcomeField: normalizePairFilterValue(params.get("pairOutcomeField"))
  };
}

function firstDifferentValue(select, disallowed) {
  const option = [...select.options].find(o => o.value !== disallowed);
  return option ? option.value : select.value;
}

function enforceDistinctAxisSelections(preferredChangedId) {
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  if (!x.options.length || !y.options.length) return;

  if (x.value === y.value) {
    if (preferredChangedId === "x-field") {
      y.value = firstDifferentValue(y, x.value);
    } else {
      x.value = firstDifferentValue(x, y.value);
    }
  }

  [...x.options].forEach(option => {
    option.disabled = option.value === y.value;
  });
  [...y.options].forEach(option => {
    option.disabled = option.value === x.value;
  });
}

function orderedCategoriesFromMetadata(payload) {
  const categories = payload?.categoryMetadata?.categories;
  if (Array.isArray(categories) && categories.length) {
    return categories
      .slice()
      .sort((a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER))
      .map(c => normalizeCategoryLabel(c.label));
  }
  return Object.keys(fixedPalette);
}

function groupByCategory(points, orderedCategories) {
  const groups = {};
  orderedCategories.forEach(k => { groups[k] = []; });
  (points || []).forEach(p => {
    const key = normalizeCategoryLabel(p.categoryLabel);
    if (!groups[key]) groups[key] = [];
    groups[key].push({ x: p.xValue, y: p.yValue, meta: p });
  });
  return groups;
}

function isFiniteNumber(value) {
  return Number.isFinite(Number(value));
}

function formatNumber(value, digits = 2) {
  return isFiniteNumber(value) ? Number(value).toFixed(digits) : null;
}

function buildRegressionContext(points) {
  if (!Array.isArray(points) || points.length === 0) {
    return { hasValidRegression: false };
  }

  const valid = points.filter(p => isFiniteNumber(p?.xValue) && isFiniteNumber(p?.yValue));
  if (valid.length === 0) {
    return { hasValidRegression: false };
  }

  const n = valid.length;
  const meanX = valid.reduce((sum, p) => sum + Number(p.xValue), 0) / n;
  const meanY = valid.reduce((sum, p) => sum + Number(p.yValue), 0) / n;

  let sxx = 0;
  let sxy = 0;
  valid.forEach(p => {
    const x = Number(p.xValue);
    const y = Number(p.yValue);
    sxx += (x - meanX) ** 2;
    sxy += (x - meanX) * (y - meanY);
  });

  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = meanY - (slope * meanX);

  const ciSource = points.find(p => isFiniteNumber(p?.ciLower) && isFiniteNumber(p?.ciUpper));
  const ciHalfWidth = ciSource ? (Number(ciSource.ciUpper) - Number(ciSource.ciLower)) / 2 : null;
  const sigma = isFiniteNumber(ciHalfWidth) ? Number(ciHalfWidth) / 1.96 : null;

  const hasValidRegression = isFiniteNumber(slope) && isFiniteNumber(intercept);
  return {
    hasValidRegression,
    n,
    slope,
    intercept,
    ciHalfWidth,
    sigma,
    equationText: hasValidRegression
      ? `yhat = ${formatNumber(intercept, 3)} + ${formatNumber(slope, 3)} * x`
      : null,
    bandFormulaText: isFiniteNumber(sigma)
      ? `Approx 95% band (constant-width): yhat +/- 1.96*sigma (sigma=${formatNumber(sigma, 3)})`
      : "Approx 95% band (constant-width): yhat +/- 1.96*sigma"
  };
}

function buildRegressionTraceMeta(point, traceKind, traceY) {
  return {
    traceKind,
    schoolCode: null,
    schoolName: null,
    direction: null,
    stdResid: null,
    xValue: point?.xValue ?? null,
    yValue: traceY ?? null,
    fitted: point?.fitted ?? null,
    ciLower: point?.ciLower ?? null,
    ciUpper: point?.ciUpper ?? null
  };
}

function tooltipLines(tooltipCtx, regressionContext, axisLabels = {}) {
  const m = tooltipCtx.raw?.meta;
  const parsedX = tooltipCtx.parsed?.x;
  const parsedY = tooltipCtx.parsed?.y;
  const xAxisLabel = axisLabels.x || "X";
  const yAxisLabel = axisLabels.y || "Y";

  const xValue = m?.xValue ?? parsedX;
  const observedY = m?.schoolName ? (m?.yValue ?? parsedY) : null;
  const fitted = m?.fitted;
  const ciLower = m?.ciLower;
  const ciUpper = m?.ciUpper;
  const isSchoolPoint = Boolean(m?.schoolName);

  const lines = [];

  if (isSchoolPoint) {
    lines.push(`${m.schoolName}`);
    lines.push(`County = ${m?.county || "N/A"}`);
    const xText = formatNumber(xValue, 2);
    if (xText != null) lines.push(`${xAxisLabel} = ${xText}`);
    const observedYText = formatNumber(observedY, 2);
    if (observedYText != null) lines.push(`${yAxisLabel} = ${observedYText}`);
    const stdResidText = formatNumber(m?.stdResid, 2);
    if (stdResidText != null) lines.push(`Std resid = ${stdResidText}`);
    return lines;
  }

  if (m?.traceKind) {
    lines.push("Regression Context");
  } else {
    lines.push(tooltipCtx.dataset?.label || "Value");
  }

  const xText = formatNumber(xValue, 2);
  if (xText != null) lines.push(`x = ${xText}`);

  const fittedText = formatNumber(fitted, 2);
  if (fittedText != null) lines.push(`Fitted yhat = ${fittedText}`);

  const ciLowText = formatNumber(ciLower, 2);
  const ciHighText = formatNumber(ciUpper, 2);
  if (ciLowText != null && ciHighText != null) {
    lines.push(`Approx 95% band = [${ciLowText}, ${ciHighText}]`);
  }

  if (regressionContext?.hasValidRegression && regressionContext.equationText) {
    lines.push(`Equation: ${regressionContext.equationText}`);
  }
  if (regressionContext?.bandFormulaText) {
    lines.push(`Band formula: ${regressionContext.bandFormulaText.replace(/^Approx 95% band \(constant-width\): /, "")}`);
  }

  if (lines.length === 1) {
    const xRaw = formatNumber(parsedX, 2);
    const yRaw = formatNumber(parsedY, 2);
    if (xRaw != null && yRaw != null) lines.push(`x = ${xRaw}, y = ${yRaw}`);
  }

  return lines;
}

function regressionLines(points) {
  if (!points || !points.length) return { line: [], upper: [], lower: [] };
  const dedupedByX = [];
  const seenX = new Set();
  points.forEach(point => {
    if (!isFiniteNumber(point?.xValue)) return;
    const key = String(Number(point.xValue));
    if (seenX.has(key)) return;
    seenX.add(key);
    dedupedByX.push(point);
  });
  const sorted = dedupedByX.sort((a, b) => a.xValue - b.xValue);
  return {
    line: sorted.map(p => ({ x: p.xValue, y: p.fitted, meta: buildRegressionTraceMeta(p, "regression", p.fitted) })),
    upper: sorted.map(p => ({ x: p.xValue, y: p.ciUpper, meta: buildRegressionTraceMeta(p, "ci_upper", p.ciUpper) })),
    lower: sorted.map(p => ({ x: p.xValue, y: p.ciLower, meta: buildRegressionTraceMeta(p, "ci_lower", p.ciLower) }))
  };
}

function isHighlightedPoint(ctx) {
  const schoolCode = ctx.raw?.meta?.schoolCode;
  return schoolCode != null && state.highlightedSchoolCode != null && Number(schoolCode) === Number(state.highlightedSchoolCode);
}

function syncOutlierRowHighlight() {
  const rows = document.querySelectorAll("#outlier-list li[data-school-code]");
  rows.forEach(row => {
    const isActive = state.highlightedSchoolCode != null && Number(row.dataset.schoolCode) === Number(state.highlightedSchoolCode);
    row.classList.toggle("is-hovered", isActive);
  });
}

function setChartHighlight(schoolCode) {
  state.highlightedSchoolCode = schoolCode == null ? null : Number(schoolCode);
  syncOutlierRowHighlight();

  if (!chart) return;
  if (state.highlightedSchoolCode == null) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update("none");
    return;
  }

  const match = state.pointLookup.get(Number(state.highlightedSchoolCode));
  if (!match) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    chart.update("none");
    return;
  }

  const pointElement = chart.getDatasetMeta(match.datasetIndex)?.data?.[match.index];
  const center = pointElement && typeof pointElement.getCenterPoint === "function"
    ? pointElement.getCenterPoint()
    : { x: 0, y: 0 };
  chart.tooltip.setActiveElements([{ datasetIndex: match.datasetIndex, index: match.index }], center);
  chart.update("none");
}

function renderMethodology(categoryMetadata) {
  const body = document.getElementById("category-methodology-text");
  const thresholds = document.getElementById("category-methodology-thresholds");
  if (!body || !thresholds) return;

  if (!categoryMetadata) {
    body.textContent = "Category methodology unavailable.";
    thresholds.hidden = true;
    thresholds.textContent = "";
    return;
  }

  if (categoryMetadata.mode === "native_range") {
    body.textContent = `Colors use the selected Y-axis category bands (${categoryMetadata.rangeField || "native range"}).`;
    thresholds.hidden = true;
    thresholds.textContent = "";
    return;
  }

  body.textContent = categoryMetadata.reason || "No native category bands available; colors use computed Y quintiles.";
  const q = categoryMetadata.quintileCutoffs;
  if (q) {
    thresholds.hidden = false;
    thresholds.textContent = `Q20=${Number(q.q20).toFixed(1)}  Q40=${Number(q.q40).toFixed(1)}  Q60=${Number(q.q60).toFixed(1)}  Q80=${Number(q.q80).toFixed(1)}`;
  } else {
    thresholds.hidden = true;
    thresholds.textContent = "";
  }
}

function formatRawValueHtml(value) {
  if (value == null) return '<span class="subtle">n/a</span>';
  if (value === "") return '<span class="subtle">(blank)</span>';
  return `<span class="mono">${escapeHtml(String(value))}</span>`;
}

function formatCleanValueHtml(value) {
  if (value == null || Number.isNaN(Number(value))) return '<span class="subtle">null</span>';
  return `<span class="mono">${escapeHtml(Number(value).toFixed(2))}</span>`;
}

function buildExclusionReasonBadgesHtml(row) {
  const badges = [];
  if (row?.missingX) badges.push("missing X");
  if (row?.missingY) badges.push("missing Y");
  if (row?.invalidX) badges.push("invalid X");
  if (row?.invalidY) badges.push("invalid Y");
  if (!badges.length) badges.push("unclassified");
  return `<div class="scatter-exclusion-flags">${badges.map(label => `<span class="flag-badge">${escapeHtml(label)}</span>`).join("")}</div>`;
}

function setScatterPairsError(message) {
  const el = document.getElementById("scatter-pairs-error");
  if (!el) return;
  if (!message) {
    el.hidden = true;
    el.textContent = "";
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function buildCorrelationDrilldownHref(row, countyValue) {
  const params = new URLSearchParams();
  params.set("predictor", String(row?.predictor ?? ""));
  params.set("outcome", String(row?.outcome ?? ""));
  params.set("county", String(countyValue || "all"));
  params.set("scope", CORRELATION_PAIR_SCOPE);
  return `./correlation-outliers.html?${params.toString()}`;
}

function updateScatterUrlQuery() {
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  const county = document.getElementById("county");
  if (!x || !y || !county) return;
  const params = new URLSearchParams(window.location.search);
  params.set("x", x.value);
  params.set("y", y.value);
  params.set("county", county.value || "all");
  params.set("pairSort", state.pairSortKey);
  params.set("pairDir", state.pairSortDir);
  params.set("pairPage", String(state.pairPage));
  Object.entries(PAIR_FILTER_PARAM_MAP).forEach(([filterKey, paramKey]) => {
    const value = String(state.pairFilters?.[filterKey] ?? "");
    if (value) params.set(paramKey, value);
    else params.delete(paramKey);
  });
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, "", nextUrl);
}

async function loadCorrelationPairs(countyValue) {
  const county = countyValue || "all";
  const url = `/correlation-outliers/pairs?county=${encodeURIComponent(county)}&scope=${encodeURIComponent(CORRELATION_PAIR_SCOPE)}&limit=${CORRELATION_PAIR_LIMIT}&sort=${encodeURIComponent(CORRELATION_PAIR_SORT)}`;
  try {
    const payload = await fetchJson(url);
    const rows = Array.isArray(payload?.pairs) ? payload.pairs : [];
    const annotated = annotatePairSelectability(rows, state.availableAxisFields);
    state.pairRows = annotated;
    state.pairRowsFiltered = annotated;
    state.pairLoadError = null;
    state.pairRowsCounty = county;
  } catch (err) {
    state.pairRows = [];
    state.pairRowsFiltered = [];
    state.pairLoadError = err?.message || "Unable to load ranked relationships.";
    state.pairRowsCounty = county;
  }
}

async function ensureCorrelationPairs(countyValue) {
  const county = countyValue || "all";
  if (state.pairRowsCounty === county && state.pairLoadError == null) return;
  await loadCorrelationPairs(county);
}

function getPairSortDefaultDir(sortKey) {
  return PAIR_SORT_DEFAULTS[sortKey] || "asc";
}

function setPairSort(sortKey) {
  const safeSort = normalizePairSortForState(sortKey, state.pairSortDir).sortKey;
  if (state.pairSortKey === safeSort) {
    state.pairSortDir = state.pairSortDir === "asc" ? "desc" : "asc";
  } else {
    state.pairSortKey = safeSort;
    state.pairSortDir = getPairSortDefaultDir(safeSort);
  }
  state.pairPage = 1;
}

function setPairFilter(filterKey, value) {
  if (!Object.prototype.hasOwnProperty.call(state.pairFilters, filterKey)) return;
  state.pairFilters[filterKey] = normalizePairFilterValue(value);
  state.pairPage = 1;
}

function renderPairFilterControls() {
  const filterDefs = [
    { id: "scatter-pairs-filter-any", key: "anyField", emptyLabel: "All fields" },
    { id: "scatter-pairs-filter-predictor", key: "predictorField", emptyLabel: "All predictors" },
    { id: "scatter-pairs-filter-outcome", key: "outcomeField", emptyLabel: "All outcomes" }
  ];
  filterDefs.forEach(def => {
    const el = document.getElementById(def.id);
    if (!el) return;
    const selectedValue = normalizePairFilterValue(state.pairFilters?.[def.key]);
    state.pairFilters[def.key] = selectedValue;
    el.length = 0;
    el.add(new Option(def.emptyLabel, ""));
    state.axisFieldOptions.forEach(option => {
      el.add(new Option(option.text, option.value));
    });
    el.value = selectedValue;
  });
}

function renderPairSortHeaderState() {
  const buttons = document.querySelectorAll(".scatter-pairs-sort-btn[data-sort-key]");
  buttons.forEach(btn => {
    const sortKey = btn.dataset.sortKey;
    const isActive = sortKey === state.pairSortKey;
    btn.classList.toggle("is-active", isActive);
    btn.classList.toggle("is-asc", isActive && state.pairSortDir === "asc");
    btn.classList.toggle("is-desc", isActive && state.pairSortDir === "desc");
    const th = btn.closest("th");
    if (th) {
      th.setAttribute("aria-sort", isActive ? (state.pairSortDir === "asc" ? "ascending" : "descending") : "none");
    }
  });
}

function renderPairPagerState() {
  const prev = document.getElementById("scatter-pairs-prev");
  const next = document.getElementById("scatter-pairs-next");
  const indicator = document.getElementById("scatter-pairs-page-indicator");
  if (indicator) {
    indicator.textContent = `Page ${state.pairPage} of ${state.pairTotalPages}`;
  }
  if (prev) prev.disabled = state.pairPage <= 1;
  if (next) next.disabled = state.pairPage >= state.pairTotalPages;
}

function renderCorrelationPairsPanel(xField, yField, countyLabel, countyValue) {
  const summary = document.getElementById("scatter-pairs-summary");
  const wrap = document.getElementById("scatter-pairs-table-wrap");
  const body = document.getElementById("scatter-pairs-table-body");
  const empty = document.getElementById("scatter-pairs-empty");
  if (!summary || !wrap || !body || !empty) return;

  state.selectedPairKey = pairKey({ predictor: xField, outcome: yField });
  renderPairFilterControls();
  renderPairSortHeaderState();

  if (state.pairLoadError) {
    state.pairTotalPages = 1;
    state.pairPage = 1;
    renderPairPagerState();
    summary.textContent = `Ranked relationships are unavailable for ${countyLabel}. Scatter remains fully usable.`;
    setScatterPairsError(state.pairLoadError);
    body.innerHTML = "";
    wrap.hidden = true;
    empty.hidden = true;
    return;
  }

  const filtered = filterPairs(state.pairRows, state.pairFilters);
  const sorted = sortPairsBy(filtered, state.pairSortKey, state.pairSortDir);
  state.pairRowsFiltered = sorted;

  const activePage = findPageForPair(sorted, state.pairPageSize, state.selectedPairKey);
  if (activePage != null) {
    state.pairPage = activePage;
  }

  const pageState = paginateRows(sorted, state.pairPage, state.pairPageSize);
  state.pairPage = pageState.page;
  state.pairTotalPages = pageState.totalPages;
  renderPairPagerState();
  setScatterPairsError(null);

  if (!sorted.length) {
    summary.textContent = `No ranked relationships matched the current field filters for ${countyLabel}.`;
    body.innerHTML = "";
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }

  const shown = pageState.rows.length;
  const truncation = state.pairRows.length >= CORRELATION_PAIR_LIMIT ? " Results may be truncated to the API cap of 500." : "";
  summary.textContent = `Showing ${shown} of ${sorted.length} filtered relationships (page ${state.pairPage} of ${state.pairTotalPages}) for ${countyLabel}.${truncation}`;

  body.innerHTML = pageState.rows.map(row => {
    const key = pairKey(row);
    const selectable = row?.selectable !== false;
    const isActive = isSelectedPair(row, xField, yField);
    const rowClasses = [
      "scatter-pair-row",
      selectable ? "is-selectable" : "is-disabled",
      isActive ? "is-selected" : ""
    ].filter(Boolean).join(" ");
    const rowTitle = selectable
      ? "Click to apply this pair to the scatter axes."
      : (row?.disabledReason || "This pair is unavailable in the current scatter axis list.");
    const pairLabel = `${row?.predictorLabel || row?.predictor || "Unknown"} -> ${row?.outcomeLabel || row?.outcome || "Unknown"}`;
    const rank = safeInteger(row?.defaultVisibilityRank);
    const rho = safeMetric(row?.spearmanR, 3);
    const rSquared = safeMetric(row?.rSquared, 3);
    const fdrP = safeMetric(row?.spearmanPCorrected, 4);
    const nObs = safeInteger(row?.nObs);
    const drilldownHref = buildCorrelationDrilldownHref(row, countyValue);
    return `
      <tr class="${rowClasses}" data-pair-key="${escapeHtml(key)}" title="${escapeHtml(rowTitle)}">
        <td>
          <div class="scatter-pair-main">${escapeHtml(pairLabel)}</div>
          <div class="scatter-pair-sub"><a class="scatter-pair-link" href="${escapeHtml(drilldownHref)}">Open detailed diagnostics</a></div>
        </td>
        <td class="mono">${escapeHtml(rank == null ? "-" : String(rank))}</td>
        <td class="mono">${escapeHtml(rho == null ? "-" : rho)}</td>
        <td class="mono">${escapeHtml(rSquared == null ? "-" : rSquared)}</td>
        <td class="mono">${escapeHtml(fdrP == null ? "-" : fdrP)}</td>
        <td class="mono">${escapeHtml(nObs == null ? "-" : String(nObs))}</td>
      </tr>
    `;
  }).join("");

  wrap.hidden = false;
  empty.hidden = true;
}

function rerenderCorrelationPairsForCurrentSelection() {
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  const county = document.getElementById("county");
  if (!x || !y || !county) return;
  const countyLabel = county.options[county.selectedIndex]?.text || "All";
  renderCorrelationPairsPanel(x.value, y.value, countyLabel, county.value);
  updateScatterUrlQuery();
}

async function applyScatterPairSelection(selectedPair) {
  if (!selectedPair || selectedPair.selectable === false) return;
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  if (!x || !y) return;

  x.value = selectedPair.predictor;
  y.value = selectedPair.outcome;
  state.selectedPairKey = pairKey(selectedPair);
  await refresh();
}

function onScatterPairTableClick(event) {
  const link = event.target?.closest?.("a");
  if (link) return;

  const rowEl = event.target?.closest?.("tr[data-pair-key]");
  if (!rowEl) return;
  const key = rowEl.dataset.pairKey;
  const selected = state.pairRowsFiltered.find(row => pairKey(row) === key);
  if (!selected || selected.selectable === false) return;

  applyScatterPairSelection(selected).catch(err => {
    showError(err.message || "Unable to apply selected relationship");
  });
}

function onScatterPairSortClick(event) {
  const btn = event.target?.closest?.(".scatter-pairs-sort-btn[data-sort-key]");
  if (!btn) return;
  setPairSort(btn.dataset.sortKey);
  rerenderCorrelationPairsForCurrentSelection();
}

function onScatterPairFilterChange(event) {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement)) return;
  if (target.id === "scatter-pairs-filter-any") setPairFilter("anyField", target.value);
  if (target.id === "scatter-pairs-filter-predictor") setPairFilter("predictorField", target.value);
  if (target.id === "scatter-pairs-filter-outcome") setPairFilter("outcomeField", target.value);
  rerenderCorrelationPairsForCurrentSelection();
}

function onScatterPairPrevPage() {
  if (state.pairPage <= 1) return;
  state.pairPage -= 1;
  rerenderCorrelationPairsForCurrentSelection();
}

function onScatterPairNextPage() {
  if (state.pairPage >= state.pairTotalPages) return;
  state.pairPage += 1;
  rerenderCorrelationPairsForCurrentSelection();
}

function renderExcludedRows(scatterPayload, xLabel, yLabel) {
  const summary = document.getElementById("excluded-schools-summary");
  const wrap = document.getElementById("excluded-schools-table-wrap");
  const body = document.getElementById("excluded-schools-table-body");
  const empty = document.getElementById("excluded-schools-empty");
  if (!summary || !wrap || !body || !empty) return;

  const rows = Array.isArray(scatterPayload?.excludedRows) ? scatterPayload.excludedRows : [];
  const cleaning = scatterPayload?.dataCleaning || {};
  const excludedTotal = safeInteger(cleaning.excludedSchoolsTotal) ?? rows.length;
  const overlap = safeInteger(cleaning.excludedBoth) ?? 0;

  summary.textContent = excludedTotal
    ? `These schools were excluded before plotting/regression for ${xLabel} vs ${yLabel}. Axis counts overlap; "both axes overlap" = ${overlap}.`
    : `No schools were excluded for ${xLabel} vs ${yLabel} under the current cleaning rules and filters.`;

  if (!rows.length) {
    body.innerHTML = "";
    wrap.hidden = true;
    empty.hidden = false;
    return;
  }

  body.innerHTML = rows.map(row => `
    <tr>
      <td>${escapeHtml(row.schoolName || "Unknown")}</td>
      <td class="mono">${escapeHtml(String(row.schoolCode ?? ""))}</td>
      <td>${escapeHtml(row.county || "")}</td>
      <td>${buildExclusionReasonBadgesHtml(row)}</td>
      <td>${formatRawValueHtml(row.xRawValue)}</td>
      <td>${formatRawValueHtml(row.yRawValue)}</td>
      <td>${formatCleanValueHtml(row.xCleanValue)}</td>
      <td>${formatCleanValueHtml(row.yCleanValue)}</td>
    </tr>
  `).join("");

  wrap.hidden = false;
  empty.hidden = true;
}

function renderScatterCleaningNote(scatterPayload) {
  const correlationEl = document.getElementById("scatter-correlation-note");
  const cleaningEl = document.getElementById("scatter-cleaning-note");
  if (!cleaningEl) return;
  const dataCleaning = scatterPayload?.dataCleaning || null;
  const stats = scatterPayload?.stats || null;
  const helper = window.HeliosCorrelationEvidence;
  const strengthCaption = stats && helper?.buildScatterStrengthCaption
    ? helper.buildScatterStrengthCaption({
      spearmanR: stats.spearmanR,
      spearmanPCorrected: stats.spearmanPCorrected,
      pairNObs: stats.pairNObs
    })
    : null;
  const note = dataCleaning?.noteText || "Data cleaning exclusions are unavailable for this selection.";
  const source = dataCleaning?.countSource ? ` Source: ${dataCleaning.countSource}.` : "";
  const consistency = dataCleaning?.countsConsistent === false
    ? " Warning: inclusion/exclusion counts are inconsistent; plotting was blocked."
    : "";
  const noteText = `${note}${source}${consistency}`;
  if (correlationEl) {
    if (strengthCaption) {
      correlationEl.innerHTML = `<strong>${escapeHtml(strengthCaption)}</strong>`;
    } else {
      correlationEl.textContent = "Correlation summary is unavailable for this selection.";
    }
  }
  cleaningEl.textContent = noteText;
}

function renderChart(payload, xLabel, yLabel) {
  const ctx = document.getElementById("scatter-chart").getContext("2d");
  const regressionContext = buildRegressionContext(payload.points || []);
  const orderedCategories = orderedCategoriesFromMetadata(payload);
  const groups = groupByCategory(payload.points || [], orderedCategories);
  const reg = regressionLines(payload.points || []);
  const colorMap = buildColorMap(orderedCategories);
  state.pointLookup = new Map();

  const scatterDatasets = orderedCategories.map((cat, datasetIndex) => {
    const vals = groups[cat] || [];
    vals.forEach((point, index) => {
      if (point.meta?.schoolCode != null) {
        state.pointLookup.set(Number(point.meta.schoolCode), { datasetIndex, index });
      }
    });
    const baseColor = colorMap[cat] || fixedPalette.NA;
    return {
      label: cat,
      data: vals,
      pointRadius: (c) => isHighlightedPoint(c) ? 8 : 5,
      pointHoverRadius: (c) => isHighlightedPoint(c) ? 9 : 6,
      pointBackgroundColor: withAlpha(baseColor, DATASET_OPACITY),
      pointBorderColor: (c) => isHighlightedPoint(c) ? "#ffffff" : withAlpha(baseColor, 0.95),
      pointBorderWidth: (c) => isHighlightedPoint(c) ? 2 : 0.6,
      showLine: false
    };
  });

  const datasets = [
    ...scatterDatasets,
    {
      label: "Regression",
      data: reg.line,
      borderColor: withAlpha("#4da3d1", DATASET_OPACITY),
      showLine: true,
      pointRadius: 0,
      borderWidth: 2
    },
    {
      label: "CI Upper",
      data: reg.upper,
      borderColor: withAlpha("#699db8", DATASET_OPACITY),
      borderDash: [4, 4],
      showLine: true,
      pointRadius: 0,
      borderWidth: 2
    },
    {
      label: "CI Lower",
      data: reg.lower,
      borderColor: withAlpha("#699db8", DATASET_OPACITY),
      borderDash: [4, 4],
      showLine: true,
      pointRadius: 0,
      borderWidth: 2
    }
  ];

  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "scatter",
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 100,
      animation: false,
      interaction: {
        mode: "nearest",
        intersect: false
      },
      plugins: {
        legend: { labels: { color: "#d8e6ee" } },
        tooltip: {
          mode: "nearest",
          intersect: false,
          callbacks: {
            label: (tooltipCtx) => tooltipLines(tooltipCtx, regressionContext, { x: xLabel, y: yLabel })
          }
        }
      },
      scales: {
        x: { title: { display: true, text: xLabel, color: "#d8e6ee" }, ticks: { color: "#d8e6ee" }, grid: { color: "#3a5d70" } },
        y: { title: { display: true, text: yLabel, color: "#d8e6ee" }, ticks: { color: "#d8e6ee" }, grid: { color: "#3a5d70" } }
      }
    }
  });

  renderMethodology(payload.categoryMetadata);
  if (state.highlightedSchoolCode != null) {
    setChartHighlight(state.highlightedSchoolCode);
  }
}

function renderOutliers(outliers) {
  const ul = document.getElementById("outlier-list");
  ul.innerHTML = "";
  (outliers || []).forEach(o => {
    const li = document.createElement("li");
    if (o.schoolCode != null) li.dataset.schoolCode = String(o.schoolCode);
    li.textContent = `${o.schoolName} (${o.direction}) std_resid=${o.stdResid.toFixed(2)}`;
    li.addEventListener("mouseenter", () => setChartHighlight(o.schoolCode));
    li.addEventListener("mouseleave", () => setChartHighlight(null));
    ul.appendChild(li);
  });
  syncOutlierRowHighlight();
}

async function refresh() {
  const x = document.getElementById("x-field");
  const y = document.getElementById("y-field");
  const county = document.getElementById("county");

  enforceDistinctAxisSelections();
  clearError();

  const xLabel = x.options[x.selectedIndex]?.text || "X";
  const yLabel = y.options[y.selectedIndex]?.text || "Y";
  const countyLabel = county.options[county.selectedIndex]?.text || "All";
  document.getElementById("chart-title").textContent = `${xLabel} - ${yLabel}`;

  const [scatter, outliers] = await Promise.all([
    fetchJson(`/scatter?x=${encodeURIComponent(x.value)}&y=${encodeURIComponent(y.value)}&county=${encodeURIComponent(county.value)}`),
    fetchJson(`/outliers?x=${encodeURIComponent(x.value)}&y=${encodeURIComponent(y.value)}&county=${encodeURIComponent(county.value)}&limit=10`)
  ]);

  const includedCount = safeInteger(scatter?.stats?.includedSchools ?? scatter?.schoolCount) ?? 0;
  document.getElementById("school-count").textContent = `School Count: ${includedCount}`;
  renderChart(scatter, xLabel, yLabel);
  renderOutliers(outliers.outliers || []);
  renderScatterCleaningNote(scatter);
  renderExcludedRows(scatter, xLabel, yLabel);
  renderScatterInterpretation(scatter, outliers, xLabel, yLabel, countyLabel);

  await ensureCorrelationPairs(county.value);
  renderCorrelationPairsPanel(x.value, y.value, countyLabel, county.value);
  updateScatterUrlQuery();

  let inlineWarning = null;
  if (state.requestedSchoolCode != null) {
    if (state.pointLookup.has(Number(state.requestedSchoolCode))) {
      setChartHighlight(Number(state.requestedSchoolCode));
    } else {
      setChartHighlight(null);
      inlineWarning = `Requested school ${state.requestedSchoolCode} is not in the current filtered scatter view.`;
    }
  }

  if (inlineWarning) {
    showError(inlineWarning);
  } else if (state.startupWarning) {
    showError(state.startupWarning);
  }
}

function wireEvents() {
  const pairBody = document.getElementById("scatter-pairs-table-body");
  if (pairBody) {
    pairBody.addEventListener("click", onScatterPairTableClick);
  }
  const pairHead = document.querySelector(".scatter-pairs-table thead");
  if (pairHead) {
    pairHead.addEventListener("click", onScatterPairSortClick);
  }
  const pairAny = document.getElementById("scatter-pairs-filter-any");
  const pairPredictor = document.getElementById("scatter-pairs-filter-predictor");
  const pairOutcome = document.getElementById("scatter-pairs-filter-outcome");
  const pairPrev = document.getElementById("scatter-pairs-prev");
  const pairNext = document.getElementById("scatter-pairs-next");
  if (pairAny) pairAny.addEventListener("change", onScatterPairFilterChange);
  if (pairPredictor) pairPredictor.addEventListener("change", onScatterPairFilterChange);
  if (pairOutcome) pairOutcome.addEventListener("change", onScatterPairFilterChange);
  if (pairPrev) pairPrev.addEventListener("click", onScatterPairPrevPage);
  if (pairNext) pairNext.addEventListener("click", onScatterPairNextPage);

  document.getElementById("x-field").addEventListener("change", async () => {
    enforceDistinctAxisSelections("x-field");
    try {
      await refresh();
    } catch (err) {
      showError(err.message || "Unable to load scatter data");
    }
  });

  document.getElementById("y-field").addEventListener("change", async () => {
    enforceDistinctAxisSelections("y-field");
    try {
      await refresh();
    } catch (err) {
      showError(err.message || "Unable to load scatter data");
    }
  });

  document.getElementById("county").addEventListener("change", async () => {
    try {
      await refresh();
    } catch (err) {
      showError(err.message || "Unable to load scatter data");
    }
  });
}

async function init() {
  await loadFilters();
  applySelectionsFromQuery();
  enforceDistinctAxisSelections("y-field");
  wireEvents();
  await refresh();
}

init().catch(err => {
  showError(err.message || "Unable to initialize page");
  console.error(err);
});
