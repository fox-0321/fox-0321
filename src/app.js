import { appConfig } from "./config.js";
import { provinces } from "./province-data.js";

const state = {
  activePhotos: new Set(),
  geoFeatures: new Map(),
  projection: null,
  pendingProvince: null,
  selectedProvince: null
};

const svgNamespace = "http://www.w3.org/2000/svg";
const mapFrame = { width: 980, height: 760, padding: 42 };
const apiBaseUrl = normalizeBaseUrl(appConfig.apiBaseUrl);

const provinceMetaById = new Map(provinces.map((province) => [province.id, province]));
const provinceMetaBySlug = new Map(provinces.map((province) => [province.slug, province]));

const mapView = document.querySelector("#map-view");
const viewer = document.querySelector("#viewer");
const mapSvg = document.querySelector("#china-map");
const viewerTitle = document.querySelector("#viewer-title");
const viewerSubtitle = document.querySelector("#viewer-subtitle");
const viewerImage = document.querySelector("#viewer-image");
const backButton = document.querySelector("#back-button");
const authDialog = document.querySelector("#auth-dialog");
const authTitle = document.querySelector("#auth-title");
const authCopy = document.querySelector("#auth-copy");
const authForm = document.querySelector("#auth-form");
const authInput = document.querySelector("#auth-input");
const authError = document.querySelector("#auth-error");
const authCancel = document.querySelector("#auth-cancel");
const authSubmit = document.querySelector("#auth-submit");

applyConfigText();
wireEvents();
init();

async function init() {
  try {
    const [geoData, activeSlugs] = await Promise.all([loadGeoData(), discoverPhotos()]);
    prepareMapData(geoData);
    renderMap();
    state.activePhotos = new Set(activeSlugs);
    updateProvinceStates();
  } catch (error) {
    console.error("Unable to initialize the map", error);
    mapSvg.replaceChildren();
    const fallback = createSvg("text", {
      x: "60",
      y: "120",
      class: "map-empty"
    });
    fallback.textContent = "Map data failed to load.";
    mapSvg.append(fallback);
  }
}

function applyConfigText() {
  document.title = appConfig.siteTitle;
  setText("#site-title", appConfig.siteTitle);
  setText("#map-label", appConfig.texts.mapLabel);
  setText("#map-title", appConfig.texts.mapTitle);
  setText("#legend-active", appConfig.texts.legendActive);
  setText("#legend-inactive", appConfig.texts.legendInactive);
  setText("#viewer-label", appConfig.texts.viewerLabel);
  setText("#viewer-subtitle", appConfig.texts.viewerSubtitle);
  setText("#back-button", appConfig.texts.backButton);
  setText("#auth-title", appConfig.texts.authTitle);
  setText("#auth-copy", appConfig.texts.authCopy);
  setText("#auth-submit", appConfig.texts.authSubmit);
  setText("#auth-cancel", appConfig.texts.authCancel);
  authInput.placeholder = appConfig.texts.authPlaceholder;
}

function setText(selector, value) {
  const element = document.querySelector(selector);
  if (element) {
    element.textContent = value;
  }
}

function wireEvents() {
  backButton.addEventListener("click", () => {
    state.selectedProvince = null;
    viewer.hidden = true;
    mapView.hidden = false;
    viewerImage.removeAttribute("src");
  });

  authCancel.addEventListener("click", closeAuthDialog);

  authForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!state.pendingProvince) {
      closeAuthDialog();
      return;
    }

    const passcode = authInput.value.trim();

    if (!passcode) {
      showAuthError(appConfig.texts.authEmptyError);
      authInput.focus();
      return;
    }

    setAuthBusy(true);

    try {
      const access = await requestPhotoAccess(state.pendingProvince.slug, passcode);
      const province = state.pendingProvince;
      closeAuthDialog();
      openProvince(province, access.imageUrl);
    } catch (error) {
      showAuthError(error.message || appConfig.texts.authGenericError);
      authInput.select();
    } finally {
      setAuthBusy(false);
    }
  });
}

async function loadGeoData() {
  const response = await fetch("./src/china-provinces.geojson", { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Map request failed with ${response.status}`);
  }
  return response.json();
}

async function discoverPhotos() {
  const response = await fetch(apiUrl("/api/photos/available"), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("Unable to load available photos.");
  }

  const data = await response.json();
  return Array.isArray(data.slugs) ? data.slugs : [];
}

function prepareMapData(geoData) {
  const features = geoData.features.filter((feature) => provinceMetaById.has(feature.properties.id));
  state.projection = createProjection(features);
  state.geoFeatures = new Map(
    features.map((feature) => {
      const meta = provinceMetaById.get(feature.properties.id);
      return [meta.slug, { feature, path: buildPath(feature.geometry, state.projection.project) }];
    })
  );
}

function renderMap() {
  mapSvg.replaceChildren();
  mapSvg.setAttribute("viewBox", `0 0 ${mapFrame.width} ${mapFrame.height}`);
  mapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  mapSvg.append(createMapDefs());
  mapSvg.append(
    createSvg("rect", {
      x: "14",
      y: "14",
      width: String(mapFrame.width - 28),
      height: String(mapFrame.height - 28),
      rx: "36",
      class: "map-paper"
    })
  );
  mapSvg.append(
    createSvg("rect", {
      x: "14",
      y: "14",
      width: String(mapFrame.width - 28),
      height: String(mapFrame.height - 28),
      rx: "36",
      class: "map-paper-grain",
      "aria-hidden": "true"
    })
  );

  const provincesLayer = createSvg("g", { class: "province-layer" });
  provinces.forEach((province) => {
    const geo = state.geoFeatures.get(province.slug);
    if (!geo) {
      return;
    }
    provincesLayer.append(buildProvinceGroup(province, geo));
  });

  mapSvg.append(provincesLayer);
}

function createMapDefs() {
  const defs = createSvg("defs", {});

  const paperPattern = createSvg("pattern", {
    id: "paper-grain",
    width: "36",
    height: "36",
    patternUnits: "userSpaceOnUse"
  });
  paperPattern.append(
    createSvg("path", {
      d: "M1 7 Q6 2 11 7 M15 16 q5 -5 10 0 M6 28 q4 -4 8 0 M22 31 q5 -4 10 0",
      class: "grain-stroke"
    })
  );

  const wobble = createSvg("filter", {
    id: "wobble",
    x: "-5%",
    y: "-5%",
    width: "110%",
    height: "110%"
  });
  wobble.append(
    createSvg("feTurbulence", {
      type: "fractalNoise",
      baseFrequency: "0.018",
      numOctaves: "1",
      seed: "7",
      result: "noise"
    })
  );
  wobble.append(
    createSvg("feDisplacementMap", {
      in: "SourceGraphic",
      in2: "noise",
      scale: "1.1",
      xChannelSelector: "R",
      yChannelSelector: "G"
    })
  );

  defs.append(paperPattern, wobble);
  return defs;
}

function buildProvinceGroup(province, geo) {
  const group = createSvg("g", {
    class: "province is-inactive",
    "data-slug": province.slug,
    tabindex: "-1",
    role: "img",
    "aria-disabled": "true",
    "aria-label": `${province.en} / ${province.zh}`
  });

  const shadow = createSvg("path", {
    d: geo.path,
    class: "province-shadow",
    "aria-hidden": "true"
  });

  const shape = createSvg("path", {
    d: geo.path,
    class: "province-shape"
  });

  const title = createSvg("title", {});
  title.textContent = `${province.en} / ${province.zh}`;

  group.append(shadow, shape, title);

  group.addEventListener("click", () => {
    if (state.activePhotos.has(province.slug)) {
      beginProvinceAccess(province);
    }
  });

  group.addEventListener("keydown", (event) => {
    if ((event.key === "Enter" || event.key === " ") && state.activePhotos.has(province.slug)) {
      event.preventDefault();
      beginProvinceAccess(province);
    }
  });

  return group;
}

function beginProvinceAccess(province) {
  state.pendingProvince = province;
  authForm.reset();
  authError.hidden = true;
  authTitle.textContent = `${appConfig.texts.authTitle} · ${province.zh}`;
  authCopy.textContent = appConfig.texts.authCopy;
  authDialog.hidden = false;
  authInput.focus();
}

function closeAuthDialog() {
  state.pendingProvince = null;
  authDialog.hidden = true;
  authForm.reset();
  authError.hidden = true;
  setAuthBusy(false);
}

function showAuthError(message) {
  authError.hidden = false;
  authError.textContent = message;
}

function setAuthBusy(isBusy) {
  authInput.disabled = isBusy;
  authSubmit.disabled = isBusy;
  authCancel.disabled = isBusy;
}

async function requestPhotoAccess(slug, passcode) {
  const response = await fetch(apiUrl("/api/photo-access"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ slug, passcode })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || appConfig.texts.authGenericError);
  }

  return {
    ...payload,
    imageUrl: absolutizeImageUrl(payload.imageUrl)
  };
}

function normalizeBaseUrl(value) {
  return value ? value.replace(/\/$/, "") : "";
}

function apiUrl(path) {
  return `${apiBaseUrl}${path}`;
}

function absolutizeImageUrl(imageUrl) {
  if (!imageUrl) {
    return imageUrl;
  }

  if (/^https?:\/\//i.test(imageUrl)) {
    return imageUrl;
  }

  return apiUrl(imageUrl);
}

function createProjection(features) {
  const points = [];
  features.forEach((feature) => collectGeometryPoints(feature.geometry, points));

  const lons = points.map(([lon]) => lon);
  const lats = points.map(([, lat]) => lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const width = maxLon - minLon;
  const height = maxLat - minLat;
  const scale = Math.min(
    (mapFrame.width - mapFrame.padding * 2) / width,
    (mapFrame.height - mapFrame.padding * 2) / height
  );
  const offsetX = (mapFrame.width - width * scale) / 2;
  const offsetY = (mapFrame.height - height * scale) / 2;

  return {
    project([lon, lat]) {
      return [offsetX + (lon - minLon) * scale, offsetY + (maxLat - lat) * scale];
    }
  };
}

function collectGeometryPoints(geometry, sink) {
  if (geometry.type === "Polygon") {
    geometry.coordinates.flat().forEach((point) => sink.push(point));
    return;
  }

  geometry.coordinates.flat(2).forEach((point) => sink.push(point));
}

function buildPath(geometry, project) {
  if (geometry.type === "Polygon") {
    return polygonToPath(geometry.coordinates, project);
  }

  return geometry.coordinates.map((polygon) => polygonToPath(polygon, project)).join(" ");
}

function polygonToPath(rings, project) {
  return rings
    .map((ring) => {
      const [first, ...rest] = ring;
      const [startX, startY] = project(first);
      const segments = rest.map((point) => {
        const [x, y] = project(point);
        return `L ${x.toFixed(2)} ${y.toFixed(2)}`;
      });
      return `M ${startX.toFixed(2)} ${startY.toFixed(2)} ${segments.join(" ")} Z`;
    })
    .join(" ");
}

function createSvg(tag, attrs) {
  const node = document.createElementNS(svgNamespace, tag);
  Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
  return node;
}

function updateProvinceStates() {
  document.querySelectorAll(".province").forEach((node) => {
    const slug = node.dataset.slug;
    const province = provinceMetaBySlug.get(slug);
    const isActive = state.activePhotos.has(slug);

    node.classList.toggle("is-active", isActive);
    node.classList.toggle("is-inactive", !isActive);
    node.setAttribute("tabindex", isActive ? "0" : "-1");
    node.setAttribute("role", isActive ? "button" : "img");
    node.setAttribute("aria-disabled", String(!isActive));
    node.style.pointerEvents = isActive ? "auto" : "none";

    if (province) {
      node.setAttribute(
        "aria-label",
        isActive ? `${province.en} / ${province.zh} (${appConfig.texts.activeProvinceHint})` : `${province.en} / ${province.zh}`
      );
    }
  });
}

function openProvince(province, imageUrl) {
  state.selectedProvince = province.slug;
  viewerTitle.textContent = `${province.en} / ${province.zh}`;
  viewerSubtitle.textContent = `${appConfig.texts.viewerSubtitle} · ${province.zh}`;
  viewerImage.src = imageUrl;
  viewerImage.alt = `${province.en} memory photo`;
  mapView.hidden = true;
  viewer.hidden = false;
}
