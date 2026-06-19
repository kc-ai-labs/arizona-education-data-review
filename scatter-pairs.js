(function attachScatterPairs(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosScatterPairs = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function buildScatterPairs() {
  const SORT_KEYS = new Set(["rank", "rho", "r2", "fdrp", "n"]);
  const SORT_DIRECTIONS = new Set(["asc", "desc"]);

  function toFiniteNumber(value, fallback) {
    if (value == null || value === "") return fallback;
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function pairKey(row) {
    if (!row) return ":::";
    return `${String(row.predictor ?? "")}:::${String(row.outcome ?? "")}`;
  }

  function comparePairsForScatter(a, b) {
    const rankA = toFiniteNumber(a?.defaultVisibilityRank, Number.MAX_SAFE_INTEGER);
    const rankB = toFiniteNumber(b?.defaultVisibilityRank, Number.MAX_SAFE_INTEGER);
    if (rankA !== rankB) return rankA - rankB;

    const absRhoA = Math.abs(toFiniteNumber(a?.spearmanR, 0));
    const absRhoB = Math.abs(toFiniteNumber(b?.spearmanR, 0));
    if (absRhoA !== absRhoB) return absRhoB - absRhoA;

    const r2A = toFiniteNumber(a?.rSquared, 0);
    const r2B = toFiniteNumber(b?.rSquared, 0);
    if (r2A !== r2B) return r2B - r2A;

    const predictorA = String(a?.predictor ?? "");
    const predictorB = String(b?.predictor ?? "");
    const byPredictor = predictorA.localeCompare(predictorB);
    if (byPredictor !== 0) return byPredictor;

    const outcomeA = String(a?.outcome ?? "");
    const outcomeB = String(b?.outcome ?? "");
    return outcomeA.localeCompare(outcomeB);
  }

  function normalizeSortState(sortKey, dir) {
    const normalizedKey = SORT_KEYS.has(sortKey) ? sortKey : "rank";
    const normalizedDir = SORT_DIRECTIONS.has(dir) ? dir : "asc";
    return { sortKey: normalizedKey, dir: normalizedDir };
  }

  function compareNullableNumbers(a, b, dir, nullLast) {
    const aNull = a == null;
    const bNull = b == null;
    if (aNull || bNull) {
      if (aNull && bNull) return 0;
      if (nullLast) return aNull ? 1 : -1;
      return aNull ? -1 : 1;
    }
    if (a === b) return 0;
    return dir === "asc" ? a - b : b - a;
  }

  function metricRank(row) {
    const raw = toFiniteNumber(row?.defaultVisibilityRank, null);
    return raw == null ? null : raw;
  }

  function metricRhoAbs(row) {
    return Math.abs(toFiniteNumber(row?.spearmanR, 0));
  }

  function metricR2(row) {
    return toFiniteNumber(row?.rSquared, 0);
  }

  function metricFdrP(row) {
    return toFiniteNumber(row?.spearmanPCorrected, null);
  }

  function metricN(row) {
    return toFiniteNumber(row?.nObs, null);
  }

  function compareBySortKey(a, b, sortKey, dir) {
    if (sortKey === "rank") {
      return compareNullableNumbers(metricRank(a), metricRank(b), dir, true);
    }
    if (sortKey === "rho") {
      return compareNullableNumbers(metricRhoAbs(a), metricRhoAbs(b), dir, false);
    }
    if (sortKey === "r2") {
      return compareNullableNumbers(metricR2(a), metricR2(b), dir, false);
    }
    if (sortKey === "fdrp") {
      return compareNullableNumbers(metricFdrP(a), metricFdrP(b), dir, true);
    }
    if (sortKey === "n") {
      return compareNullableNumbers(metricN(a), metricN(b), dir, true);
    }
    return 0;
  }

  function compareWithTieBreak(a, b, sortKey, dir) {
    const primary = compareBySortKey(a, b, sortKey, dir);
    if (primary !== 0) return primary;
    return comparePairsForScatter(a, b);
  }

  function sortPairsBy(rows, sortKey, dir) {
    const { sortKey: normalizedKey, dir: normalizedDir } = normalizeSortState(sortKey, dir);
    return [...(Array.isArray(rows) ? rows : [])].sort((a, b) => compareWithTieBreak(a, b, normalizedKey, normalizedDir));
  }

  function sortPairsForScatter(rows) {
    return sortPairsBy(rows, "rank", "asc");
  }

  function buildDisabledReason(row, availableAxisFields) {
    const missing = [];
    if (!availableAxisFields.has(row?.predictor)) missing.push(`X unavailable: ${row?.predictor || "unknown"}`);
    if (!availableAxisFields.has(row?.outcome)) missing.push(`Y unavailable: ${row?.outcome || "unknown"}`);
    return missing.length ? `Cannot select this pair in Scatter (${missing.join(", ")}).` : null;
  }

  function annotatePairSelectability(rows, availableAxisFields) {
    const safeSet = availableAxisFields instanceof Set ? availableAxisFields : new Set();
    return (Array.isArray(rows) ? rows : []).map(row => {
      const disabledReason = buildDisabledReason(row, safeSet);
      return {
        ...row,
        selectable: disabledReason == null,
        disabledReason
      };
    });
  }

  function isSelectedPair(row, activeX, activeY) {
    return String(row?.predictor ?? "") === String(activeX ?? "")
      && String(row?.outcome ?? "") === String(activeY ?? "");
  }

  function filterPairs(rows, filters) {
    const anyField = String(filters?.anyField ?? "");
    const predictorField = String(filters?.predictorField ?? "");
    const outcomeField = String(filters?.outcomeField ?? "");
    return (Array.isArray(rows) ? rows : []).filter(row => {
      const predictor = String(row?.predictor ?? "");
      const outcome = String(row?.outcome ?? "");
      if (anyField && predictor !== anyField && outcome !== anyField) return false;
      if (predictorField && predictor !== predictorField) return false;
      if (outcomeField && outcome !== outcomeField) return false;
      return true;
    });
  }

  function paginateRows(rows, page, pageSize) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const size = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
    const totalRows = safeRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / size));
    const rawPage = Number.isFinite(Number(page)) ? Math.floor(Number(page)) : 1;
    const clampedPage = Math.min(Math.max(rawPage, 1), totalPages);
    const startIndex = (clampedPage - 1) * size;
    const endIndex = Math.min(startIndex + size, totalRows);
    return {
      rows: safeRows.slice(startIndex, endIndex),
      page: clampedPage,
      pageSize: size,
      totalRows,
      totalPages,
      startIndex,
      endIndex
    };
  }

  function findPageForPair(rows, pageSize, targetPairKey) {
    const safeRows = Array.isArray(rows) ? rows : [];
    const target = String(targetPairKey ?? "");
    if (!target) return null;
    const index = safeRows.findIndex(row => pairKey(row) === target);
    if (index < 0) return null;
    const size = Number.isFinite(Number(pageSize)) && Number(pageSize) > 0 ? Math.floor(Number(pageSize)) : 25;
    return Math.floor(index / size) + 1;
  }

  function buildFieldOptionRows(axisRows) {
    const deduped = new Map();
    (Array.isArray(axisRows) ? axisRows : []).forEach(row => {
      const key = String(row?.field_name ?? "").trim();
      if (!key || deduped.has(key)) return;
      const label = String(row?.label ?? key).trim() || key;
      deduped.set(key, {
        value: key,
        label,
        text: `${label} (${key})`,
        available: row?.available !== false
      });
    });
    return Array.from(deduped.values()).sort((a, b) => {
      const byLabel = a.label.localeCompare(b.label);
      if (byLabel !== 0) return byLabel;
      return a.value.localeCompare(b.value);
    });
  }

  return {
    pairKey,
    sortPairsForScatter,
    sortPairsBy,
    normalizeSortState,
    filterPairs,
    paginateRows,
    findPageForPair,
    buildFieldOptionRows,
    annotatePairSelectability,
    isSelectedPair
  };
});
