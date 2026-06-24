export type PassengerStatus = 'not_started' | 'in_flight' | 'landed';
export type FlightStatus = 'boarding' | 'in_flight' | 'landed' | 'cancelled';
export type NarrativeRegion =
  | 'departure_clouds'
  | 'pacific_drift'
  | 'deep_night_current'
  | 'dawn_corridor'
  | 'arrival_harbor';
export type RouteDirection =
  | 'auto'
  | 'eastbound'
  | 'westbound'
  | 'northbound'
  | 'southbound'
  | 'northeast'
  | 'northwest'
  | 'southeast'
  | 'southwest'
  | 'circular'
  | 'unknown';
export type DirectionSource =
  | 'system_auto'
  | 'participant_design'
  | 'mood_input'
  | 'weather_input'
  | 'team_signal'
  | 'physical_interaction'
  | 'random_card'
  | 'future_body_data';
export type BroadcastStyle =
  | 'formal_captain'
  | 'poetic'
  | 'playful'
  | 'flight_attendant'
  | 'radio_host'
  | 'custom';
export type SocialCueType =
  | 'same_sky'
  | 'same_region'
  | 'nearby_region'
  | 'relay_flight'
  | 'early_landing'
  | 'late_landing'
  | 'solo';

export interface Passenger {
  notionId: string;
  passengerId: string;
  name: string;
  groupId: string;
  deviceId: string;
  currentLocation: string;
  currentLatitude: number;
  currentLongitude: number;
  lastFlightId: string | null;
  status: PassengerStatus;
  createdAt: string;
  updatedAt: string;
}

export interface Flight {
  notionId: string;
  flightId: string;
  passengerId: string;
  passengerName: string;
  groupId: string;
  deviceId: string;
  status: FlightStatus;
  departureLocation: string;
  departureLatitude: number;
  departureLongitude: number;
  arrivalLocation: string | null;
  arrivalLatitude: number | null;
  arrivalLongitude: number | null;
  takeoffTime: string;
  landingTime: string | null;
  flightDurationMinutes: number | null;
  estimatedFlightDistanceKm: number | null;
  flightProgress: number;
  narrativeRegion: NarrativeRegion;
  routeDirection: RouteDirection;
  directionSource: DirectionSource;
  directionNote: string | null;
  takeoffBroadcastStyle: BroadcastStyle | null;
  takeoffBroadcast: string | null;
  captainBroadcastStyle: BroadcastStyle | null;
  captainBroadcast: string | null;
  socialCueType: SocialCueType | null;
  socialCueText: string | null;
  relatedPassenger: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Destination {
  notionId?: string;
  destinationId: string;
  city: string;
  country: string;
  displayName: string;
  latitude: number;
  longitude: number;
  airportCode: string | null;
  region: string;
  availableForLanding: boolean;
}

export interface DestinationResult extends Destination {
  distanceKm: number;
}

export interface SocialCue {
  cueType: SocialCueType;
  relatedPassenger: string | null;
  cueText: string;
}

export interface WorkshopSummary {
  activeGroupCount: number;
  totalInFlightCount: number;
  totalLandedCount: number;
  mostCommonRegion: NarrativeRegion | null;
}
