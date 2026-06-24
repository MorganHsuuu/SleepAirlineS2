import type { Flight, SocialCue, SocialCueType, NarrativeRegion } from '../../types';
import { areAdjacentRegions, REGION_DISPLAY } from './region';

interface CurrentFlightSnapshot {
  passengerId: string;
  narrativeRegion: NarrativeRegion;
  landingTime: string;
}

export function calculateGroupSocialCue(
  current: CurrentFlightSnapshot,
  groupFlights: Flight[]
): SocialCue {
  const others = groupFlights.filter((f) => f.passengerId !== current.passengerId);
  const inFlightOthers = others.filter((f) => f.status === 'in_flight');
  const landedOthers = others.filter((f) => f.status === 'landed' && f.landingTime != null);

  // Priority 1: same_region
  const sameRegion = inFlightOthers.find(
    (f) => f.narrativeRegion === current.narrativeRegion
  );
  if (sameRegion) {
    return makeCue('same_region', sameRegion.passengerName,
      `${sameRegion.passengerName} 也和你一起穿越 ${REGION_DISPLAY[current.narrativeRegion]}。`
    );
  }

  // Priority 2: nearby_region
  const nearbyRegion = inFlightOthers.find(
    (f) => areAdjacentRegions(f.narrativeRegion, current.narrativeRegion)
  );
  if (nearbyRegion) {
    return makeCue('nearby_region', nearbyRegion.passengerName,
      `${nearbyRegion.passengerName} 在相鄰的 ${REGION_DISPLAY[nearbyRegion.narrativeRegion]} 飛行。`
    );
  }

  // Priority 3: relay_flight (you landed, others still flying)
  if (inFlightOthers.length > 0) {
    const other = inFlightOthers[0];
    return makeCue('relay_flight', other.passengerName,
      `你已降落，${other.passengerName} 仍在繼續這趟夜間飛行。`
    );
  }

  // Priority 4: same_sky (others were also in_flight this session — covered by relay_flight above)
  // included for completeness but practically subsumed; emit solo if we reach here without in_flight others

  // Priority 5: early_landing (others landed before you)
  const earlierLanders = landedOthers.filter(
    (f) => f.landingTime! < current.landingTime
  );
  if (earlierLanders.length > 0) {
    const other = earlierLanders[0];
    return makeCue('early_landing', other.passengerName,
      `${other.passengerName} 比你更早降落了。`
    );
  }

  // Priority 6: late_landing (others landed after you — use for flight board updates)
  const laterLanders = landedOthers.filter(
    (f) => f.landingTime! > current.landingTime
  );
  if (laterLanders.length > 0) {
    const other = laterLanders[0];
    return makeCue('late_landing', other.passengerName,
      `${other.passengerName} 在你降落後繼續飛行並已抵達。`
    );
  }

  // Priority 7: solo
  return makeCue('solo', null, '今晚你獨自飛行。沒有偵測到同組的近期航班。');
}

function makeCue(
  cueType: SocialCueType,
  relatedPassenger: string | null,
  cueText: string
): SocialCue {
  return { cueType, relatedPassenger, cueText };
}
