const { fetchJson } = window.HeliosApi;

let allFieldRows = [];
let visibleFieldRows = [];
let selectedFieldName = null;
let detailChart = null;

const state = {
  serverFilters: {
    county: "all",
    schoolType: "all",
    titleOne: "all"
  },
  detailRequestToken: 0,
  profileRequestToken: 0,
  fieldBrowserBound: false
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

function pct(value) {
  if (value == null || Number.isNaN(Number(value))) return "-";
  return `${Number(value).toFixed(1)}%`;
}

function num(value) {
  if (value == null || value === "") return "-";
  const n = Number(value);
  if (!Number.isFinite(n)) return safeText(value);
  if (Math.abs(n) >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function trimLower(value) {
  return (value ?? "").toString().trim().toLowerCase();
}

function populateSelect(selectId, values, opts = {}) {
  const select = byId(selectId);
  const previous = select.value;
  const keepFirst = opts.keepFirst ?? true;
  const start = keepFirst ? 1 : 0;
  while (select.options.length > start) select.remove(start);

  values.forEach(v => {
    const label = opts.labelFn ? opts.labelFn(v) : v;
    select.add(new Option(label, v));
  });

  if ([...select.options].some(o => o.value === previous)) {
    select.value = previous;
  }
}

function toQuery(params) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    qs.set(k, v == null || v === "" ? "all" : String(v));
  });
  return qs.toString();
}

function currentServerFilters() {
  return {
    county: byId("ss-county").value || "all",
    schoolType: byId("ss-school-type").value || "all",
    titleOne: byId("ss-title-one").value || "all"
  };
}

function renderDatasetSummary(profile) {
  const ds = profile?.datasetSummary || {};
  byId("ss-rows").textContent = num(ds.rowCountInScope ?? 0);
  byId("ss-fields").textContent = num(ds.totalFields ?? 0);
  byId("ss-measures").textContent = num(ds.measureCount ?? 0);
  byId("ss-dimension-like").textContent = num(ds.dimensionLikeCount ?? 0);
  byId("ss-high-missing").textContent = num(ds.highMissingFieldCount ?? 0);
  byId("ss-all-null").textContent = num(ds.allNullFieldCount ?? 0);
}

function deriveClientFilterValues(rows) {
  const types = [...new Set((rows || []).map(r => r.variableType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set((rows || []).map(r => r.metadataCategory).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return { types, categories };
}

function initClientFilterOptions(rows) {
  const { types, categories } = deriveClientFilterValues(rows);
  populateSelect("ss-type-filter", types, { keepFirst: true, labelFn: v => v.replaceAll("_", " ") });
  populateSelect("ss-category-filter", categories, { keepFirst: true });
}

function matchesFieldSearch(row, query) {
  if (!query) return true;
  const haystack = [
    row.fieldName,
    row.displayLabel,
    row.variableType,
    row.metricType,
    row.sourceLayer,
    row.metadataCategory,
    row.preview,
    ...(row.flags || [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function applyClientFieldFilters(options = {}) {
  const reloadSelectedDetail = Boolean(options.reloadSelectedDetail);
  const query = trimLower(byId("ss-search").value);
  const type = byId("ss-type-filter").value;
  const category = byId("ss-category-filter").value;
  const source = byId("ss-source-filter").value;

  visibleFieldRows = allFieldRows.filter(row => {
    const typeMatch = type === "all" || row.variableType === type;
    const categoryMatch = category === "all" || (row.metadataCategory || "") === category;
    const sourceMatch = source === "all" || row.sourceLayer === source;
    return typeMatch && categoryMatch && sourceMatch && matchesFieldSearch(row, query);
  });

  renderFieldBrowserRows();
  byId("ss-field-count").textContent = `Showing ${visibleFieldRows.length} of ${allFieldRows.length} fields`;
  byId("ss-fields-empty").hidden = visibleFieldRows.length !== 0;

  if (!visibleFieldRows.length) {
    selectedFieldName = null;
    renderDetailPlaceholder("No fields match the current filters.");
    return;
  }

  if (!visibleFieldRows.some(r => r.fieldName === selectedFieldName)) {
    selectedFieldName = visibleFieldRows[0].fieldName;
    loadFieldDetail(selectedFieldName).catch(err => showError(err.message || "Unable to load field detail"));
  } else {
    highlightSelectedFieldRow();
    if (reloadSelectedDetail) {
      loadFieldDetail(selectedFieldName).catch(err => showError(err.message || "Unable to load field detail"));
    }
  }
}

function renderFieldBrowserRows() {
  const tbody = byId("ss-fields-body");
  tbody.innerHTML = "";

  visibleFieldRows.forEach(row => {
    const tr = document.createElement("tr");
    tr.dataset.fieldName = row.fieldName;
    if (row.fieldName === selectedFieldName) tr.classList.add("is-selected");

    appendCell(tr, row.fieldName, true);
    appendCell(tr, row.displayLabel);
    appendCell(tr, row.metricType ? `${row.variableType} (${row.metricType})` : row.variableType);
    appendCell(tr, row.sourceLayer);
    appendCell(tr, row.metadataCategory);
    appendCell(tr, pct(row.missingPct));
    appendCell(tr, num(row.distinctCountNonMissing));
    appendCell(tr, pct(row.numericParseablePct));
    appendCell(tr, row.preview);
    appendFlagsCell(tr, row.flags || []);

    tbody.appendChild(tr);
  });
}

function appendCell(tr, value, mono = false) {
  const td = document.createElement("td");
  td.textContent = safeText(value);
  if (mono) td.classList.add("mono");
  tr.appendChild(td);
}

function appendFlagsCell(tr, flags) {
  const td = document.createElement("td");
  if (!flags.length) {
    td.textContent = "-";
    tr.appendChild(td);
    return;
  }
  td.classList.add("flag-cell");
  flags.forEach(flag => {
    const span = document.createElement("span");
    span.className = "flag-badge";
    span.textContent = flag;
    td.appendChild(span);
  });
  tr.appendChild(td);
}

function highlightSelectedFieldRow() {
  document.querySelectorAll("#ss-fields-body tr[data-field-name]").forEach(tr => {
    tr.classList.toggle("is-selected", tr.dataset.fieldName === selectedFieldName);
  });
}

function renderDetailPlaceholder(message) {
  byId("ss-detail-title").textContent = "Select a field";
  byId("ss-detail-subtitle").textContent = message || "Field-level summary statistics will appear here.";
  byId("ss-detail-type").textContent = "-";
  byId("ss-detail-flags").innerHTML = "";
  renderDefinitionList("ss-coverage-list", {});
  renderDefinitionList("ss-stats-list", {});
  renderWarnings([]);
  renderDetailTableRows([], "Value", "Count", "Pct");
  renderChart(null, []);
}

function renderDetailLoading(fieldName) {
  byId("ss-detail-title").textContent = safeText(fieldName);
  byId("ss-detail-subtitle").textContent = "Loading field details...";
  byId("ss-detail-type").textContent = "-";
}

async function loadFilterOptions() {
  const payload = await fetchJson("/summary-stats/filters");
  populateSelect("ss-county", payload.counties || [], { keepFirst: true });
  populateSelect("ss-school-type", payload.schoolTypes || [], { keepFirst: true });
  populateSelect("ss-title-one", payload.titleOneValues || [], { keepFirst: true });
}

async function loadProfile(preferredFieldName = null) {
  const reqToken = ++state.profileRequestToken;
  const filters = currentServerFilters();
  state.serverFilters = filters;
  const payload = await fetchJson(`/summary-stats/profile?${toQuery({ ...filters, includeUnavailable: true })}`);
  if (reqToken !== state.profileRequestToken) return;

  allFieldRows = payload.fields || [];
  renderDatasetSummary(payload);
  initClientFilterOptions(allFieldRows);

  if (preferredFieldName) selectedFieldName = preferredFieldName;
  applyClientFieldFilters({ reloadSelectedDetail: true });
}

function renderDefinitionList(targetId, values) {
  const dl = byId(targetId);
  dl.innerHTML = "";
  const entries = Object.entries(values || {}).filter(([, v]) => v != null && v !== "");
  if (!entries.length) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = "Info";
    const dd = document.createElement("dd");
    dd.textContent = "-";
    div.appendChild(dt);
    div.appendChild(dd);
    dl.appendChild(div);
    return;
  }

  entries.forEach(([key, value]) => {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    dt.textContent = formatKey(key);
    const dd = document.createElement("dd");
    dd.textContent = typeof value === "number" ? num(value) : safeText(value);
    div.appendChild(dt);
    div.appendChild(dd);
    dl.appendChild(div);
  });
}

function formatKey(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\bPct\b/g, "%")
    .replace(/\bIqr\b/g, "IQR")
    .replace(/\bStd\b/g, "Std")
    .replace(/\bId\b/g, "ID")
    .replace(/^n /i, "N ")
    .replace(/\b([a-z])/g, c => c.toUpperCase());
}

function renderFlags(flags) {
  const el = byId("ss-detail-flags");
  el.innerHTML = "";
  (flags || []).forEach(flag => {
    const span = document.createElement("span");
    span.className = "flag-badge";
    span.textContent = flag;
    el.appendChild(span);
  });
}

function renderWarnings(warnings) {
  const ul = byId("ss-warnings");
  const empty = byId("ss-warnings-empty");
  ul.innerHTML = "";
  (warnings || []).forEach(w => {
    const li = document.createElement("li");
    li.textContent = w;
    ul.appendChild(li);
  });
  empty.hidden = (warnings || []).length !== 0;
}

function renderDetailTableRows(rows, c1, c2, c3) {
  byId("ss-detail-table-col1").textContent = c1;
  byId("ss-detail-table-col2").textContent = c2;
  byId("ss-detail-table-col3").textContent = c3;

  const tbody = byId("ss-detail-rows");
  tbody.innerHTML = "";

  rows.forEach(row => {
    const tr = document.createElement("tr");
    Object.values(row).forEach((value, idx) => {
      const td = document.createElement("td");
      td.textContent = idx === 1 ? num(value) : safeText(value);
      if (idx === 0) td.classList.add("mono");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  byId("ss-detail-rows-empty").hidden = rows.length !== 0;
}

function renderChart(kind, points) {
  const canvas = byId("ss-detail-chart");
  if (detailChart) {
    detailChart.destroy();
    detailChart = null;
  }

  if (!points || !points.length) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = points.map(p => p.label);
  const counts = points.map(p => p.count);

  detailChart = new Chart(canvas, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: kind === "histogram" ? "Count" : "Category Count",
        data: counts,
        backgroundColor: kind === "histogram" ? "rgba(46, 168, 223, 0.50)" : "rgba(155, 207, 193, 0.55)",
        borderColor: kind === "histogram" ? "rgba(46, 168, 223, 0.95)" : "rgba(155, 207, 193, 0.95)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              return `Count: ${ctx.raw}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#dbe8f0",
            maxRotation: 65,
            minRotation: 0,
            autoSkip: true
          },
          grid: { color: "rgba(255,255,255,0.07)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#dbe8f0", precision: 0 },
          grid: { color: "rgba(255,255,255,0.07)" }
        }
      }
    }
  });
}

async function loadFieldDetail(fieldName) {
  if (!fieldName) {
    renderDetailPlaceholder();
    return;
  }
  renderDetailLoading(fieldName);
  const reqToken = ++state.detailRequestToken;
  const query = toQuery({ field: fieldName, ...state.serverFilters });
  const detail = await fetchJson(`/summary-stats/field?${query}`);
  if (reqToken !== state.detailRequestToken) return;

  const field = detail.field || {};
  byId("ss-detail-title").textContent = safeText(field.displayLabel || field.fieldName);
  const subtitleParts = [
    field.fieldName ? `Field: ${field.fieldName}` : null,
    field.sourceLayer ? `Source: ${field.sourceLayer}` : null,
    field.metadataCategory ? `Category: ${field.metadataCategory}` : null
  ].filter(Boolean);
  byId("ss-detail-subtitle").textContent = subtitleParts.join(" • ") || "Field-level summary statistics";
  byId("ss-detail-type").textContent = detail.metricType
    ? `${safeText(detail.variableType)} (${safeText(detail.metricType)})`
    : safeText(detail.variableType);
  renderFlags(field.flags || []);

  renderDefinitionList("ss-coverage-list", detail.coverage || {});
  renderDefinitionList("ss-stats-list", detail.summaryCards || {});
  renderWarnings(detail.warnings || []);

  const histogram = detail.histogram || [];
  const categories = detail.categoryDistribution || [];

  if (histogram.length) {
    byId("ss-chart-title").textContent = "Histogram";
    const chartPoints = histogram.map((b, idx) => ({
      label: `${num(b.startInclusive)}–${num(b.endExclusive)}`,
      count: Number(b.count || 0),
      idx
    }));
    renderChart("histogram", chartPoints);

    const denom = Number((detail.summaryCards || {}).nNumeric || 0);
    renderDetailTableRows(chartPoints.map(p => ({
      Range: p.label,
      Count: p.count,
      Pct: denom > 0 ? `${((p.count / denom) * 100).toFixed(1)}%` : "-"
    })), "Range", "Count", "Pct");
    return;
  }

  if (categories.length) {
    byId("ss-chart-title").textContent = "Category Distribution";
    const chartPoints = categories.map(c => ({ label: safeText(c.label), count: Number(c.count || 0) }));
    renderChart("category", chartPoints);
    renderDetailTableRows(categories.map(c => ({
      Value: safeText(c.label),
      Count: Number(c.count || 0),
      Pct: pct(c.pct)
    })), "Value", "Count", "Pct");
    return;
  }

  byId("ss-chart-title").textContent = "Distribution";
  renderChart(null, []);
  renderDetailTableRows([], "Value", "Count", "Pct");
}

async function reloadForServerFilters() {
  clearError();
  const previousField = selectedFieldName;
  await loadProfile(previousField);
}

function activateFieldFromRow(fieldName) {
  if (!fieldName) return;
  clearError();
  selectedFieldName = fieldName;
  highlightSelectedFieldRow();
  loadFieldDetail(fieldName).catch(err => showError(err.message || "Unable to load field detail"));
}

function bindFieldBrowserEvents() {
  if (state.fieldBrowserBound) return;
  const tbody = byId("ss-fields-body");
  const handler = event => {
    const row = event.target.closest("tr[data-field-name]");
    if (!row || !tbody.contains(row)) return;
    activateFieldFromRow(row.dataset.fieldName);
  };
  tbody.addEventListener("click", handler);
  tbody.addEventListener("dblclick", handler);
  state.fieldBrowserBound = true;
}

function bindEvents() {
  bindFieldBrowserEvents();
  ["ss-search", "ss-type-filter", "ss-category-filter", "ss-source-filter"].forEach(id => {
    const ev = id === "ss-search" ? "input" : "change";
    byId(id).addEventListener(ev, () => {
      clearError();
      applyClientFieldFilters();
    });
  });

  ["ss-county", "ss-school-type", "ss-title-one"].forEach(id => {
    byId(id).addEventListener("change", () => {
      reloadForServerFilters().catch(err => showError(err.message || "Unable to reload summary stats"));
    });
  });
}

async function init() {
  clearError();
  bindEvents();
  renderDetailPlaceholder();
  await loadFilterOptions();
  await loadProfile();
}

init().catch(err => {
  showError(err.message || "Unable to load Summary Stats");
  renderDetailPlaceholder("Unable to load summary stats data.");
});
