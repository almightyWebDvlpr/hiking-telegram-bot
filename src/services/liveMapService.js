import crypto from "node:crypto";

function toBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signPayload(payload, secret) {
  return crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("base64url");
}

function formatMeetingDateTime(tripCard = {}) {
  if (!tripCard?.meetingDate && !tripCard?.meetingTime) {
    return "";
  }

  if (tripCard?.meetingDate && tripCard?.meetingTime) {
    return `${tripCard.meetingDate} ${tripCard.meetingTime}`;
  }

  return tripCard?.meetingDate || tripCard?.meetingTime || "";
}

function normalizeFeature(feature = {}) {
  const latitude = Number(feature.lat ?? feature.latitude ?? feature.raw?.latitude);
  const longitude = Number(feature.lon ?? feature.longitude ?? feature.raw?.longitude);
  return {
    id: feature.id || `${feature.type || "poi"}:${feature.label || "item"}:${latitude}:${longitude}`,
    type: feature.type || "other",
    label: feature.label || "точка",
    note: feature.note || "",
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null
  };
}

function isRecentLocation(updatedAt) {
  const parsed = Date.parse(updatedAt || "");
  if (!Number.isFinite(parsed)) {
    return false;
  }

  return Date.now() - parsed <= 1000 * 60 * 60 * 12;
}

export class LiveMapService {
  constructor({ groupService, routeService, baseUrl, secret }) {
    this.groupService = groupService;
    this.routeService = routeService;
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.secret = secret || "hiking-telegram-bot-mini-app";
  }

  isConfigured() {
    return Boolean(this.baseUrl);
  }

  buildMiniAppUrl({ tripId, memberId }) {
    if (!this.isConfigured()) {
      return "";
    }

    const token = this.issueAccessToken({ tripId, memberId });
    return `${this.baseUrl}/mini-app/live-map?token=${encodeURIComponent(token)}`;
  }

  issueAccessToken({ tripId, memberId, ttlHours = 24 }) {
    const payload = JSON.stringify({
      tripId,
      memberId,
      exp: Date.now() + ttlHours * 60 * 60 * 1000
    });
    const encodedPayload = toBase64Url(payload);
    const signature = signPayload(encodedPayload, this.secret);
    return `${encodedPayload}.${signature}`;
  }

  verifyAccessToken(token = "") {
    const [encodedPayload, signature] = String(token || "").split(".");
    if (!encodedPayload || !signature) {
      throw new Error("Некоректний токен доступу.");
    }

    const expectedSignature = signPayload(encodedPayload, this.secret);
    if (signature !== expectedSignature) {
      throw new Error("Підпис токена не збігається.");
    }

    const payload = JSON.parse(fromBase64Url(encodedPayload));
    if (!payload?.tripId || !payload?.memberId) {
      throw new Error("У токені бракує даних.");
    }

    if (!Number.isFinite(Number(payload.exp)) || Number(payload.exp) < Date.now()) {
      throw new Error("Термін дії токена вже минув.");
    }

    return payload;
  }

  async resolveMeetingPointMarker(trip) {
    const tripCard = trip?.tripCard || {};
    const label = String(tripCard.meetingPoint || "").trim();
    if (!label) {
      return null;
    }

    const existingLat = Number(tripCard.meetingPointLatitude);
    const existingLon = Number(tripCard.meetingPointLongitude);
    if (Number.isFinite(existingLat) && Number.isFinite(existingLon)) {
      return {
        label,
        latitude: existingLat,
        longitude: existingLon
      };
    }

    try {
      const place = await this.routeService.geocode(label);
      if (!place) {
        return { label, latitude: null, longitude: null };
      }

      return {
        label,
        latitude: Number(place.lat),
        longitude: Number(place.lon)
      };
    } catch {
      return { label, latitude: null, longitude: null };
    }
  }

  async getBootstrapData(token) {
    const payload = this.verifyAccessToken(token);
    const trip = this.groupService.getGroup(payload.tripId);
    if (!trip || trip.status !== "active") {
      throw new Error("Активний похід не знайдено.");
    }

    const viewer = trip.members.find((member) => member.id === payload.memberId);
    if (!viewer) {
      throw new Error("Учасника не знайдено в цьому поході.");
    }

    const coordinates = Array.isArray(trip.routePlan?.meta?.geometry?.coordinates)
      ? trip.routePlan.meta.geometry.coordinates
      : [];
    const routeFeatures = Array.isArray(trip.routePlan?.meta?.routeFeatures)
      ? trip.routePlan.meta.routeFeatures.map((feature) => normalizeFeature(feature)).filter((feature) => Number.isFinite(feature.latitude) && Number.isFinite(feature.longitude))
      : [];
    const meetingPoint = await this.resolveMeetingPointMarker(trip);

    return {
      trip: {
        id: trip.id,
        name: trip.name,
        region: trip.region || "",
        routeStatus: trip.routePlan?.status || "",
        routeName: trip.routePlan?.sourceTitle || [trip.routePlan?.from, trip.routePlan?.to].filter(Boolean).join(" → ") || "",
        routePoints: Array.isArray(trip.routePlan?.points) ? trip.routePlan.points : [],
        meetingPointLabel: trip.tripCard?.meetingPoint || "",
        meetingDateTime: formatMeetingDateTime(trip.tripCard),
        membersCount: trip.members.length
      },
      viewer: {
        id: viewer.id,
        name: viewer.name,
        role: viewer.role || "member"
      },
      route: {
        coordinates,
        features: routeFeatures
      },
      meetingPoint,
      members: trip.members.map((member) => ({
        id: member.id,
        name: member.name,
        role: member.role || "member",
        isViewer: member.id === payload.memberId,
        liveLocation: member.liveLocation
          ? {
              ...member.liveLocation,
              isRecent: isRecentLocation(member.liveLocation.updatedAt)
            }
          : null
      })),
      serverTime: new Date().toISOString()
    };
  }

  updateLocation(token, location) {
    const payload = this.verifyAccessToken(token);
    const result = this.groupService.updateMemberLiveLocation({
      groupId: payload.tripId,
      memberId: payload.memberId,
      location
    });

    if (!result.ok) {
      throw new Error(result.message || "Не вдалося зберегти геолокацію.");
    }

    return {
      ok: true,
      updatedAt: result.member.liveLocation?.updatedAt || new Date().toISOString()
    };
  }
}
