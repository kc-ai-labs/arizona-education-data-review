const { fetchJson } = window.HeliosApi;

let allDefinitions = [];

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

function cleaningStatus(definition) {
  if (!definition.cleaningEnabled) return "Off";
  const kind = definition.cleaningDataKind ? ` (${definition.cleaningDataKind})` : "";
  return `On${kind}`;
}

function cleaningRuleSummary(definition) {
  if (!definition.cleaningEnabled) return "-";
  const parts = [];
  if (definition.cleaningNullTokensCsv) parts.push(`null tokens: ${definition.cleaningNullTokensCsv}`);
  if (definition.cleaningValidMin != null || definition.cleaningValidMax != null) {
    parts.push(`range: [${safeText(definition.cleaningValidMin)}, ${safeText(definition.cleaningValidMax)}]`);
  }
  if (definition.cleaningInvalidSentinelsCsv) parts.push(`sentinels: ${definition.cleaningInvalidSentinelsCsv}`);
  if (definition.cleaningRuleVersion) parts.push(`v=${definition.cleaningRuleVersion}`);
  if (definition.cleaningRuleSource) parts.push(`source=${definition.cleaningRuleSource}`);
  return parts.join(" | ") || "-";
}

function populateCategories(definitions) {
  const select = document.getElementById("category-filter");
  const categories = [...new Set(definitions.map(d => d.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  select.length = 1;
  categories.forEach(category => select.add(new Option(category, category)));
}

function matchesSearch(definition, query) {
  if (!query) return true;
  const haystack = [
    definition.constantValue,
    definition.schoolField,
    definition.queryField,
    definition.category,
    definition.constantDesc
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function renderRows(definitions) {
  const tbody = document.getElementById("definitions-body");
  tbody.innerHTML = "";

  definitions.forEach(definition => {
    const tr = document.createElement("tr");
    [
      safeText(definition.constantValue),
      safeText(definition.schoolField),
      safeText(definition.queryField),
      safeText(definition.category),
      safeText(definition.constantDesc),
      safeText(definition.constantType),
      cleaningStatus(definition),
      cleaningRuleSummary(definition)
    ].forEach(text => {
      const td = document.createElement("td");
      td.textContent = text;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function applyFilters() {
  const query = document.getElementById("definition-search").value.trim().toLowerCase();
  const category = document.getElementById("category-filter").value;

  const filtered = allDefinitions.filter(d => {
    const categoryMatch = category === "all" || (d.category || "") === category;
    return categoryMatch && matchesSearch(d, query);
  });

  renderRows(filtered);
  document.getElementById("definition-count").textContent = `Showing ${filtered.length} of ${allDefinitions.length}`;
  document.getElementById("definitions-empty").hidden = filtered.length !== 0;
}

async function init() {
  clearError();
  const payload = await fetchJson("/definitions?includeUnavailable=true");
  allDefinitions = payload.definitions || [];

  populateCategories(allDefinitions);
  document.getElementById("definition-search").addEventListener("input", applyFilters);
  document.getElementById("category-filter").addEventListener("change", applyFilters);
  applyFilters();
}

init().catch(err => {
  showError(err.message || "Unable to load field definitions");
  document.getElementById("definition-count").textContent = "Showing 0 of 0";
  document.getElementById("definitions-empty").hidden = false;
});
