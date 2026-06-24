"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// handlers/catchall.ts
var catchall_exports = {};
__export(catchall_exports, {
  default: () => catchall_default
});
module.exports = __toCommonJS(catchall_exports);

// server.ts
var import_dotenv = __toESM(require("dotenv"));
var import_express = __toESM(require("express"));
var import_path = require("path");

// src/lib/notion/client.ts
var import_client = require("@notionhq/client");
var _client = null;
function isNotionConfigured() {
  return !!(process.env.NOTION_API_KEY && process.env.NOTION_PASSENGERS_DB_ID);
}
function getNotionClient() {
  if (!process.env.NOTION_API_KEY) {
    throw new Error("NOTION_API_KEY \u5C1A\u672A\u8A2D\u5B9A\u3002\u8ACB\u5728 .env.local \u4E2D\u52A0\u5165 Notion API Key\u3002");
  }
  if (!_client) {
    _client = new import_client.Client({ auth: process.env.NOTION_API_KEY });
  }
  return _client;
}
function getDbId(name) {
  const map = {
    passengers: "NOTION_PASSENGERS_DB_ID",
    flights: "NOTION_FLIGHTS_DB_ID",
    destinations: "NOTION_DESTINATIONS_DB_ID"
  };
  const key = map[name];
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} \u5C1A\u672A\u8A2D\u5B9A\u3002\u8ACB\u5728 .env.local \u4E2D\u52A0\u5165 Database ID\u3002`);
  }
  return value;
}
function readTitle(props, key) {
  const p = props[key];
  return p?.title?.[0]?.plain_text ?? "";
}
function readText(props, key) {
  const p = props[key];
  return p?.rich_text?.[0]?.plain_text ?? "";
}
function readSelect(props, key) {
  const p = props[key];
  return p?.select?.name ?? null;
}
function readNumber(props, key) {
  const p = props[key];
  return p?.number ?? null;
}
function readDate(props, key) {
  const p = props[key];
  return p?.date?.start ?? null;
}
function readCheckbox(props, key) {
  const p = props[key];
  return p?.checkbox ?? false;
}
function wTitle(value) {
  return { title: [{ text: { content: value } }] };
}
function wText(value) {
  return { rich_text: value ? [{ text: { content: value } }] : [] };
}
function wSelect(value) {
  return value ? { select: { name: value } } : { select: null };
}
function wNumber(value) {
  return { number: value };
}
function wDate(value) {
  return value ? { date: { start: value } } : { date: null };
}

// src/lib/notion/passengers.ts
var DEFAULT_LOCATION = "Taipei, Taiwan";
var DEFAULT_LAT = 25.033;
var DEFAULT_LNG = 121.5654;
var mem = /* @__PURE__ */ new Map();
function parsePassenger(page) {
  const props = page.properties;
  return {
    notionId: page.id,
    passengerId: readTitle(props, "Passenger ID"),
    name: readText(props, "Name"),
    groupId: readSelect(props, "Group ID") ?? "",
    deviceId: readText(props, "Device ID"),
    currentLocation: readText(props, "Current Location") || DEFAULT_LOCATION,
    currentLatitude: readNumber(props, "Current Latitude") ?? DEFAULT_LAT,
    currentLongitude: readNumber(props, "Current Longitude") ?? DEFAULT_LNG,
    lastFlightId: readText(props, "Last Flight ID") || null,
    status: readSelect(props, "Status") ?? "not_started",
    createdAt: readDate(props, "Created At") ?? (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: readDate(props, "Updated At") ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
async function getOrCreatePassenger(passengerId, name, groupId, deviceId = "web") {
  if (!isNotionConfigured()) {
    const existing2 = mem.get(passengerId);
    if (existing2) return { passenger: existing2, created: false };
    const now2 = (/* @__PURE__ */ new Date()).toISOString();
    const p = {
      notionId: `mem_${passengerId}`,
      passengerId,
      name,
      groupId,
      deviceId,
      currentLocation: DEFAULT_LOCATION,
      currentLatitude: DEFAULT_LAT,
      currentLongitude: DEFAULT_LNG,
      lastFlightId: null,
      status: "not_started",
      createdAt: now2,
      updatedAt: now2
    };
    mem.set(passengerId, p);
    return { passenger: p, created: true };
  }
  const client = getNotionClient();
  const dbId = getDbId("passengers");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await client.databases.query({
    database_id: dbId,
    filter: { property: "Passenger ID", title: { equals: passengerId } },
    page_size: 1
  });
  if (existing.results.length > 0) {
    return {
      passenger: parsePassenger(existing.results[0]),
      created: false
    };
  }
  const page = await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      "Passenger ID": wTitle(passengerId),
      "Name": wText(name),
      "Group ID": wSelect(groupId),
      "Device ID": wText(deviceId),
      "Current Location": wText(DEFAULT_LOCATION),
      "Current Latitude": wNumber(DEFAULT_LAT),
      "Current Longitude": wNumber(DEFAULT_LNG),
      "Last Flight ID": wText(null),
      "Status": wSelect("not_started"),
      "Created At": wDate(now),
      "Updated At": wDate(now)
    }
  });
  return {
    passenger: parsePassenger(page),
    created: true
  };
}
async function updatePassengerStatus(notionId, updates) {
  if (!isNotionConfigured()) {
    for (const p of mem.values()) {
      if (p.notionId === notionId) {
        if (updates.status !== void 0) p.status = updates.status;
        if (updates.currentLocation !== void 0) p.currentLocation = updates.currentLocation;
        if (updates.currentLatitude !== void 0) p.currentLatitude = updates.currentLatitude;
        if (updates.currentLongitude !== void 0) p.currentLongitude = updates.currentLongitude;
        if (updates.lastFlightId !== void 0) p.lastFlightId = updates.lastFlightId;
        p.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
        break;
      }
    }
    return;
  }
  const client = getNotionClient();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const properties = { "Updated At": wDate(now) };
  if (updates.status !== void 0) properties["Status"] = wSelect(updates.status);
  if (updates.currentLocation !== void 0) properties["Current Location"] = wText(updates.currentLocation);
  if (updates.currentLatitude !== void 0) properties["Current Latitude"] = wNumber(updates.currentLatitude);
  if (updates.currentLongitude !== void 0) properties["Current Longitude"] = wNumber(updates.currentLongitude);
  if (updates.lastFlightId !== void 0) properties["Last Flight ID"] = wText(updates.lastFlightId);
  await client.pages.update({ page_id: notionId, properties });
}

// src/lib/notion/flights.ts
var mem2 = [];
function parseFlight(page) {
  const props = page.properties;
  return {
    notionId: page.id,
    flightId: readTitle(props, "Flight ID"),
    passengerId: readText(props, "Passenger ID"),
    passengerName: readText(props, "Passenger Name"),
    groupId: readSelect(props, "Group ID") ?? "",
    deviceId: readText(props, "Device ID"),
    status: readSelect(props, "Status") ?? "in_flight",
    departureLocation: readText(props, "Departure Location"),
    departureLatitude: readNumber(props, "Departure Latitude") ?? 0,
    departureLongitude: readNumber(props, "Departure Longitude") ?? 0,
    arrivalLocation: readText(props, "Arrival Location") || null,
    arrivalLatitude: readNumber(props, "Arrival Latitude"),
    arrivalLongitude: readNumber(props, "Arrival Longitude"),
    takeoffTime: readDate(props, "Takeoff Time") ?? (/* @__PURE__ */ new Date()).toISOString(),
    landingTime: readDate(props, "Landing Time"),
    flightDurationMinutes: readNumber(props, "Flight Duration Minutes"),
    estimatedFlightDistanceKm: readNumber(props, "Estimated Flight Distance KM"),
    flightProgress: readNumber(props, "Flight Progress") ?? 0,
    narrativeRegion: readSelect(props, "Narrative Region") ?? "departure_clouds",
    routeDirection: readSelect(props, "Route Direction") ?? "auto",
    directionSource: readSelect(props, "Direction Source") ?? "system_auto",
    directionNote: readText(props, "Direction Note") || null,
    captainBroadcastStyle: readSelect(props, "Captain Broadcast Style"),
    captainBroadcast: readText(props, "Captain Broadcast") || null,
    socialCueType: readSelect(props, "Social Cue Type"),
    socialCueText: readText(props, "Social Cue Text") || null,
    relatedPassenger: readText(props, "Related Passenger") || null,
    createdAt: readDate(props, "Created At") ?? (/* @__PURE__ */ new Date()).toISOString(),
    updatedAt: readDate(props, "Updated At") ?? (/* @__PURE__ */ new Date()).toISOString()
  };
}
function generateFlightId(passengerId) {
  const ts = Date.now().toString(36).toUpperCase();
  const suffix = passengerId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 6);
  return `FL-${suffix}-${ts}`;
}
async function createFlight(params) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const flightId = generateFlightId(params.passengerId);
  if (!isNotionConfigured()) {
    const f = {
      notionId: `mem_${flightId}`,
      flightId,
      passengerId: params.passengerId,
      passengerName: params.passengerName,
      groupId: params.groupId,
      deviceId: params.deviceId,
      status: "in_flight",
      departureLocation: params.departureLocation,
      departureLatitude: params.departureLatitude,
      departureLongitude: params.departureLongitude,
      arrivalLocation: null,
      arrivalLatitude: null,
      arrivalLongitude: null,
      takeoffTime: now,
      landingTime: null,
      flightDurationMinutes: null,
      estimatedFlightDistanceKm: null,
      flightProgress: 0,
      narrativeRegion: "departure_clouds",
      routeDirection: params.routeDirection,
      directionSource: params.directionSource,
      directionNote: params.directionNote,
      captainBroadcastStyle: null,
      captainBroadcast: null,
      socialCueType: null,
      socialCueText: null,
      relatedPassenger: null,
      createdAt: now,
      updatedAt: now
    };
    mem2.push(f);
    return f;
  }
  const client = getNotionClient();
  const dbId = getDbId("flights");
  const page = await client.pages.create({
    parent: { database_id: dbId },
    properties: {
      "Flight ID": wTitle(flightId),
      "Passenger ID": wText(params.passengerId),
      "Passenger Name": wText(params.passengerName),
      "Group ID": wSelect(params.groupId),
      "Device ID": wText(params.deviceId),
      "Status": wSelect("in_flight"),
      "Departure Location": wText(params.departureLocation),
      "Departure Latitude": wNumber(params.departureLatitude),
      "Departure Longitude": wNumber(params.departureLongitude),
      "Arrival Location": wText(null),
      "Arrival Latitude": wNumber(null),
      "Arrival Longitude": wNumber(null),
      "Takeoff Time": wDate(now),
      "Landing Time": wDate(null),
      "Flight Duration Minutes": wNumber(null),
      "Estimated Flight Distance KM": wNumber(null),
      "Flight Progress": wNumber(0),
      "Narrative Region": wSelect("departure_clouds"),
      "Route Direction": wSelect(params.routeDirection),
      "Direction Source": wSelect(params.directionSource),
      "Direction Note": wText(params.directionNote),
      "Captain Broadcast Style": wSelect(null),
      "Captain Broadcast": wText(null),
      "Social Cue Type": wSelect(null),
      "Social Cue Text": wText(null),
      "Related Passenger": wText(null),
      "Created At": wDate(now),
      "Updated At": wDate(now)
    }
  });
  return parseFlight(page);
}
async function getActiveFlight(passengerId) {
  if (!isNotionConfigured()) {
    return mem2.find((f) => f.passengerId === passengerId && f.status === "in_flight") ?? null;
  }
  const client = getNotionClient();
  const dbId = getDbId("flights");
  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: "Passenger ID", rich_text: { equals: passengerId } },
        { property: "Status", select: { equals: "in_flight" } }
      ]
    },
    sorts: [{ property: "Takeoff Time", direction: "descending" }],
    page_size: 1
  });
  if (result.results.length === 0) return null;
  return parseFlight(result.results[0]);
}
async function updateFlight(notionId, updates) {
  if (!isNotionConfigured()) {
    const f = mem2.find((x) => x.notionId === notionId);
    if (f) {
      Object.assign(f, updates);
      f.updatedAt = (/* @__PURE__ */ new Date()).toISOString();
    }
    return;
  }
  const client = getNotionClient();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const properties = { "Updated At": wDate(now) };
  if (updates.status !== void 0) properties["Status"] = wSelect(updates.status);
  if (updates.arrivalLocation !== void 0) properties["Arrival Location"] = wText(updates.arrivalLocation);
  if (updates.arrivalLatitude !== void 0) properties["Arrival Latitude"] = wNumber(updates.arrivalLatitude);
  if (updates.arrivalLongitude !== void 0) properties["Arrival Longitude"] = wNumber(updates.arrivalLongitude);
  if (updates.landingTime !== void 0) properties["Landing Time"] = wDate(updates.landingTime);
  if (updates.flightDurationMinutes !== void 0) properties["Flight Duration Minutes"] = wNumber(updates.flightDurationMinutes);
  if (updates.estimatedFlightDistanceKm !== void 0) properties["Estimated Flight Distance KM"] = wNumber(updates.estimatedFlightDistanceKm);
  if (updates.flightProgress !== void 0) properties["Flight Progress"] = wNumber(updates.flightProgress);
  if (updates.narrativeRegion !== void 0) properties["Narrative Region"] = wSelect(updates.narrativeRegion);
  if (updates.captainBroadcastStyle !== void 0) properties["Captain Broadcast Style"] = wSelect(updates.captainBroadcastStyle);
  if (updates.captainBroadcast !== void 0) properties["Captain Broadcast"] = wText(updates.captainBroadcast);
  if (updates.socialCueType !== void 0) properties["Social Cue Type"] = wSelect(updates.socialCueType);
  if (updates.socialCueText !== void 0) properties["Social Cue Text"] = wText(updates.socialCueText);
  if (updates.relatedPassenger !== void 0) properties["Related Passenger"] = wText(updates.relatedPassenger);
  await client.pages.update({ page_id: notionId, properties });
}
async function getGroupFlights(groupId, sinceHours = 24) {
  if (!isNotionConfigured()) {
    const since2 = Date.now() - sinceHours * 3600 * 1e3;
    return mem2.filter((f) => f.groupId === groupId && new Date(f.takeoffTime).getTime() >= since2).sort((a, b) => new Date(b.takeoffTime).getTime() - new Date(a.takeoffTime).getTime());
  }
  const client = getNotionClient();
  const dbId = getDbId("flights");
  const since = new Date(Date.now() - sinceHours * 3600 * 1e3).toISOString();
  const result = await client.databases.query({
    database_id: dbId,
    filter: {
      and: [
        { property: "Group ID", select: { equals: groupId } },
        { property: "Takeoff Time", date: { on_or_after: since } }
      ]
    },
    sorts: [{ property: "Takeoff Time", direction: "descending" }],
    page_size: 50
  });
  return result.results.map((p) => parseFlight(p));
}
async function getAllActiveFlights() {
  if (!isNotionConfigured()) {
    return mem2.filter((f) => f.status === "in_flight");
  }
  const client = getNotionClient();
  const dbId = getDbId("flights");
  const result = await client.databases.query({
    database_id: dbId,
    filter: { property: "Status", select: { equals: "in_flight" } },
    page_size: 100
  });
  return result.results.map((p) => parseFlight(p));
}

// src/data/cities.ts
var CITIES = [
  // --- East Asia (15) ---
  { destinationId: "dest_001", city: "Tokyo", country: "Japan", displayName: "Tokyo, Japan", latitude: 35.6762, longitude: 139.6503, airportCode: "HND", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_002", city: "Seoul", country: "South Korea", displayName: "Seoul, South Korea", latitude: 37.5665, longitude: 126.978, airportCode: "ICN", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_003", city: "Beijing", country: "China", displayName: "Beijing, China", latitude: 39.9042, longitude: 116.4074, airportCode: "PEK", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_004", city: "Shanghai", country: "China", displayName: "Shanghai, China", latitude: 31.2304, longitude: 121.4737, airportCode: "PVG", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_005", city: "Hong Kong", country: "China", displayName: "Hong Kong, China", latitude: 22.3193, longitude: 114.1694, airportCode: "HKG", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_006", city: "Taipei", country: "Taiwan", displayName: "Taipei, Taiwan", latitude: 25.033, longitude: 121.5654, airportCode: "TPE", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_007", city: "Osaka", country: "Japan", displayName: "Osaka, Japan", latitude: 34.6937, longitude: 135.5023, airportCode: "KIX", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_008", city: "Busan", country: "South Korea", displayName: "Busan, South Korea", latitude: 35.1796, longitude: 129.0756, airportCode: "PUS", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_009", city: "Guangzhou", country: "China", displayName: "Guangzhou, China", latitude: 23.1291, longitude: 113.2644, airportCode: "CAN", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_010", city: "Shenzhen", country: "China", displayName: "Shenzhen, China", latitude: 22.5431, longitude: 114.0579, airportCode: "SZX", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_011", city: "Chengdu", country: "China", displayName: "Chengdu, China", latitude: 30.5728, longitude: 104.0668, airportCode: "CTU", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_012", city: "Kunming", country: "China", displayName: "Kunming, China", latitude: 25.0453, longitude: 102.7097, airportCode: "KMG", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_013", city: "Ulaanbaatar", country: "Mongolia", displayName: "Ulaanbaatar, Mongolia", latitude: 47.8864, longitude: 106.9057, airportCode: "ULN", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_014", city: "Sapporo", country: "Japan", displayName: "Sapporo, Japan", latitude: 43.0618, longitude: 141.3545, airportCode: "CTS", region: "East Asia", availableForLanding: true },
  { destinationId: "dest_015", city: "Fukuoka", country: "Japan", displayName: "Fukuoka, Japan", latitude: 33.5904, longitude: 130.4017, airportCode: "FUK", region: "East Asia", availableForLanding: true },
  // --- Southeast Asia (10) ---
  { destinationId: "dest_016", city: "Singapore", country: "Singapore", displayName: "Singapore", latitude: 1.3521, longitude: 103.8198, airportCode: "SIN", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_017", city: "Bangkok", country: "Thailand", displayName: "Bangkok, Thailand", latitude: 13.7563, longitude: 100.5018, airportCode: "BKK", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_018", city: "Kuala Lumpur", country: "Malaysia", displayName: "Kuala Lumpur, Malaysia", latitude: 3.139, longitude: 101.6869, airportCode: "KUL", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_019", city: "Ho Chi Minh City", country: "Vietnam", displayName: "Ho Chi Minh City, Vietnam", latitude: 10.8231, longitude: 106.6297, airportCode: "SGN", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_020", city: "Manila", country: "Philippines", displayName: "Manila, Philippines", latitude: 14.5995, longitude: 120.9842, airportCode: "MNL", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_021", city: "Jakarta", country: "Indonesia", displayName: "Jakarta, Indonesia", latitude: -6.2088, longitude: 106.8456, airportCode: "CGK", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_022", city: "Hanoi", country: "Vietnam", displayName: "Hanoi, Vietnam", latitude: 21.0285, longitude: 105.8542, airportCode: "HAN", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_023", city: "Yangon", country: "Myanmar", displayName: "Yangon, Myanmar", latitude: 16.8661, longitude: 96.1951, airportCode: "RGN", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_024", city: "Phnom Penh", country: "Cambodia", displayName: "Phnom Penh, Cambodia", latitude: 11.5564, longitude: 104.9282, airportCode: "PNH", region: "Southeast Asia", availableForLanding: true },
  { destinationId: "dest_025", city: "Bali", country: "Indonesia", displayName: "Bali, Indonesia", latitude: -8.4095, longitude: 115.1889, airportCode: "DPS", region: "Southeast Asia", availableForLanding: true },
  // --- South Asia (8) ---
  { destinationId: "dest_026", city: "Mumbai", country: "India", displayName: "Mumbai, India", latitude: 19.076, longitude: 72.8777, airportCode: "BOM", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_027", city: "Delhi", country: "India", displayName: "Delhi, India", latitude: 28.6139, longitude: 77.209, airportCode: "DEL", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_028", city: "Bangalore", country: "India", displayName: "Bangalore, India", latitude: 12.9716, longitude: 77.5946, airportCode: "BLR", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_029", city: "Colombo", country: "Sri Lanka", displayName: "Colombo, Sri Lanka", latitude: 6.9271, longitude: 79.8612, airportCode: "CMB", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_030", city: "Dhaka", country: "Bangladesh", displayName: "Dhaka, Bangladesh", latitude: 23.8103, longitude: 90.4125, airportCode: "DAC", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_031", city: "Kathmandu", country: "Nepal", displayName: "Kathmandu, Nepal", latitude: 27.7172, longitude: 85.324, airportCode: "KTM", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_032", city: "Karachi", country: "Pakistan", displayName: "Karachi, Pakistan", latitude: 24.8607, longitude: 67.0011, airportCode: "KHI", region: "South Asia", availableForLanding: true },
  { destinationId: "dest_033", city: "Chennai", country: "India", displayName: "Chennai, India", latitude: 13.0827, longitude: 80.2707, airportCode: "MAA", region: "South Asia", availableForLanding: true },
  // --- Middle East / West Asia (10) ---
  { destinationId: "dest_034", city: "Dubai", country: "UAE", displayName: "Dubai, UAE", latitude: 25.2048, longitude: 55.2708, airportCode: "DXB", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_035", city: "Abu Dhabi", country: "UAE", displayName: "Abu Dhabi, UAE", latitude: 24.4539, longitude: 54.3773, airportCode: "AUH", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_036", city: "Doha", country: "Qatar", displayName: "Doha, Qatar", latitude: 25.2854, longitude: 51.531, airportCode: "DOH", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_037", city: "Istanbul", country: "Turkey", displayName: "Istanbul, Turkey", latitude: 41.0082, longitude: 28.9784, airportCode: "IST", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_038", city: "Riyadh", country: "Saudi Arabia", displayName: "Riyadh, Saudi Arabia", latitude: 24.7136, longitude: 46.6753, airportCode: "RUH", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_039", city: "Tehran", country: "Iran", displayName: "Tehran, Iran", latitude: 35.6892, longitude: 51.389, airportCode: "IKA", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_040", city: "Tashkent", country: "Uzbekistan", displayName: "Tashkent, Uzbekistan", latitude: 41.2995, longitude: 69.2401, airportCode: "TAS", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_041", city: "Almaty", country: "Kazakhstan", displayName: "Almaty, Kazakhstan", latitude: 43.222, longitude: 76.8512, airportCode: "ALA", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_042", city: "Amman", country: "Jordan", displayName: "Amman, Jordan", latitude: 31.9454, longitude: 35.9284, airportCode: "AMM", region: "Middle East", availableForLanding: true },
  { destinationId: "dest_043", city: "Beirut", country: "Lebanon", displayName: "Beirut, Lebanon", latitude: 33.8938, longitude: 35.5018, airportCode: "BEY", region: "Middle East", availableForLanding: true },
  // --- Europe (18) ---
  { destinationId: "dest_044", city: "London", country: "United Kingdom", displayName: "London, UK", latitude: 51.5074, longitude: -0.1278, airportCode: "LHR", region: "Europe", availableForLanding: true },
  { destinationId: "dest_045", city: "Paris", country: "France", displayName: "Paris, France", latitude: 48.8566, longitude: 2.3522, airportCode: "CDG", region: "Europe", availableForLanding: true },
  { destinationId: "dest_046", city: "Amsterdam", country: "Netherlands", displayName: "Amsterdam, Netherlands", latitude: 52.3676, longitude: 4.9041, airportCode: "AMS", region: "Europe", availableForLanding: true },
  { destinationId: "dest_047", city: "Berlin", country: "Germany", displayName: "Berlin, Germany", latitude: 52.52, longitude: 13.405, airportCode: "BER", region: "Europe", availableForLanding: true },
  { destinationId: "dest_048", city: "Rome", country: "Italy", displayName: "Rome, Italy", latitude: 41.9028, longitude: 12.4964, airportCode: "FCO", region: "Europe", availableForLanding: true },
  { destinationId: "dest_049", city: "Barcelona", country: "Spain", displayName: "Barcelona, Spain", latitude: 41.3851, longitude: 2.1734, airportCode: "BCN", region: "Europe", availableForLanding: true },
  { destinationId: "dest_050", city: "Vienna", country: "Austria", displayName: "Vienna, Austria", latitude: 48.2082, longitude: 16.3738, airportCode: "VIE", region: "Europe", availableForLanding: true },
  { destinationId: "dest_051", city: "Prague", country: "Czech Republic", displayName: "Prague, Czech Republic", latitude: 50.0755, longitude: 14.4378, airportCode: "PRG", region: "Europe", availableForLanding: true },
  { destinationId: "dest_052", city: "Warsaw", country: "Poland", displayName: "Warsaw, Poland", latitude: 52.2297, longitude: 21.0122, airportCode: "WAW", region: "Europe", availableForLanding: true },
  { destinationId: "dest_053", city: "Athens", country: "Greece", displayName: "Athens, Greece", latitude: 37.9838, longitude: 23.7275, airportCode: "ATH", region: "Europe", availableForLanding: true },
  { destinationId: "dest_054", city: "Stockholm", country: "Sweden", displayName: "Stockholm, Sweden", latitude: 59.3293, longitude: 18.0686, airportCode: "ARN", region: "Europe", availableForLanding: true },
  { destinationId: "dest_055", city: "Zurich", country: "Switzerland", displayName: "Zurich, Switzerland", latitude: 47.3769, longitude: 8.5417, airportCode: "ZRH", region: "Europe", availableForLanding: true },
  { destinationId: "dest_056", city: "Budapest", country: "Hungary", displayName: "Budapest, Hungary", latitude: 47.4979, longitude: 19.0402, airportCode: "BUD", region: "Europe", availableForLanding: true },
  { destinationId: "dest_057", city: "Lisbon", country: "Portugal", displayName: "Lisbon, Portugal", latitude: 38.7223, longitude: -9.1393, airportCode: "LIS", region: "Europe", availableForLanding: true },
  { destinationId: "dest_058", city: "Copenhagen", country: "Denmark", displayName: "Copenhagen, Denmark", latitude: 55.6761, longitude: 12.5683, airportCode: "CPH", region: "Europe", availableForLanding: true },
  { destinationId: "dest_059", city: "Helsinki", country: "Finland", displayName: "Helsinki, Finland", latitude: 60.1699, longitude: 24.9384, airportCode: "HEL", region: "Europe", availableForLanding: true },
  { destinationId: "dest_060", city: "Dublin", country: "Ireland", displayName: "Dublin, Ireland", latitude: 53.3498, longitude: -6.2603, airportCode: "DUB", region: "Europe", availableForLanding: true },
  { destinationId: "dest_061", city: "Moscow", country: "Russia", displayName: "Moscow, Russia", latitude: 55.7558, longitude: 37.6173, airportCode: "SVO", region: "Europe", availableForLanding: true },
  // --- Africa (9) ---
  { destinationId: "dest_062", city: "Cairo", country: "Egypt", displayName: "Cairo, Egypt", latitude: 30.0444, longitude: 31.2357, airportCode: "CAI", region: "Africa", availableForLanding: true },
  { destinationId: "dest_063", city: "Nairobi", country: "Kenya", displayName: "Nairobi, Kenya", latitude: -1.2921, longitude: 36.8219, airportCode: "NBO", region: "Africa", availableForLanding: true },
  { destinationId: "dest_064", city: "Lagos", country: "Nigeria", displayName: "Lagos, Nigeria", latitude: 6.5244, longitude: 3.3792, airportCode: "LOS", region: "Africa", availableForLanding: true },
  { destinationId: "dest_065", city: "Cape Town", country: "South Africa", displayName: "Cape Town, South Africa", latitude: -33.9249, longitude: 18.4241, airportCode: "CPT", region: "Africa", availableForLanding: true },
  { destinationId: "dest_066", city: "Casablanca", country: "Morocco", displayName: "Casablanca, Morocco", latitude: 33.5731, longitude: -7.5898, airportCode: "CMN", region: "Africa", availableForLanding: true },
  { destinationId: "dest_067", city: "Addis Ababa", country: "Ethiopia", displayName: "Addis Ababa, Ethiopia", latitude: 9.032, longitude: 38.7469, airportCode: "ADD", region: "Africa", availableForLanding: true },
  { destinationId: "dest_068", city: "Johannesburg", country: "South Africa", displayName: "Johannesburg, South Africa", latitude: -26.2041, longitude: 28.0473, airportCode: "JNB", region: "Africa", availableForLanding: true },
  { destinationId: "dest_069", city: "Accra", country: "Ghana", displayName: "Accra, Ghana", latitude: 5.6037, longitude: -0.187, airportCode: "ACC", region: "Africa", availableForLanding: true },
  { destinationId: "dest_070", city: "Dar es Salaam", country: "Tanzania", displayName: "Dar es Salaam, Tanzania", latitude: -6.7924, longitude: 39.2083, airportCode: "DAR", region: "Africa", availableForLanding: true },
  // --- Oceania (5) ---
  { destinationId: "dest_071", city: "Sydney", country: "Australia", displayName: "Sydney, Australia", latitude: -33.8688, longitude: 151.2093, airportCode: "SYD", region: "Oceania", availableForLanding: true },
  { destinationId: "dest_072", city: "Melbourne", country: "Australia", displayName: "Melbourne, Australia", latitude: -37.8136, longitude: 144.9631, airportCode: "MEL", region: "Oceania", availableForLanding: true },
  { destinationId: "dest_073", city: "Auckland", country: "New Zealand", displayName: "Auckland, New Zealand", latitude: -36.8509, longitude: 174.7645, airportCode: "AKL", region: "Oceania", availableForLanding: true },
  { destinationId: "dest_074", city: "Brisbane", country: "Australia", displayName: "Brisbane, Australia", latitude: -27.4698, longitude: 153.0251, airportCode: "BNE", region: "Oceania", availableForLanding: true },
  { destinationId: "dest_075", city: "Perth", country: "Australia", displayName: "Perth, Australia", latitude: -31.9505, longitude: 115.8605, airportCode: "PER", region: "Oceania", availableForLanding: true },
  // --- North America (15) ---
  { destinationId: "dest_076", city: "New York", country: "USA", displayName: "New York, USA", latitude: 40.7128, longitude: -74.006, airportCode: "JFK", region: "North America", availableForLanding: true },
  { destinationId: "dest_077", city: "Los Angeles", country: "USA", displayName: "Los Angeles, USA", latitude: 34.0522, longitude: -118.2437, airportCode: "LAX", region: "North America", availableForLanding: true },
  { destinationId: "dest_078", city: "Chicago", country: "USA", displayName: "Chicago, USA", latitude: 41.8781, longitude: -87.6298, airportCode: "ORD", region: "North America", availableForLanding: true },
  { destinationId: "dest_079", city: "Toronto", country: "Canada", displayName: "Toronto, Canada", latitude: 43.6532, longitude: -79.3832, airportCode: "YYZ", region: "North America", availableForLanding: true },
  { destinationId: "dest_080", city: "Vancouver", country: "Canada", displayName: "Vancouver, Canada", latitude: 49.2827, longitude: -123.1207, airportCode: "YVR", region: "North America", availableForLanding: true },
  { destinationId: "dest_081", city: "San Francisco", country: "USA", displayName: "San Francisco, USA", latitude: 37.7749, longitude: -122.4194, airportCode: "SFO", region: "North America", availableForLanding: true },
  { destinationId: "dest_082", city: "Miami", country: "USA", displayName: "Miami, USA", latitude: 25.7617, longitude: -80.1918, airportCode: "MIA", region: "North America", availableForLanding: true },
  { destinationId: "dest_083", city: "Seattle", country: "USA", displayName: "Seattle, USA", latitude: 47.6062, longitude: -122.3321, airportCode: "SEA", region: "North America", availableForLanding: true },
  { destinationId: "dest_084", city: "Boston", country: "USA", displayName: "Boston, USA", latitude: 42.3601, longitude: -71.0589, airportCode: "BOS", region: "North America", availableForLanding: true },
  { destinationId: "dest_085", city: "Mexico City", country: "Mexico", displayName: "Mexico City, Mexico", latitude: 19.4326, longitude: -99.1332, airportCode: "MEX", region: "North America", availableForLanding: true },
  { destinationId: "dest_086", city: "Houston", country: "USA", displayName: "Houston, USA", latitude: 29.7604, longitude: -95.3698, airportCode: "IAH", region: "North America", availableForLanding: true },
  { destinationId: "dest_087", city: "Las Vegas", country: "USA", displayName: "Las Vegas, USA", latitude: 36.1699, longitude: -115.1398, airportCode: "LAS", region: "North America", availableForLanding: true },
  { destinationId: "dest_088", city: "Honolulu", country: "USA", displayName: "Honolulu, USA", latitude: 21.3069, longitude: -157.8583, airportCode: "HNL", region: "North America", availableForLanding: true },
  { destinationId: "dest_089", city: "Anchorage", country: "USA", displayName: "Anchorage, USA", latitude: 61.2181, longitude: -149.9003, airportCode: "ANC", region: "North America", availableForLanding: true },
  { destinationId: "dest_090", city: "Montreal", country: "Canada", displayName: "Montreal, Canada", latitude: 45.5017, longitude: -73.5673, airportCode: "YUL", region: "North America", availableForLanding: true },
  // --- South America (8) ---
  { destinationId: "dest_091", city: "S\xE3o Paulo", country: "Brazil", displayName: "S\xE3o Paulo, Brazil", latitude: -23.5505, longitude: -46.6333, airportCode: "GRU", region: "South America", availableForLanding: true },
  { destinationId: "dest_092", city: "Buenos Aires", country: "Argentina", displayName: "Buenos Aires, Argentina", latitude: -34.6037, longitude: -58.3816, airportCode: "EZE", region: "South America", availableForLanding: true },
  { destinationId: "dest_093", city: "Rio de Janeiro", country: "Brazil", displayName: "Rio de Janeiro, Brazil", latitude: -22.9068, longitude: -43.1729, airportCode: "GIG", region: "South America", availableForLanding: true },
  { destinationId: "dest_094", city: "Lima", country: "Peru", displayName: "Lima, Peru", latitude: -12.0464, longitude: -77.0428, airportCode: "LIM", region: "South America", availableForLanding: true },
  { destinationId: "dest_095", city: "Bogot\xE1", country: "Colombia", displayName: "Bogot\xE1, Colombia", latitude: 4.711, longitude: -74.0721, airportCode: "BOG", region: "South America", availableForLanding: true },
  { destinationId: "dest_096", city: "Santiago", country: "Chile", displayName: "Santiago, Chile", latitude: -33.4489, longitude: -70.6693, airportCode: "SCL", region: "South America", availableForLanding: true },
  { destinationId: "dest_097", city: "Caracas", country: "Venezuela", displayName: "Caracas, Venezuela", latitude: 10.4806, longitude: -66.9036, airportCode: "CCS", region: "South America", availableForLanding: true },
  { destinationId: "dest_098", city: "Quito", country: "Ecuador", displayName: "Quito, Ecuador", latitude: -0.1807, longitude: -78.4678, airportCode: "UIO", region: "South America", availableForLanding: true },
  // --- Pacific Islands (3) ---
  { destinationId: "dest_099", city: "Suva", country: "Fiji", displayName: "Suva, Fiji", latitude: -18.1248, longitude: 178.4501, airportCode: "SUV", region: "Pacific", availableForLanding: true },
  { destinationId: "dest_100", city: "Papeete", country: "French Polynesia", displayName: "Papeete, Tahiti", latitude: -17.5344, longitude: -149.5686, airportCode: "PPT", region: "Pacific", availableForLanding: true },
  { destinationId: "dest_101", city: "Hag\xE5t\xF1a", country: "Guam", displayName: "Hag\xE5t\xF1a, Guam", latitude: 13.4443, longitude: 144.7937, airportCode: "GUM", region: "Pacific", availableForLanding: true }
];

// src/lib/notion/destinations.ts
function parseDestination(page) {
  const props = page.properties;
  return {
    notionId: page.id,
    destinationId: readTitle(props, "Destination ID"),
    city: readText(props, "City"),
    country: readText(props, "Country"),
    displayName: readText(props, "Display Name"),
    latitude: readNumber(props, "Latitude") ?? 0,
    longitude: readNumber(props, "Longitude") ?? 0,
    airportCode: readText(props, "Airport Code") || null,
    region: readSelect(props, "Region") ?? "",
    availableForLanding: readCheckbox(props, "Available for Landing")
  };
}
async function getAvailableDestinations() {
  if (!process.env.NOTION_API_KEY || !process.env.NOTION_DESTINATIONS_DB_ID) {
    return CITIES.filter((c) => c.availableForLanding);
  }
  try {
    const client = getNotionClient();
    const dbId = getDbId("destinations");
    const result = await client.databases.query({
      database_id: dbId,
      filter: { property: "Available for Landing", checkbox: { equals: true } },
      page_size: 200
    });
    if (result.results.length === 0) return CITIES.filter((c) => c.availableForLanding);
    return result.results.map((p) => parseDestination(p));
  } catch {
    return CITIES.filter((c) => c.availableForLanding);
  }
}
async function seedDestinations() {
  const client = getNotionClient();
  const dbId = getDbId("destinations");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const existing = await client.databases.query({ database_id: dbId, page_size: 200 });
  const existingIds = new Set(
    existing.results.map((p) => {
      const props = p.properties;
      return readTitle(props, "Destination ID");
    })
  );
  let seeded = 0;
  let skipped = 0;
  for (const city of CITIES) {
    if (existingIds.has(city.destinationId)) {
      skipped++;
      continue;
    }
    await client.pages.create({
      parent: { database_id: dbId },
      properties: {
        "Destination ID": wTitle(city.destinationId),
        "City": wText(city.city),
        "Country": wText(city.country),
        "Display Name": wText(city.displayName),
        "Latitude": wNumber(city.latitude),
        "Longitude": wNumber(city.longitude),
        "Airport Code": wText(city.airportCode),
        "Region": wSelect(city.region),
        "Available for Landing": { checkbox: true },
        "Created At": wDate(now),
        "Updated At": wDate(now)
      }
    });
    seeded++;
  }
  return { seeded, skipped };
}

// src/lib/flight/distance.ts
var KM_PER_MINUTE = 12;
function calculateFlightDistance(durationMinutes) {
  return durationMinutes * KM_PER_MINUTE;
}

// src/lib/flight/progress.ts
var REFERENCE_MINUTES = 480;
function calculateFlightProgress(takeoffTime) {
  const now = Date.now();
  const takeoff = new Date(takeoffTime).getTime();
  const elapsedMinutes = (now - takeoff) / 6e4;
  const progress = elapsedMinutes / REFERENCE_MINUTES * 100;
  return Math.min(100, Math.max(0, progress));
}

// src/lib/flight/region.ts
var REGION_ORDER = [
  "departure_clouds",
  "pacific_drift",
  "deep_night_current",
  "dawn_corridor",
  "arrival_harbor"
];
var REGION_DISPLAY = {
  departure_clouds: "\u767B\u6A5F\u96F2\u5C64",
  pacific_drift: "\u592A\u5E73\u6D0B\u6F02\u6D41\u5E36",
  deep_night_current: "\u6DF1\u591C\u6D0B\u6D41",
  dawn_corridor: "\u9ECE\u660E\u822A\u5ECA",
  arrival_harbor: "\u62B5\u9054\u6E2F\u7063"
};
function getNarrativeRegion(progress) {
  if (progress < 20) return "departure_clouds";
  if (progress < 40) return "pacific_drift";
  if (progress < 60) return "deep_night_current";
  if (progress < 80) return "dawn_corridor";
  return "arrival_harbor";
}
function areAdjacentRegions(a, b) {
  const indexA = REGION_ORDER.indexOf(a);
  const indexB = REGION_ORDER.indexOf(b);
  return Math.abs(indexA - indexB) === 1;
}

// src/lib/utils/haversine.ts
var EARTH_RADIUS_KM = 6371;
function toRad(deg) {
  return deg * Math.PI / 180;
}
function haversineDistance(lat1, lon1, lat2, lon2) {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}
function calculateBearing(lat1, lon1, lat2, lon2) {
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

// src/lib/flight/direction.ts
function isInDirection(bearing, direction) {
  const b = (bearing % 360 + 360) % 360;
  switch (direction) {
    case "northbound":
      return b >= 315 || b < 45;
    case "northeast":
      return b >= 22.5 && b < 67.5;
    case "eastbound":
      return b >= 45 && b < 135;
    case "southeast":
      return b >= 112.5 && b < 157.5;
    case "southbound":
      return b >= 135 && b < 225;
    case "southwest":
      return b >= 202.5 && b < 247.5;
    case "westbound":
      return b >= 225 && b < 315;
    case "northwest":
      return b >= 292.5 && b < 337.5;
    // auto, circular, unknown → no direction constraint
    default:
      return true;
  }
}
function findArrivalDestination(departureLat, departureLng, distanceKm, routeDirection, destinations, departureLocation) {
  const available = destinations.filter(
    (d) => d.availableForLanding && d.displayName !== departureLocation
  );
  const candidates = available.map((dest) => {
    const actualDistance = haversineDistance(
      departureLat,
      departureLng,
      dest.latitude,
      dest.longitude
    );
    const bearing = calculateBearing(
      departureLat,
      departureLng,
      dest.latitude,
      dest.longitude
    );
    return {
      ...dest,
      distanceKm: actualDistance,
      distanceDelta: Math.abs(actualDistance - distanceKm),
      inDirection: isInDirection(bearing, routeDirection)
    };
  });
  const directional = candidates.filter((c) => c.inDirection);
  if (directional.length > 0) {
    directional.sort((a, b) => a.distanceDelta - b.distanceDelta);
    return directional[0];
  }
  candidates.sort((a, b) => a.distanceDelta - b.distanceDelta);
  return candidates[0];
}

// src/lib/flight/social.ts
function calculateGroupSocialCue(current, groupFlights) {
  const others = groupFlights.filter((f) => f.passengerId !== current.passengerId);
  const inFlightOthers = others.filter((f) => f.status === "in_flight");
  const landedOthers = others.filter((f) => f.status === "landed" && f.landingTime != null);
  const sameRegion = inFlightOthers.find(
    (f) => f.narrativeRegion === current.narrativeRegion
  );
  if (sameRegion) {
    return makeCue(
      "same_region",
      sameRegion.passengerName,
      `${sameRegion.passengerName} \u4E5F\u548C\u4F60\u4E00\u8D77\u7A7F\u8D8A ${REGION_DISPLAY[current.narrativeRegion]}\u3002`
    );
  }
  const nearbyRegion = inFlightOthers.find(
    (f) => areAdjacentRegions(f.narrativeRegion, current.narrativeRegion)
  );
  if (nearbyRegion) {
    return makeCue(
      "nearby_region",
      nearbyRegion.passengerName,
      `${nearbyRegion.passengerName} \u5728\u76F8\u9130\u7684 ${REGION_DISPLAY[nearbyRegion.narrativeRegion]} \u98DB\u884C\u3002`
    );
  }
  if (inFlightOthers.length > 0) {
    const other = inFlightOthers[0];
    return makeCue(
      "relay_flight",
      other.passengerName,
      `\u4F60\u5DF2\u964D\u843D\uFF0C${other.passengerName} \u4ECD\u5728\u7E7C\u7E8C\u9019\u8D9F\u591C\u9593\u98DB\u884C\u3002`
    );
  }
  const earlierLanders = landedOthers.filter(
    (f) => f.landingTime < current.landingTime
  );
  if (earlierLanders.length > 0) {
    const other = earlierLanders[0];
    return makeCue(
      "early_landing",
      other.passengerName,
      `${other.passengerName} \u6BD4\u4F60\u66F4\u65E9\u964D\u843D\u4E86\u3002`
    );
  }
  const laterLanders = landedOthers.filter(
    (f) => f.landingTime > current.landingTime
  );
  if (laterLanders.length > 0) {
    const other = laterLanders[0];
    return makeCue(
      "late_landing",
      other.passengerName,
      `${other.passengerName} \u5728\u4F60\u964D\u843D\u5F8C\u7E7C\u7E8C\u98DB\u884C\u4E26\u5DF2\u62B5\u9054\u3002`
    );
  }
  return makeCue("solo", null, "\u4ECA\u665A\u4F60\u7368\u81EA\u98DB\u884C\u3002\u6C92\u6709\u5075\u6E2C\u5230\u540C\u7D44\u7684\u8FD1\u671F\u822A\u73ED\u3002");
}
function makeCue(cueType, relatedPassenger, cueText) {
  return { cueType, relatedPassenger, cueText };
}

// src/lib/ai/broadcast.ts
var import_openai = __toESM(require("openai"));
var STYLE_DESCRIPTIONS = {
  formal_captain: "\u4F60\u662F\u4E00\u4F4D\u6C89\u7A69\u3001\u5C08\u696D\u7684\u822A\u7A7A\u516C\u53F8\u6A5F\u9577\uFF0C\u5EE3\u64AD\u8A9E\u6C23\u6B63\u5F0F\u4E14\u4EE4\u4EBA\u5B89\u5FC3\u3002",
  poetic: "\u4F60\u662F\u4E00\u4F4D\u5145\u6EFF\u8A69\u610F\u7684\u6A5F\u9577\uFF0C\u5EE3\u64AD\u8A9E\u8A00\u5982\u6563\u6587\u8A69\uFF0C\u5145\u6EFF\u610F\u8C61\u8207\u54F2\u601D\u3002",
  playful: "\u4F60\u662F\u4E00\u4F4D\u5E7D\u9ED8\u3001\u8F15\u9B06\u7684\u6A5F\u9577\uFF0C\u5EE3\u64AD\u5145\u6EFF\u6EAB\u6696\u7684\u73A9\u7B11\u8207\u89AA\u5207\u611F\u3002",
  flight_attendant: "\u4F60\u662F\u4E00\u4F4D\u89AA\u5207\u7684\u7A7A\u670D\u54E1\uFF0C\u5EE3\u64AD\u8A9E\u6C23\u6EAB\u67D4\u3001\u9AD4\u8CBC\uFF0C\u5145\u6EFF\u95DC\u61F7\u3002",
  radio_host: "\u4F60\u662F\u4E00\u4F4D\u6DF1\u591C\u96FB\u53F0\u4E3B\u6301\u4EBA\uFF0C\u5EE3\u64AD\u5982\u540C\u591C\u9593\u7BC0\u76EE\uFF0C\u5A13\u5A13\u9053\u4F86\u65C5\u5BA2\u7684\u591C\u884C\u6545\u4E8B\u3002",
  custom: "\u4F60\u662F\u7526\u9192\u822A\u73ED\u7684\u5EE3\u64AD\u54E1\uFF0C\u4EE5\u4F60\u8A8D\u70BA\u6700\u9069\u5408\u7684\u8A9E\u6C23\u50B3\u9054\u9019\u8D9F\u98DB\u884C\u7684\u6545\u4E8B\u3002"
};
async function generateCaptainBroadcast(input) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY \u5C1A\u672A\u8A2D\u5B9A\u3002");
  }
  const client = new import_openai.default({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const arrivalText = input.arrivalLocation ? `\u5DF2\u62B5\u9054\uFF1A${input.arrivalLocation}` : `\u76EE\u524D\u7A7A\u57DF\uFF1A${REGION_DISPLAY[input.narrativeRegion]}\uFF08\u98DB\u884C\u9032\u5EA6 ${Math.round(input.flightProgress)}%\uFF09`;
  const durationText = input.flightDurationMinutes ? `${input.flightDurationMinutes} \u5206\u9418\uFF08\u7D04 ${Math.floor(input.flightDurationMinutes / 60)} \u5C0F\u6642 ${input.flightDurationMinutes % 60} \u5206\u9418\uFF09` : `\u9032\u5EA6 ${Math.round(input.flightProgress)}%`;
  const systemPrompt = `\u4F60\u662F\u7526\u9192\u822A\u73ED\u7684\u5EE3\u64AD\u7CFB\u7D71\u3002${STYLE_DESCRIPTIONS[input.style]}

\u898F\u5247\uFF1A
- \u4F7F\u7528\u7E41\u9AD4\u4E2D\u6587
- \u5EE3\u64AD\u9577\u5EA6\u63A7\u5236\u5728 100-150 \u5B57
- \u5FC5\u9808\u5305\u542B\uFF1A\u4E58\u5BA2\u59D3\u540D\u3001\u51FA\u767C\u5730\u3001\u62B5\u9054\u5730\u6216\u76EE\u524D\u7A7A\u57DF\u3001\u98DB\u884C\u6642\u9577\u3001\u822A\u7DDA\u65B9\u5411\u3001\u793E\u4EA4\u63D0\u793A
- \u4E0D\u5F97\u81EA\u884C\u7DE8\u9020\u7CFB\u7D71\u672A\u63D0\u4F9B\u7684\u76EE\u7684\u5730\u3001\u6642\u9577\u6216\u4EBA\u969B\u95DC\u4FC2
- \u76F4\u63A5\u8F38\u51FA\u5EE3\u64AD\u5167\u5BB9\uFF0C\u4E0D\u52A0\u4EFB\u4F55\u524D\u7DB4\u6216\u8AAA\u660E`;
  const userPrompt = `\u8ACB\u6839\u64DA\u4EE5\u4E0B\u8CC7\u6599\u751F\u6210\u6A5F\u9577\u5EE3\u64AD\uFF1A

\u4E58\u5BA2\u59D3\u540D\uFF1A${input.passengerName}
\u51FA\u767C\u5730\uFF1A${input.departureLocation}
${arrivalText}
\u98DB\u884C\u6642\u9577\uFF1A${durationText}
\u4F30\u7B97\u8DDD\u96E2\uFF1A${input.estimatedDistanceKm ? `${Math.round(input.estimatedDistanceKm)} km` : "\u8A08\u7B97\u4E2D"}
\u822A\u7DDA\u65B9\u5411\uFF1A${input.routeDirection}
\u793E\u4EA4\u63D0\u793A\uFF08\u5FC5\u9808\u5BEB\u5165\u5EE3\u64AD\uFF09\uFF1A${input.socialCue.cueText}`;
  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ],
    max_tokens: 300,
    temperature: 0.8
  });
  return completion.choices[0]?.message?.content?.trim() ?? "\u5EE3\u64AD\u751F\u6210\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66\u3002";
}

// server.ts
import_dotenv.default.config({ path: ".env.local" });
var app = (0, import_express.default)();
app.use(import_express.default.json());
app.use(import_express.default.static((0, import_path.join)(process.cwd(), "public")));
app.post("/api/passenger", async (req, res) => {
  try {
    const { passengerId, name, groupId, deviceId } = req.body;
    if (!passengerId || !name || !groupId) {
      res.status(400).json({ error: "\u8ACB\u586B\u5BEB\u4E58\u5BA2 ID\u3001\u59D3\u540D\u548C\u5C0F\u968A ID\u3002" });
      return;
    }
    const result = await getOrCreatePassenger(passengerId, name, groupId, deviceId ?? "web");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.post("/api/flight/takeoff", async (req, res) => {
  try {
    const {
      passengerId,
      deviceId = "web",
      routeDirection = "auto",
      directionSource = "system_auto",
      directionNote = null
    } = req.body;
    if (!passengerId) {
      res.status(400).json({ error: "\u8ACB\u63D0\u4F9B\u4E58\u5BA2 ID\u3002" });
      return;
    }
    const { passenger } = await getOrCreatePassenger(passengerId, "", "", deviceId);
    const existing = await getActiveFlight(passengerId);
    if (existing) {
      res.status(409).json({ error: "already_in_flight", message: "\u4F60\u5DF2\u6709\u4E00\u8D9F\u5C1A\u672A\u964D\u843D\u7684\u822A\u73ED\uFF0C\u8ACB\u5148\u964D\u843D\u6216\u53D6\u6D88\u3002" });
      return;
    }
    const flight = await createFlight({
      passengerId,
      passengerName: passenger.name,
      groupId: passenger.groupId,
      deviceId,
      departureLocation: passenger.currentLocation,
      departureLatitude: passenger.currentLatitude,
      departureLongitude: passenger.currentLongitude,
      routeDirection,
      directionSource,
      directionNote
    });
    await updatePassengerStatus(passenger.notionId, {
      status: "in_flight",
      lastFlightId: flight.flightId
    });
    res.json({ flight });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.post("/api/flight/land", async (req, res) => {
  try {
    const { passengerId, broadcastStyle = "formal_captain" } = req.body;
    if (!passengerId) {
      res.status(400).json({ error: "\u8ACB\u63D0\u4F9B\u4E58\u5BA2 ID\u3002" });
      return;
    }
    const { passenger } = await getOrCreatePassenger(passengerId, "", "", "web");
    const activeFlight = await getActiveFlight(passengerId);
    if (!activeFlight) {
      res.status(404).json({ error: "no_active_flight", message: "\u627E\u4E0D\u5230\u9032\u884C\u4E2D\u7684\u822A\u73ED\u3002" });
      return;
    }
    const landingTime = (/* @__PURE__ */ new Date()).toISOString();
    const durationMinutes = Math.round(
      (new Date(landingTime).getTime() - new Date(activeFlight.takeoffTime).getTime()) / 6e4
    );
    const distanceKm = calculateFlightDistance(durationMinutes);
    const progress = calculateFlightProgress(activeFlight.takeoffTime);
    const region = getNarrativeRegion(progress);
    const destinations = await getAvailableDestinations();
    const arrival = findArrivalDestination(
      activeFlight.departureLatitude,
      activeFlight.departureLongitude,
      distanceKm,
      activeFlight.routeDirection,
      destinations,
      activeFlight.departureLocation
    );
    const groupFlights = await getGroupFlights(passenger.groupId);
    const socialCue = calculateGroupSocialCue(
      { passengerId, narrativeRegion: region, landingTime },
      groupFlights
    );
    let captainBroadcast = "";
    try {
      captainBroadcast = await generateCaptainBroadcast({
        passengerName: passenger.name,
        departureLocation: activeFlight.departureLocation,
        arrivalLocation: arrival.displayName,
        narrativeRegion: region,
        flightDurationMinutes: durationMinutes,
        flightProgress: 100,
        estimatedDistanceKm: distanceKm,
        routeDirection: activeFlight.routeDirection,
        socialCue,
        style: broadcastStyle
      });
    } catch {
      captainBroadcast = `\u6B61\u8FCE\u62B5\u9054 ${arrival.displayName}\u3002\u672C\u6B21\u822A\u73ED\u81EA ${activeFlight.departureLocation} \u51FA\u767C\uFF0C\u98DB\u884C\u6642\u9577 ${durationMinutes} \u5206\u9418\u3002${socialCue.cueText}`;
    }
    await updateFlight(activeFlight.notionId, {
      status: "landed",
      landingTime,
      flightDurationMinutes: durationMinutes,
      estimatedFlightDistanceKm: Math.round(distanceKm),
      arrivalLocation: arrival.displayName,
      arrivalLatitude: arrival.latitude,
      arrivalLongitude: arrival.longitude,
      flightProgress: 100,
      narrativeRegion: "arrival_harbor",
      captainBroadcastStyle: broadcastStyle,
      captainBroadcast,
      socialCueType: socialCue.cueType,
      socialCueText: socialCue.cueText,
      relatedPassenger: socialCue.relatedPassenger ?? ""
    });
    await updatePassengerStatus(passenger.notionId, {
      status: "landed",
      currentLocation: arrival.displayName,
      currentLatitude: arrival.latitude,
      currentLongitude: arrival.longitude,
      lastFlightId: activeFlight.flightId
    });
    res.json({
      flight: {
        ...activeFlight,
        status: "landed",
        landingTime,
        flightDurationMinutes: durationMinutes,
        estimatedFlightDistanceKm: Math.round(distanceKm),
        arrivalLocation: arrival.displayName,
        arrivalLatitude: arrival.latitude,
        arrivalLongitude: arrival.longitude,
        flightProgress: 100,
        narrativeRegion: "arrival_harbor",
        captainBroadcast,
        socialCueType: socialCue.cueType,
        socialCueText: socialCue.cueText,
        relatedPassenger: socialCue.relatedPassenger
      }
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.get("/api/flight/progress", async (req, res) => {
  try {
    const passengerId = req.query.passengerId;
    if (!passengerId) {
      res.status(400).json({ error: "\u8ACB\u63D0\u4F9B passengerId\u3002" });
      return;
    }
    const flight = await getActiveFlight(passengerId);
    if (!flight) {
      res.json({ activeFlight: null });
      return;
    }
    const progress = calculateFlightProgress(flight.takeoffTime);
    const region = getNarrativeRegion(progress);
    res.json({ activeFlight: { ...flight, flightProgress: progress, narrativeRegion: region } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.get("/api/board", async (req, res) => {
  try {
    const groupId = req.query.groupId;
    if (!groupId) {
      res.status(400).json({ error: "\u8ACB\u63D0\u4F9B groupId\u3002" });
      return;
    }
    const flights = await getGroupFlights(groupId);
    const enriched = flights.map((f) => {
      if (f.status !== "in_flight") return f;
      const progress = calculateFlightProgress(f.takeoffTime);
      const region = getNarrativeRegion(progress);
      return { ...f, flightProgress: progress, narrativeRegion: region };
    });
    res.json({ flights: enriched });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.get("/api/workshop", async (_req, res) => {
  try {
    const activeFlights = await getAllActiveFlights();
    const groupIds = new Set(activeFlights.map((f) => f.groupId));
    const regionCounts = {};
    for (const f of activeFlights) {
      const progress = calculateFlightProgress(f.takeoffTime);
      const region = getNarrativeRegion(progress);
      regionCounts[region] = (regionCounts[region] ?? 0) + 1;
    }
    const mostCommonRegion = Object.entries(regionCounts).sort((a, b) => b[1] - a[1])[0]?.[0];
    res.json({
      summary: {
        activeGroupCount: groupIds.size,
        totalInFlightCount: activeFlights.length,
        totalLandedCount: null,
        mostCommonRegion: mostCommonRegion ?? null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
app.post("/api/seed", async (_req, res) => {
  try {
    const result = await seedDestinations();
    res.json({
      message: `\u5B8C\u6210\u3002\u65B0\u589E ${result.seeded} \u500B\u57CE\u5E02\uFF0C\u7565\u904E ${result.skipped} \u500B\u5DF2\u5B58\u5728\u7684\u57CE\u5E02\u3002`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "\u672A\u77E5\u932F\u8AA4" });
  }
});
if (!process.env.VERCEL) {
  const PORT = process.env.PORT ?? 3e3;
  app.listen(PORT, () => {
    console.log(`\u2708  \u7526\u9192\u822A\u73ED server running \u2192 http://localhost:${PORT}`);
  });
}
var server_default = app;

// handlers/catchall.ts
var catchall_default = server_default;
//# sourceMappingURL=%5B...slug%5D.js.map
