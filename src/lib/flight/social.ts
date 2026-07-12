import type { Flight, SocialCue } from '../../types';
import { generateSocialCueText } from '../ai/social-cue';
import {
  buildGroupSocialSummary,
  collectSocialCueCandidates,
  pickPrioritySocialCueCandidate,
  shouldAttachGroupSummary,
  soloSocialCueCandidate,
  type CurrentFlightContext,
} from './social-candidates';

export type { CurrentFlightContext };

/**
 * 每次只選一則主要雷達訊號（primary cue）；
 * 人數多時另附一句 rule-based group summary，不把所有隊友列成監控報告。
 */
export async function resolveGroupSocialCue(
  current: CurrentFlightContext,
  groupFlights: Flight[]
): Promise<SocialCue> {
  const candidates = collectSocialCueCandidates(current, groupFlights)
    .filter((candidate) => {
      const related = candidate.relatedPassenger?.trim();
      if (!related) return true;
      return related.toLowerCase() !== current.passengerName.trim().toLowerCase();
    });
  const picked = pickPrioritySocialCueCandidate(candidates, current.phase) ?? soloSocialCueCandidate();
  const cueText = await generateSocialCueText(picked, current.phase);
  const groupSummary = shouldAttachGroupSummary(picked.cueType)
    ? buildGroupSocialSummary(current, groupFlights)
    : null;

  return {
    cueType: picked.cueType,
    relatedPassenger: picked.relatedPassenger,
    cueText,
    groupSummary,
  };
}
