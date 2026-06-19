(function attachHeliosApi(root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  if (!root) return;
  root.HeliosApi = Object.freeze(api);
})(typeof window !== "undefined" ? window : null, function buildHeliosApi(root) {
  // STATIC (GitHub Pages) build of the Phase 3 review pages.
  // The same HeliosApi.fetchJson(path) interface the pages already use is served
  // entirely from pre-generated JSON under ./data/ -- no API server, no database.
  const DATA_BASE = "./data";

  function slug(value) {
    const s = String(value == null ? "" : value)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return s || "all-counties";
  }

  async function loadStatic(relPath) {
    const response = await fetch(`${DATA_BASE}/${relPath}`);
    if (!response.ok) {
      if (response.status === 404) return null;
      throw new Error(`Request failed (${response.status})`);
    }
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  // Cache the school index used by the Assessment Overview multi-school picker.
  let schoolIndexPromise = null;
  function loadSchoolIndex() {
    if (!schoolIndexPromise) {
      schoolIndexPromise = loadStatic("assessment-predictions/school-index.json").then(x => x || {});
    }
    return schoolIndexPromise;
  }

  function parsePath(path) {
    const qIdx = path.indexOf("?");
    const base = qIdx >= 0 ? path.slice(0, qIdx) : path;
    const params = new URLSearchParams(qIdx >= 0 ? path.slice(qIdx + 1) : "");
    return { base, params };
  }

  // Rebuild a /correlation-outliers/school response client-side from the statewide
  // pair-detail file. The page always calls /school with predictor + outcome, and every
  // field the school card renders is present on the pair-detail point (residual is
  // derived: outcomeValue - fittedValue). Drill-downs are crawled statewide only, so the
  // county on the /school URL (which it does not carry) is irrelevant here.
  function summaryTextFor(direction) {
    if (direction === "positive") return "This school is above the expected trend for the selected pair.";
    if (direction === "negative") return "This school is below the expected trend for the selected pair.";
    return "This school is near the expected trend for the selected pair.";
  }

  async function reconstructSchoolDetail(params) {
    const code = Number(params.get("schoolCode"));
    const predictor = params.get("predictor");
    const outcome = params.get("outcome");
    const file = `correlation-outliers/pair-detail/${slug(predictor)}__${slug(outcome)}__all.json`;
    const detail = await loadStatic(file);
    const pool = detail ? [...(detail.points || []), ...(detail.outliers || [])] : [];
    const match = pool.find(p => Number(p.schoolCode) === code);
    if (!match) {
      return { rows: [], metadata: { summaryText: "Detail for this school is not available in the static review build." } };
    }
    const residual =
      match.residual != null
        ? match.residual
        : typeof match.outcomeValue === "number" && typeof match.fittedValue === "number"
          ? match.outcomeValue - match.fittedValue
          : null;
    const row = {
      schoolCode: match.schoolCode,
      schoolName: match.schoolName,
      county: match.county,
      districtName: match.districtName,
      titleOneYesNo: match.titleOneYesNo,
      predictorValue: match.predictorValue,
      outcomeValue: match.outcomeValue,
      fittedValue: match.fittedValue,
      residual,
      stdResid: match.stdResid,
      cooksD: match.cooksD,
      direction: match.direction,
      isIfAnomaly: match.isIfAnomaly,
      ifAnomalyScore: match.ifAnomalyScore
    };
    return {
      schoolCode: match.schoolCode,
      schoolName: match.schoolName,
      county: match.county,
      districtName: match.districtName,
      titleOneYesNo: match.titleOneYesNo,
      isIfAnomaly: match.isIfAnomaly,
      ifAnomalyScore: match.ifAnomalyScore,
      rows: [row],
      metadata: { summaryText: summaryTextFor(match.direction) }
    };
  }

  async function fetchJson(path) {
    const { base, params } = parsePath(path);

    if (base === "/assessment-predictions/options") {
      const data = await loadStatic("assessment-predictions/options.json");
      if (!data) throw new Error("Options data not available");
      return data;
    }

    if (base === "/assessment-predictions/overview-options") {
      const data = await loadStatic("assessment-predictions/overview-options.json");
      if (!data) throw new Error("Overview options not available");
      return data;
    }

    if (base === "/assessment-predictions/school") {
      const code = params.get("schoolCode");
      const subjectSlug = slug(params.get("subject"));
      const bySubject = await loadStatic(`assessment-predictions/school/${code}.json`);
      const detail = bySubject ? bySubject[subjectSlug] : null;
      if (detail) return detail;
      return {
        schoolCode: Number(code),
        subject: params.get("subject"),
        available: false,
        unavailableReason: "No forecast available for this selection.",
        trendPoints: [],
        qualityFlags: []
      };
    }

    if (base === "/assessment-predictions/advanced") {
      const code = params.get("schoolCode");
      const subjectSlug = slug(params.get("subject"));
      const bySubject = await loadStatic(`assessment-predictions/advanced/${code}.json`);
      const advanced = bySubject ? bySubject[subjectSlug] : null;
      if (advanced) return advanced;
      return {
        schoolCode: Number(code),
        subject: params.get("subject"),
        expectedValueAvailable: false,
        expectedValue: null,
        equityGaps: [],
        equityGapCount: 0,
        modelMetrics: null,
        available: false,
        unavailableReason: "No advanced analysis available for this selection."
      };
    }

    if (base === "/assessment-predictions/overview") {
      const county = params.get("county") || "";
      const subjectSlug = slug(params.get("subject"));
      const name = `${county ? slug(county) : "all-counties"}-${subjectSlug}`;
      const data = await loadStatic(`assessment-predictions/overview/${name}.json`);
      if (!data) throw new Error("Overview data not available for this selection");

      // Multi-school picker: rebuild selectedSchools client-side from the index.
      const codes = (params.get("schoolCodes") || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
      if (codes.length) {
        const index = await loadSchoolIndex();
        const selected = [];
        codes.forEach(code => {
          const row = index[code] && index[code][subjectSlug];
          if (row) {
            const latest = row.latestPercentPassing;
            const f2030 = row.forecast2030;
            const movementPoints =
              typeof latest === "number" && typeof f2030 === "number" ? f2030 - latest : null;
            selected.push({ ...row, movementPoints, latestNumberTested: null });
          }
        });
        return { ...data, selectedSchools: selected };
      }
      return data;
    }

    // ---- Shared ---------------------------------------------------------
    if (base === "/filters") {
      const file = params.get("includeUnavailable") === "true" ? "filters-include-unavailable.json" : "filters.json";
      const data = await loadStatic(file);
      if (!data) throw new Error("Filters not available");
      return data;
    }
    if (base === "/definitions") {
      const data = await loadStatic("definitions.json");
      if (!data) throw new Error("Definitions not available");
      return data;
    }
    if (base === "/raw-data") {
      const data = await loadStatic("raw-data.json");
      if (!data) throw new Error("Raw data not available");
      return data;
    }

    // ---- Correlation Outliers / Executive Summary (per county x scope) ---
    if (base === "/correlation-outliers/pairs"
      || base === "/correlation-outliers/summary"
      || base === "/correlation-outliers/executive-summary") {
      const county = slug(params.get("county") || "all");
      const scope = params.get("scope") || "default";
      const dir = base === "/correlation-outliers/pairs" ? "pairs"
        : base === "/correlation-outliers/summary" ? "summary"
          : "exec-summary";
      const data = await loadStatic(`correlation-outliers/${dir}/${county}-${scope}.json`);
      if (!data) throw new Error("Selection not available in the static review build.");
      return data;
    }

    // ---- Scatter / Correlation drill-downs (statewide only) -------------
    if (base === "/correlation-outliers/pair-detail") {
      const data = await loadStatic(
        `correlation-outliers/pair-detail/${slug(params.get("predictor"))}__${slug(params.get("outcome"))}__all.json`
      );
      if (!data) throw new Error("This pair is not included in the static review build (exploratory pairs are statewide high-signal only).");
      return data;
    }
    if (base === "/scatter" || base === "/outliers") {
      const dir = base === "/scatter" ? "scatter" : "outliers";
      const data = await loadStatic(`${dir}/${slug(params.get("x"))}__${slug(params.get("y"))}__all.json`);
      if (!data) throw new Error("This X/Y selection is not included in the static review build (statewide high-signal pairs only).");
      return data;
    }
    if (base === "/correlation-outliers/school") {
      return reconstructSchoolDetail(params);
    }
    if (base === "/predictive-insights/school") {
      return {
        schoolCode: Number(params.get("schoolCode")),
        outcome: params.get("outcome"),
        available: false,
        topDrivers: [],
        metadata: { emptyReason: "Predictive insight (XGBoost/SHAP) is not included in this static review build." }
      };
    }

    // ---- Data Cleaning --------------------------------------------------
    if (base === "/data-cleaning/summary") {
      const data = await loadStatic("data-cleaning/summary.json");
      if (!data) throw new Error("Data cleaning summary not available");
      return data;
    }
    if (base === "/data-cleaning/pairs" || base === "/data-cleaning/field-matrix" || base === "/data-cleaning/exclusions") {
      const dir = base.slice("/data-cleaning/".length);
      const county = slug(params.get("county") || "all");
      const data = await loadStatic(`data-cleaning/${dir}/${county}.json`);
      if (!data) throw new Error("Data cleaning selection not available in the static review build.");
      return data;
    }

    // ---- Validation -----------------------------------------------------
    if (base === "/validation/coverage") {
      const status = params.get("status");
      const data = await loadStatic(`validation/coverage/${status ? status : "all"}.json`);
      if (!data) throw new Error("Validation coverage not available");
      return data;
    }
    if (base.startsWith("/validation/")) {
      const name = base.slice("/validation/".length); // summary, mismatches, matches, attempts, ...
      const data = await loadStatic(`validation/${name}.json`);
      if (!data) throw new Error(`Validation ${name} not available`);
      return data;
    }

    // ---- Summary Stats --------------------------------------------------
    if (base === "/summary-stats/filters") {
      const data = await loadStatic("summary-stats/filters.json");
      if (!data) throw new Error("Summary stats filters not available");
      return data;
    }
    if (base === "/summary-stats/profile") {
      const data = await loadStatic(`summary-stats/profile/${slug(params.get("county") || "all")}.json`);
      if (!data) throw new Error("Summary stats profile not available");
      return data;
    }
    if (base === "/summary-stats/field") {
      const county = slug(params.get("county") || "all");
      const fieldSlug = slug(params.get("field"));
      const data =
        (await loadStatic(`summary-stats/field/${fieldSlug}__${county}.json`)) ||
        (await loadStatic(`summary-stats/field/${fieldSlug}__all.json`));
      if (!data) throw new Error("Summary stats field detail not available");
      return data;
    }

    throw new Error(`No static data available for ${base}`);
  }

  return {
    API_BASE: DATA_BASE,
    apiBaseForLocation: () => DATA_BASE,
    fetchJson
  };
});
