const { fetchJson } = window.HeliosApi;

const state = {
  page: 1,
  pageSize: 25,
  pairSnapshotLimit: 15,
  counties: [],
  startupWarning: null
};

function qs(id) {
  return document.getElementById(id);
}

function setText(id, value) {
  const el = qs(id);
  if (!el) return;
  el.textContent = value;
}

function showError(message) {
  const el = qs("api-error");
  if (!el) return;
  el.hidden = false;
  el.textContent = message;
}

function clearError() {
  const el = qs("api-error");
  if (!el) return;
  el.hidden = true;
  el.textContent = "";
}

function safeText(value) {
  return value == null || value === "" ? "-" : String(value);
}

function safeNumber(value, digits = 2) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return Number(value).toFixed(digits);
}

function selectedCounty() {
  return qs("dc-county").value || "all";
}

function selectedExclusionCounty() {
  return qs("dc-exclusion-county").value || "all";
}

function buildQuery(params) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text.length) return;
    search.set(key, text);
  });
  const q = search.toString();
  return q ? `?${q}` : "";
}

function renderSummary(summary) {
  setText("dc-total-exclusions", summary?.totalExclusions == null ? "—" : summary.totalExclusions);
  const affectedSchoolsValue = summary?.affectedSchools == null ? "—" : summary.affectedSchools;
  setText("dc-affected-schools", summary?.affectedSchoolsIsLowerBound
    ? `${affectedSchoolsValue} (min)`
    : affectedSchoolsValue);
  setText("dc-affected-fields", summary?.affectedFields ?? 0);
  setText("dc-affected-pairs", summary?.affectedPairs ?? 0);
  const latest = `Latest cleaning run: ${safeText(summary?.latestRunTs)}`;
  const note = summary?.summaryNote ? ` | ${summary.summaryNote}` : "";
  setText("dc-latest-run", `${latest}${note}`);
}

function formatRange(row) {
  if (row?.validMin == null && row?.validMax == null) return "-";
  return `[${safeText(row?.validMin)}, ${safeText(row?.validMax)}]`;
}

function formatRule(row) {
  const enabled = row?.cleaningEnabled === true || Number(row?.cleaningEnabled) === 1;
  const kind = safeText(row?.ruleDataKind || row?.dataKind);
  return `${enabled ? "Enabled" : "Profile only"} | ${kind}`;
}

function formatReasonMix(row) {
  return [
    `blank ${safeText(row?.blankSchoolCount)}`,
    `null ${safeText(row?.nullTokenSchoolCount)}`,
    `parse ${safeText(row?.parseFailureSchoolCount)}`,
    `range ${safeText(row?.outOfRangeSchoolCount)}`,
    `sentinel ${safeText(row?.sentinelSchoolCount)}`
  ].join(" | ");
}

function renderFieldMatrix(payload) {
  const tbody = qs("dc-field-matrix-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = payload?.rows || [];
  rows.forEach(row => {
    const tr = document.createElement("tr");
    [
      `${safeText(row.label)} (${safeText(row.fieldKey)})`,
      row.fieldKeyType,
      formatRule(row),
      formatRange(row),
      row.invalidSentinelsCsv,
      row.nullTokensCsv,
      row.blankCount,
      row.nullTokenCount,
      row.parseFailureCount,
      row.semanticInvalidCount,
      row.excludedSchoolCount,
      safeNumber(row.excludedPct, 2),
      formatReasonMix(row),
      row.availabilityReason || "available"
    ].forEach((cell, idx) => {
      const td = document.createElement("td");
      td.textContent = safeText(cell);
      if (idx === 0) td.classList.add("pair-label-cell");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  setText("dc-matrix-count", `Rows: ${rows.length}`);
}

function renderPairSnapshot(payload) {
  const tbody = qs("dc-pair-summary-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = payload?.rows || [];
  rows.forEach(row => {
    const tr = document.createElement("tr");
    [
      `${safeText(row.predictorLabel || row.predictor)} → ${safeText(row.outcomeLabel || row.outcome)}`,
      row.includedSchools,
      row.excludedSchoolsTotal,
      `${safeText(row.missingPredictor)}/${safeText(row.missingOutcome)}`,
      `${safeText(row.invalidPredictor)}/${safeText(row.invalidOutcome)}`
    ].forEach((cell, idx) => {
      const td = document.createElement("td");
      td.textContent = safeText(cell);
      if (idx === 0) td.classList.add("pair-label-cell");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  setText("dc-pair-count", `Top ${rows.length} pairs`);
}

function renderExclusions(payload) {
  const tbody = qs("dc-exclusions-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const rows = payload?.rows || [];
  rows.forEach(row => {
    const tr = document.createElement("tr");
    [
      `${safeText(row.schoolName)} (${safeText(row.schoolCode)})`,
      row.county,
      `${safeText(row.label)} (${safeText(row.fieldKey)})`,
      row.reasonCode,
      row.rawValue,
      row.normalizedValue,
      row.stageApplicable
    ].forEach(cell => {
      const td = document.createElement("td");
      td.textContent = safeText(cell);
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  const total = payload?.total ?? 0;
  setText("dc-exclusion-count", `Rows: ${total}`);
  setText("dc-page-label", `Page ${state.page} (${rows.length} rows shown)`);
  const prev = qs("dc-prev-page");
  const next = qs("dc-next-page");
  if (prev) prev.disabled = state.page <= 1;
  if (next) next.disabled = (state.page * state.pageSize) >= total;
}

function initializeCountySelects() {
  const selects = [qs("dc-county"), qs("dc-exclusion-county")];
  selects.forEach(select => {
    if (!select) return;
    select.length = 0;
    select.add(new Option("All", "all"));
  });
}

async function loadCounties() {
  initializeCountySelects();
  const payload = await fetchJson("/filters");
  state.counties = payload?.counties || [];
  const selects = [qs("dc-county"), qs("dc-exclusion-county")];
  selects.forEach(select => {
    state.counties.forEach(county => select.add(new Option(county, county)));
  });
  state.startupWarning = state.counties.length
    ? null
    : "County filters are unavailable right now. Using All counties.";
}

function updatePairLink(county) {
  const href = `./correlation-outliers.html${buildQuery({ county })}`;
  const link = qs("dc-full-pairs-link");
  if (link) {
    link.setAttribute("href", href);
  }
}

async function refreshAll() {
  clearError();

  const fieldSearch = qs("dc-search").value.trim();
  const exclusionSchool = qs("dc-exclusion-school").value.trim();
  const exclusionField = qs("dc-exclusion-field").value.trim();
  const exclusionReason = qs("dc-exclusion-reason").value;
  const exclusionCounty = selectedExclusionCounty();
  const pairCounty = selectedCounty();
  updatePairLink(pairCounty);

  const [summary, matrix] = await Promise.all([
    fetchJson("/data-cleaning/summary"),
    fetchJson(`/data-cleaning/field-matrix${buildQuery({
      search: fieldSearch || null,
      reason: exclusionReason || null,
      sort: "excluded_desc",
      limit: 250,
      includeUnavailable: true
    })}`)
  ]);

  renderSummary(summary);
  renderFieldMatrix(matrix);

  fetchJson(`/data-cleaning/pairs${buildQuery({ county: pairCounty, sort: "excluded_desc", limit: state.pairSnapshotLimit })}`)
    .then(renderPairSnapshot)
    .catch(err => {
      console.warn("pair snapshot load failed", err);
      const body = qs("dc-pair-summary-body");
      if (body) {
        body.innerHTML = '<tr><td colspan="5">Unable to load pair snapshot (try refresh).</td></tr>';
      }
      setText("dc-pair-count", "Top - pairs");
    });

  fetchJson(`/data-cleaning/exclusions${buildQuery({
    page: state.page,
    pageSize: state.pageSize,
    county: exclusionCounty,
    reason: exclusionReason || null,
    field: exclusionField || null,
    schoolQuery: exclusionSchool || null
  })}`)
    .then(renderExclusions)
    .catch(err => {
      console.warn("exclusions load failed", err);
      const body = qs("dc-exclusions-body");
      if (body) {
        body.innerHTML = '<tr><td colspan="7">Unable to load exclusions (try narrowing filters).</td></tr>';
      }
      setText("dc-exclusion-count", "Rows: -");
    });
}

function wireEvents() {
  qs("dc-refresh").addEventListener("click", async () => {
    state.page = 1;
    try {
      await refreshAll();
    } catch (err) {
      showError(err.message || "Unable to refresh data cleaning page");
    }
  });

  [
    "dc-county",
    "dc-search",
    "dc-exclusion-school",
    "dc-exclusion-field",
    "dc-exclusion-reason",
    "dc-exclusion-county"
  ].forEach(id => {
    const el = qs(id);
    const evt = el.tagName === "SELECT" ? "change" : "input";
    el.addEventListener(evt, async () => {
      state.page = 1;
      try {
        await refreshAll();
      } catch (err) {
        showError(err.message || "Unable to refresh data cleaning page");
      }
    });
  });

  qs("dc-prev-page").addEventListener("click", async () => {
    if (state.page <= 1) return;
    state.page -= 1;
    try {
      await refreshAll();
    } catch (err) {
      showError(err.message || "Unable to load exclusions page");
    }
  });

  qs("dc-next-page").addEventListener("click", async () => {
    state.page += 1;
    try {
      await refreshAll();
    } catch (err) {
      state.page = Math.max(1, state.page - 1);
      showError(err.message || "Unable to load exclusions page");
    }
  });
}

async function init() {
  wireEvents();
  try {
    await loadCounties();
  } catch (err) {
    console.warn("county filter load failed; continuing with All county", err);
    state.startupWarning = "County filters are unavailable right now. Using All counties.";
  }
  await refreshAll();
  if (state.startupWarning) {
    showError(state.startupWarning);
  }
}

init().catch(err => {
  console.error(err);
  showError(err.message || "Unable to initialize data cleaning page");
});
