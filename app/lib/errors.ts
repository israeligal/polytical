export class MissingUserError extends Error {
  constructor() {
    super("Missing userId");
    this.name = "MissingUserError";
  }
}
export class MarketNotFoundError extends Error { constructor() { super("Market not found"); this.name = "MarketNotFoundError"; } }
export class MarketClosedError extends Error { constructor() { super("Market is not open"); this.name = "MarketClosedError"; } }
export class InvalidOutcomeError extends Error { constructor() { super("Outcome not in market"); this.name = "InvalidOutcomeError"; } }
export class AlreadyResolvedError extends Error { constructor() { super("Market already resolved/voided"); this.name = "AlreadyResolvedError"; } }
export class NotAdminError extends Error { constructor() { super("Admin only"); this.name = "NotAdminError"; } }
export class EmptyCommentError extends Error { constructor() { super("Comment is empty"); this.name = "EmptyCommentError"; } }
export class CommentTooLongError extends Error { constructor() { super("Comment too long"); this.name = "CommentTooLongError"; } }
export class CommentNotFoundError extends Error { constructor() { super("Comment not found"); this.name = "CommentNotFoundError"; } }
export class SuggestionTooShortError extends Error { constructor() { super("Suggestion too short"); this.name = "SuggestionTooShortError"; } }
export class SuggestionTooLongError extends Error { constructor() { super("Suggestion too long"); this.name = "SuggestionTooLongError"; } }
export class InvalidCategoryError extends Error { constructor() { super("Invalid category"); this.name = "InvalidCategoryError"; } }
export class SuggestionNotFoundError extends Error { constructor() { super("Suggestion not found"); this.name = "SuggestionNotFoundError"; } }
export class AlreadyReviewedError extends Error { constructor() { super("Suggestion already reviewed"); this.name = "AlreadyReviewedError"; } }
export class NotDuelableMarketError extends Error { constructor() { super("Market cannot be dueled (group motion)"); this.name = "NotDuelableMarketError"; } }
export class UnknownPoliticianError extends Error { constructor() { super("Politician not found"); this.name = "UnknownPoliticianError"; } }
export class ClosePastError extends Error { constructor() { super("Close date must be in the future"); this.name = "ClosePastError"; } }
export class CloseRequiredError extends Error { constructor() { super("Proposed close date is required"); this.name = "CloseRequiredError"; } }
export class CloseTooFarError extends Error { constructor() { super("Proposed close date is too far in the future"); this.name = "CloseTooFarError"; } }
export class SourceNoteTooLongError extends Error { constructor() { super("Resolution source note too long"); this.name = "SourceNoteTooLongError"; } }
export class DailySuggestionLimitError extends Error { constructor() { super("Daily suggestion limit reached"); this.name = "DailySuggestionLimitError"; } }
export class NotificationNotFoundError extends Error { constructor() { super("Notification not found"); this.name = "NotificationNotFoundError"; } }
// --- Push notifications ---
export class PushSubscriptionNotFoundError extends Error { constructor() { super("Push subscription not found"); this.name = "PushSubscriptionNotFoundError"; } }
export class InvalidPushSubscriptionError extends Error { constructor() { super("Invalid push subscription"); this.name = "InvalidPushSubscriptionError"; } }
export class InvalidPushPrefError extends Error { constructor() { super("Invalid push preference category"); this.name = "InvalidPushPrefError"; } }
// --- Onboarding + card collection (Phase 2) ---
export class InvalidHandleError extends Error { constructor() { super("Handle must be 3–20 chars, all-latin or all-hebrew: letters, digits, _"); this.name = "InvalidHandleError"; } }
export class HandleTakenError extends Error { constructor() { super("Handle already taken"); this.name = "HandleTakenError"; } }
export class HandleGenerationError extends Error { constructor() { super("Could not generate an available handle"); this.name = "HandleGenerationError"; } }
export class InvalidArenaError extends Error { constructor() { super("Invalid arena"); this.name = "InvalidArenaError"; } }
export class HandleRequiredError extends Error { constructor() { super("Handle must be set before onboarding completes"); this.name = "HandleRequiredError"; } }
export class AlreadyOnboardedError extends Error { constructor() { super("User already onboarded"); this.name = "AlreadyOnboardedError"; } }
export class AlreadyOwnedError extends Error { constructor() { super("Card already collected"); this.name = "AlreadyOwnedError"; } }
// --- Caricature avatar ---
export class InvalidCaricatureError extends Error { constructor() { super("Caricature must be a PNG/JPEG/WebP image under the size limit"); this.name = "InvalidCaricatureError"; } }
// --- Seasons (accuracy track) ---
export class SeasonEndedError extends Error { constructor() { super("Season has ended"); this.name = "SeasonEndedError"; } }
export class NoActiveSeasonError extends Error { constructor() { super("No active season"); this.name = "NoActiveSeasonError"; } }
export class AnotherSeasonActiveError extends Error { constructor() { super("Another season is already active"); this.name = "AnotherSeasonActiveError"; } }
export class SeasonNotFoundError extends Error { constructor() { super("Season not found"); this.name = "SeasonNotFoundError"; } }
export class InvalidSeasonError extends Error { constructor() { super("Invalid season definition"); this.name = "InvalidSeasonError"; } }
// --- Knesset votes ---
export class UnverifiedMappingsError extends Error { constructor(count: number) { super(`${count} MK name mappings are unverified — sign off before attribution`); this.name = "UnverifiedMappingsError"; } }
export class VoteNotFoundError extends Error { constructor() { super("Vote not found"); this.name = "VoteNotFoundError"; } }
export class VoteNotStanceableError extends Error { constructor() { super("Stances attach only to an item's decisive vote"); this.name = "VoteNotStanceableError"; } }
// --- Agenda stances (pre-voting on upcoming bills) ---
export class AgendaItemNotFoundError extends Error { constructor() { super("Agenda item not found"); this.name = "AgendaItemNotFoundError"; } }
export class AgendaItemNotStanceableError extends Error { constructor() { super("Pre-vote stances attach only to an announced agenda item"); this.name = "AgendaItemNotStanceableError"; } }
/** Scope guard for user-owned reads/writes — call as the FIRST thing inside a
 *  repo function's where-clause: `eq(t.userId, requireUserId(userId))`. */
export function requireUserId(userId: string): string {
  if (!userId) throw new MissingUserError();
  return userId;
}
// --- Multi-outcome suggestions ---
export class OutcomeCountError extends Error { constructor() { super("A multi suggestion needs 2-8 outcomes"); this.name = "OutcomeCountError"; } }
export class OutcomeLabelError extends Error { constructor() { super("Outcome labels must be 1-40 chars and unique"); this.name = "OutcomeLabelError"; } }
// --- Groups / קואליציה ---
export class GroupNotFoundError extends Error { constructor() { super("Group not found"); this.name = "GroupNotFoundError"; } }
export class NotGroupMemberError extends Error { constructor() { super("Not a member of this group"); this.name = "NotGroupMemberError"; } }
export class InsufficientGroupRoleError extends Error { constructor() { super("Insufficient group role"); this.name = "InsufficientGroupRoleError"; } }
export class AlreadyMemberError extends Error { constructor() { super("Already a member of this group"); this.name = "AlreadyMemberError"; } }
export class InvalidInviteCodeError extends Error { constructor() { super("Invalid or expired invite code"); this.name = "InvalidInviteCodeError"; } }
export class GroupCapError extends Error { constructor() { super("Group limit reached"); this.name = "GroupCapError"; } }
export class GroupNameError extends Error { constructor() { super("Group name must be 2-40 chars"); this.name = "GroupNameError"; } }
