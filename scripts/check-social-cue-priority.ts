/**
 * Social cue priority + group summary contract checks.
 * Run: npx tsx scripts/check-social-cue-priority.ts
 */
import {
  buildGroupSocialSummary,
  pickPrioritySocialCueCandidate,
  type CurrentFlightContext,
  type SocialCueCandidate,
} from '../src/lib/flight/social-candidates';
import { composeSocialTakeaway } from '../src/lib/ai/social-takeaway';
import type { Flight } from '../src/types';

let failed = 0;

function assert(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failed += 1;
}

function baseCtx(phase: 'takeoff' | 'landing'): CurrentFlightContext {
  return {
    passengerId: 'p_self',
    passengerName: 'Self',
    departureLocation: 'Taipei, Taiwan',
    departureLatitude: 25.03,
    departureLongitude: 121.56,
    arrivalLocation: phase === 'landing' ? 'Kyoto, Japan' : null,
    arrivalLatitude: phase === 'landing' ? 35.01 : null,
    arrivalLongitude: phase === 'landing' ? 135.77 : null,
    routeDirection: 'eastbound',
    takeoffTime: '2026-07-11T16:00:00.000Z',
    landingTime: phase === 'landing' ? '2026-07-11T20:00:00.000Z' : null,
    flightProgress: phase === 'landing' ? 100 : 0,
    phase,
  };
}

function flight(partial: Partial<Flight> & Pick<Flight, 'passengerId' | 'passengerName' | 'status'>): Flight {
  return {
    notionId: partial.notionId ?? partial.passengerId,
    flightId: partial.flightId ?? `f_${partial.passengerId}`,
    passengerId: partial.passengerId,
    passengerName: partial.passengerName,
    groupId: '0001',
    status: partial.status,
    departureLocation: partial.departureLocation ?? 'Taipei, Taiwan',
    departureLatitude: partial.departureLatitude ?? 25.03,
    departureLongitude: partial.departureLongitude ?? 121.56,
    arrivalLocation: partial.arrivalLocation ?? null,
    arrivalLatitude: partial.arrivalLatitude ?? null,
    arrivalLongitude: partial.arrivalLongitude ?? null,
    takeoffTime: partial.takeoffTime ?? '2026-07-11T15:00:00.000Z',
    landingTime: partial.landingTime ?? null,
    flightDurationMinutes: partial.flightDurationMinutes ?? 120,
    estimatedFlightDistanceKm: partial.estimatedFlightDistanceKm ?? 1800,
    flightProgress: partial.flightProgress ?? (partial.status === 'landed' ? 100 : 40),
    narrativeRegion: partial.narrativeRegion ?? 'pacific',
    routeDirection: partial.routeDirection ?? 'eastbound',
    takeoffBroadcastStyle: null,
    takeoffBroadcast: null,
    captainBroadcast: null,
    socialCueType: null,
    socialCueText: null,
    relatedPassenger: null,
    createdAt: '2026-07-11T15:00:00.000Z',
    updatedAt: '2026-07-11T15:00:00.000Z',
  };
}

const mixed: SocialCueCandidate[] = [
  { cueType: 'solo', relatedPassenger: null, facts: {} },
  { cueType: 'squad_in_sky', relatedPassenger: null, facts: { inFlightCount: 2, landedCount: 1 } },
  { cueType: 'teammate_arrival', relatedPassenger: 'Amy', facts: { teammateName: 'Amy', eventTimeMs: 9 } },
  { cueType: 'route_convergence', relatedPassenger: 'Ben', facts: { teammateName: 'Ben', eventTimeMs: 1 } },
  { cueType: 'fresh_arrival', relatedPassenger: 'Cara', facts: { teammateName: 'Cara', eventTimeMs: 99 } },
  { cueType: 'relay_flight', relatedPassenger: 'Dan', facts: { teammateName: 'Dan', eventTimeMs: 50 } },
];

{
  const picked = pickPrioritySocialCueCandidate(mixed, 'landing', () => 0);
  assert(
    'landing prefers route_convergence over newer cues',
    picked?.cueType === 'route_convergence',
    picked?.cueType
  );
}

{
  const takeoffPool: SocialCueCandidate[] = [
    { cueType: 'first_of_night', relatedPassenger: null, facts: {} },
    { cueType: 'same_departure', relatedPassenger: 'Amy', facts: { teammateName: 'Amy' } },
    { cueType: 'teammate_in_sky', relatedPassenger: 'Ben', facts: { teammateName: 'Ben' } },
    { cueType: 'squad_in_sky', relatedPassenger: null, facts: { inFlightCount: 2, landedCount: 0 } },
  ];
  const picked = pickPrioritySocialCueCandidate(takeoffPool, 'takeoff', () => 0.9);
  assert(
    'takeoff prefers teammate_in_sky over lower tiers',
    picked?.cueType === 'teammate_in_sky',
    picked?.cueType
  );
}

{
  const earlyLate: SocialCueCandidate[] = [
    { cueType: 'squad_in_sky', relatedPassenger: null, facts: { inFlightCount: 0, landedCount: 2 } },
    { cueType: 'early_landing', relatedPassenger: 'Amy', facts: { teammateName: 'Amy' } },
    { cueType: 'late_landing', relatedPassenger: 'Ben', facts: { teammateName: 'Ben' } },
  ];
  const first = pickPrioritySocialCueCandidate(earlyLate, 'landing', () => 0);
  const second = pickPrioritySocialCueCandidate(earlyLate, 'landing', () => 0.99);
  assert(
    'early/late landing share one priority tier',
    !!first && !!second
      && ['early_landing', 'late_landing'].includes(first.cueType)
      && ['early_landing', 'late_landing'].includes(second.cueType)
      && first.relatedPassenger !== second.relatedPassenger,
    `${first?.cueType}/${second?.cueType}`
  );
}

{
  const few = [
    flight({ passengerId: 'p_self', passengerName: 'Self', status: 'in_flight' }),
    flight({ passengerId: 'p1', passengerName: 'A', status: 'in_flight' }),
    flight({ passengerId: 'p2', passengerName: 'B', status: 'landed', landingTime: '2026-07-11T18:00:00.000Z', arrivalLocation: 'Kyoto, Japan' }),
  ];
  const summary = buildGroupSocialSummary(baseCtx('takeoff'), few);
  assert('small group skips group summary', summary == null, String(summary));
}

{
  const many = [
    flight({ passengerId: 'p_self', passengerName: 'Self', status: 'in_flight' }),
    flight({ passengerId: 'p1', passengerName: 'A', status: 'in_flight', flightProgress: 30 }),
    flight({ passengerId: 'p2', passengerName: 'B', status: 'in_flight', flightProgress: 55 }),
    flight({ passengerId: 'p3', passengerName: 'C', status: 'landed', landingTime: '2026-07-11T18:00:00.000Z', arrivalLocation: 'Osaka, Japan' }),
    flight({ passengerId: 'p4', passengerName: 'D', status: 'landed', landingTime: '2026-07-11T19:00:00.000Z', arrivalLocation: 'Tokyo, Japan' }),
  ];
  const summary = buildGroupSocialSummary(baseCtx('landing'), many);
  assert('large group adds group summary', !!summary && summary.length > 0, String(summary));
  assert(
    'group summary does not list every teammate by name',
    !!summary && !/A.*B.*C|Amy|Ben|Cara/.test(summary) && !/排行|比較|睡得更|睡眠狀態/.test(summary),
    String(summary)
  );
  assert(
    'group summary sounds like a radar skim',
    !!summary && /雷達|小隊|夜航|雲上|著陸|在飛/.test(summary),
    String(summary)
  );
}

{
  const one = composeSocialTakeaway('Amy 還在飛，你不是唯一醒著的人');
  assert('takeaway stays one sentence without group summary', !one.includes('。', one.indexOf('。') + 1) && /。$/.test(one), one);

  const two = composeSocialTakeaway(
    'Amy 還在飛，你不是唯一醒著的人',
    '今晚小隊有 3 班還在雲上'
  );
  const sentences = two.split(/[。！？]/).filter(Boolean);
  assert('takeaway with group summary is at most two sentences', sentences.length === 2, two);
  assert('composed takeaway keeps primary then group summary', two.startsWith('Amy') && /雲上/.test(two), two);
}

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exitCode = 1;
} else {
  console.log('\n✓ social cue priority checks passed');
}
