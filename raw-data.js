const { fetchJson } = window.HeliosApi;

let allRows = [];

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

function safeText(value) {
  return value == null || value === "" ? "-" : String(value);
}

function byId(id) {
  return document.getElementById(id);
}

function populateSelect(id, values) {
  const select = byId(id);
  const existing = select.value;
  select.length = 1;
  values.forEach(value => select.add(new Option(value, value)));
  if ([...select.options].some(o => o.value === existing)) {
    select.value = existing;
  }
}

function renderSummary(payload) {
  const rows = payload.mappings || [];
  const summary = payload.summary || {};
  const master = payload.masterDataset || {};
  const verification = payload.verification || {};

  const exact = rows.filter(r => r.mappingType === "exact_overlap").length;
  const derived = rows.filter(r => r.mappingType === "derived_from_schools").length;
  const unique = rows.filter(r => r.mappingType === "unique_to_school_range").length;

  byId("summary-school-columns").textContent = String(summary.schoolColumns ?? 0);
  byId("summary-range-columns").textContent = String(summary.rangeColumns ?? 0);
  byId("summary-exact").textContent = String(exact || summary.exactOverlapColumns || 0);
  byId("summary-derived").textContent = String(derived);
  byId("summary-unique").textContent = String(unique || summary.uniqueRangeOnlyColumns || 0);
  byId("summary-valid-mappings").textContent = String(summary.validDeclaredMappings ?? 0);

  byId("master-view-name").textContent = safeText(master.viewName || summary.masterDatasetViewName);
  byId("master-rollout").textContent = safeText(master.rollout);
  byId("master-join-key").textContent = safeText(master.joinKey);
  byId("master-included-count").textContent = String((master.includedRangeFields || []).length);

  byId("verify-success").textContent = verification.schemaInspectionSucceeded ? "PASS" : "FAIL";
  byId("verify-source").textContent = safeText(verification.source);

  const msgs = byId("verification-messages");
  msgs.innerHTML = "";
  (verification.messages || []).forEach(msg => {
    const li = document.createElement("li");
    li.textContent = msg;
    msgs.appendChild(li);
  });
}

function renderTableRows(targetId, rows, columns) {
  const tbody = byId(targetId);
  tbody.innerHTML = "";
  rows.forEach(row => {
    const tr = document.createElement("tr");
    columns.forEach(col => {
      const td = document.createElement("td");
      td.textContent = safeText(row[col]);
      if (col.toLowerCase().includes("field")) td.classList.add("mono");
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function matchesSearch(row, query) {
  if (!query) return true;
  const haystack = [
    row.rangeField,
    row.schoolField,
    row.label,
    row.category,
    row.fieldDefinition,
    row.derivationDefinition,
    row.mappingType,
    row.masterDatasetAction,
    row.reason,
    row.notes
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function applyFilters() {
  const query = byId("raw-data-search").value.trim().toLowerCase();
  const mappingType = byId("mapping-type-filter").value;
  const category = byId("raw-data-category-filter").value;
  const action = byId("action-filter").value;

  const filtered = allRows.filter(row => {
    const mappingMatch = mappingType === "all" || row.mappingType === mappingType;
    const categoryMatch = category === "all" || (row.category || "") === category;
    const actionMatch = action === "all" || row.masterDatasetAction === action;
    return mappingMatch && categoryMatch && actionMatch && matchesSearch(row, query);
  });

  renderTableRows("inventory-body", filtered, [
    "rangeField", "schoolField", "mappingType", "masterDatasetAction", "label", "category", "fieldDefinition", "derivationDefinition", "reason", "notes"
  ]);
  byId("inventory-count").textContent = `Showing ${filtered.length} of ${allRows.length}`;
  byId("inventory-empty").hidden = filtered.length !== 0;
}

function initFilters(rows) {
  const mappingTypes = [...new Set(rows.map(r => r.mappingType).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categories = [...new Set(rows.map(r => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  populateSelect("mapping-type-filter", mappingTypes);
  populateSelect("raw-data-category-filter", categories);
}

function renderIncludedExcluded(rows) {
  const included = rows.filter(r => r.masterDatasetAction === "include");
  const excluded = rows.filter(r => r.masterDatasetAction === "exclude_from_school_range");

  renderTableRows("included-body", included, ["rangeField", "category", "reason"]);
  renderTableRows("excluded-body", excluded, ["rangeField", "mappingType", "reason"]);
}

async function init() {
  clearError();
  const payload = await fetchJson("/raw-data?includeUnavailable=true");
  allRows = payload.mappings || [];

  renderSummary(payload);
  renderIncludedExcluded(allRows);
  initFilters(allRows);

  byId("raw-data-search").addEventListener("input", applyFilters);
  byId("mapping-type-filter").addEventListener("change", applyFilters);
  byId("raw-data-category-filter").addEventListener("change", applyFilters);
  byId("action-filter").addEventListener("change", applyFilters);

  applyFilters();
}

init().catch(err => {
  showError(err.message || "Unable to load field mapping inventory");
  byId("inventory-count").textContent = "Showing 0 of 0";
  byId("inventory-empty").hidden = false;
});
