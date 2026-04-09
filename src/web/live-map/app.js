const token = new URLSearchParams(window.location.search).get("token") || "";
const tg = window.Telegram?.WebApp || null;

const elements = {
  tripTitle: document.getElementById("trip-title"),
  tripMeta: document.getElementById("trip-meta"),
  routeText: document.getElementById("route-text"),
  routePointsText: document.getElementById("route-points-text"),
  meetingPointText: document.getElementById("meeting-point-text"),
  meetingTimeText: document.getElementById("meeting-time-text"),
  featuresList: document.getElementById("features-list"),
  membersList: document.getElementById("members-list"),
  mapStatus: document.getElementById("map-status"),
  shareLocationButton: document.getElementById("share-location-button"),
  refreshButton: document.getElementById("refresh-button")
};

let map = null;
let mapReady = false;
let latestData = null;
let routeSourceAdded = false;
let pollingHandle = null;
let geoWatchId = null;
let lastLocationSentAt = 0;
const markers = [];

function setStatus(text) {
  elements.mapStatus.textContent = text;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function featureEmoji(type = "") {
  return ({
    water: "💧",
    camp: "⛺",
    shelter: "🏚",
    warning: "⚠️",
    exit: "↘️"
  })[type] || "📍";
}

function markerClass(type = "") {
  return ({
    viewer: "viewer",
    meeting: "meeting",
    water: "water",
    camp: "camp",
    shelter: "shelter",
    warning: "warning",
    exit: "exit",
    start: "route-start",
    finish: "route-finish"
  })[type] || "member";
}

function createMarker(type, lngLat, popupHtml) {
  const element = document.createElement("div");
  element.className = `marker ${markerClass(type)}`;
  const marker = new maplibregl.Marker({ element }).setLngLat(lngLat);
  if (popupHtml) {
    marker.setPopup(new maplibregl.Popup({ offset: 14 }).setHTML(popupHtml));
  }
  marker.addTo(map);
  markers.push(marker);
}

function clearMarkers() {
  while (markers.length) {
    markers.pop()?.remove();
  }
}

function buildMap() {
  map = new maplibregl.Map({
    container: "map",
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "© OpenStreetMap contributors"
        }
      },
      layers: [
        {
          id: "osm",
          type: "raster",
          source: "osm"
        }
      ]
    },
    center: [24.55, 48.45],
    zoom: 8
  });

  map.addControl(new maplibregl.NavigationControl(), "top-right");
  map.on("load", () => {
    mapReady = true;
    if (latestData) {
      renderMapData(latestData);
    }
  });
}

function ensureRouteLayer(data) {
  const coordinates = data?.route?.coordinates || [];
  if (!mapReady || !coordinates.length) {
    return;
  }

  const geojson = {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates
    }
  };

  if (!routeSourceAdded) {
    map.addSource("route-line", {
      type: "geojson",
      data: geojson
    });
    map.addLayer({
      id: "route-line",
      type: "line",
      source: "route-line",
      layout: {
        "line-cap": "round",
        "line-join": "round"
      },
      paint: {
        "line-color": "#d9480f",
        "line-width": 5
      }
    });
    routeSourceAdded = true;
  } else {
    map.getSource("route-line").setData(geojson);
  }
}

function updateLists(data) {
  elements.tripTitle.textContent = data.trip.name || "Жива карта";
  elements.tripMeta.textContent = `${data.trip.membersCount} учасників • ${data.trip.region || "регіон ще не задано"}`;
  elements.routeText.textContent = data.trip.routeName || "Маршрут ще не задано.";
  elements.routePointsText.textContent = data.trip.routePoints?.length
    ? data.trip.routePoints.join(" • ")
    : "";
  elements.meetingPointText.textContent = data.trip.meetingPointLabel || "Точка збору не задана.";
  elements.meetingTimeText.textContent = data.trip.meetingDateTime
    ? `Дата та Час збору: ${data.trip.meetingDateTime}`
    : "";

  elements.membersList.innerHTML = data.members.map((member) => {
    const location = member.liveLocation?.isRecent
      ? `На карті • ${new Date(member.liveLocation.updatedAt).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" })}`
      : "Локація ще не передавалася";
    return `
      <li class="member-item">
        <strong>${escapeHtml(member.name)}${member.isViewer ? " (ти)" : ""}</strong>
        <span>${escapeHtml(member.role || "учасник")} • ${escapeHtml(location)}</span>
      </li>
    `;
  }).join("");

  const features = data.route?.features || [];
  elements.featuresList.innerHTML = features.length
    ? features.map((feature) => `
      <li class="feature-item">
        <strong>${featureEmoji(feature.type)} ${escapeHtml(feature.label)}</strong>
        <span class="feature-note">${escapeHtml(feature.note || "точка на маршруті")}</span>
      </li>
    `).join("")
    : `<li class="feature-item"><strong>Поки що немає даних</strong><span class="feature-note">Коли в маршруті є вода, табір або укриття, вони з'являться тут і на карті.</span></li>`;
}

function fitMap(data) {
  if (!mapReady) {
    return;
  }

  const bounds = new maplibregl.LngLatBounds();
  let hasPoints = false;

  for (const coordinate of data.route?.coordinates || []) {
    if (Array.isArray(coordinate) && coordinate.length === 2) {
      bounds.extend(coordinate);
      hasPoints = true;
    }
  }

  if (Number.isFinite(data.meetingPoint?.longitude) && Number.isFinite(data.meetingPoint?.latitude)) {
    bounds.extend([data.meetingPoint.longitude, data.meetingPoint.latitude]);
    hasPoints = true;
  }

  for (const member of data.members || []) {
    if (member.liveLocation?.isRecent) {
      bounds.extend([member.liveLocation.longitude, member.liveLocation.latitude]);
      hasPoints = true;
    }
  }

  for (const feature of data.route?.features || []) {
    if (Number.isFinite(feature.longitude) && Number.isFinite(feature.latitude)) {
      bounds.extend([feature.longitude, feature.latitude]);
      hasPoints = true;
    }
  }

  if (hasPoints) {
    map.fitBounds(bounds, { padding: 52, maxZoom: 14, duration: 600 });
  }
}

function renderMapData(data) {
  latestData = data;
  updateLists(data);
  if (!mapReady) {
    return;
  }

  ensureRouteLayer(data);
  clearMarkers();

  const routeCoordinates = data.route?.coordinates || [];
  if (routeCoordinates.length) {
    createMarker("start", routeCoordinates[0], "<b>Старт маршруту</b>");
    createMarker("finish", routeCoordinates[routeCoordinates.length - 1], "<b>Фініш маршруту</b>");
  }

  if (Number.isFinite(data.meetingPoint?.longitude) && Number.isFinite(data.meetingPoint?.latitude)) {
    createMarker(
      "meeting",
      [data.meetingPoint.longitude, data.meetingPoint.latitude],
      `<b>Точка збору</b><br>${escapeHtml(data.meetingPoint.label || "")}`
    );
  }

  for (const feature of data.route?.features || []) {
    if (!Number.isFinite(feature.longitude) || !Number.isFinite(feature.latitude)) {
      continue;
    }

    createMarker(
      feature.type,
      [feature.longitude, feature.latitude],
      `<b>${escapeHtml(feature.label)}</b><br>${escapeHtml(feature.note || "")}`
    );
  }

  for (const member of data.members || []) {
    if (!member.liveLocation?.isRecent) {
      continue;
    }

    createMarker(
      member.isViewer ? "viewer" : "member",
      [member.liveLocation.longitude, member.liveLocation.latitude],
      `<b>${escapeHtml(member.name)}${member.isViewer ? " (ти)" : ""}</b><br>${escapeHtml(member.role || "учасник")}`
    );
  }

  fitMap(data);
  setStatus("Карта оновлена.");
}

async function fetchBootstrap() {
  const response = await fetch(`/mini-app/api/live-map/bootstrap?token=${encodeURIComponent(token)}`);
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: "Не вдалося завантажити карту." }));
    throw new Error(error.error || "Не вдалося завантажити карту.");
  }

  const data = await response.json();
  renderMapData(data);
  return data;
}

async function sendLocation(position) {
  const now = Date.now();
  if (now - lastLocationSentAt < 10000) {
    return;
  }

  lastLocationSentAt = now;
  const payload = {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    heading: position.coords.heading,
    speed: position.coords.speed
  };

  await fetch(`/mini-app/api/live-map/location?token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

function enableLiveLocation() {
  if (!navigator.geolocation) {
    setStatus("На цьому пристрої геолокація недоступна.");
    return;
  }

  if (geoWatchId !== null) {
    setStatus("Live-локація вже увімкнена.");
    return;
  }

  elements.shareLocationButton.textContent = "📡 Live-локація увімкнена";
  geoWatchId = navigator.geolocation.watchPosition(
    async (position) => {
      try {
        await sendLocation(position);
        setStatus("Твою live-локацію оновлено.");
        await fetchBootstrap();
      } catch (error) {
        setStatus(error.message || "Не вдалося передати геолокацію.");
      }
    },
    (error) => {
      setStatus(`Не вдалося отримати геолокацію: ${error.message}`);
    },
    {
      enableHighAccuracy: true,
      maximumAge: 15000,
      timeout: 12000
    }
  );
}

async function init() {
  if (!token) {
    setStatus("Не вистачає токена доступу до карти.");
    return;
  }

  tg?.ready();
  tg?.expand();
  buildMap();

  elements.shareLocationButton.addEventListener("click", enableLiveLocation);
  elements.refreshButton.addEventListener("click", async () => {
    setStatus("Оновлюю дані...");
    await fetchBootstrap().catch((error) => setStatus(error.message));
  });

  try {
    await fetchBootstrap();
    pollingHandle = window.setInterval(() => {
      void fetchBootstrap().catch(() => {});
    }, 20000);
  } catch (error) {
    setStatus(error.message || "Не вдалося відкрити живу карту.");
  }
}

window.addEventListener("beforeunload", () => {
  if (pollingHandle) {
    window.clearInterval(pollingHandle);
  }
  if (geoWatchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(geoWatchId);
  }
});

void init();
