import { describe, expect, it } from "vitest";
import type { NotificationEvent } from "@/app/lib/notifications/service";
import {
  dedupeEventsPerUser,
  eventToPush,
  type PushPayload,
} from "@/app/lib/push/payload";

describe("eventToPush", () => {
  it("maps bet_won to the win copy + the market url", () => {
    const event: NotificationEvent = {
      type: "bet_won",
      userId: "u1",
      marketId: "m1",
      betId: "b1",
      questionHe: "מי ינצח בבחירות?",
      payout: 1500,
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "זכית בהימור!",
      body: "קיבלת 1,500 שקוינים · מי ינצח בבחירות?",
      url: "/market/m1",
    });
  });

  it("maps market_resolved to the resolution copy + the market url", () => {
    const event: NotificationEvent = {
      type: "market_resolved",
      userId: "u1",
      marketId: "m2",
      questionHe: "מי ינצח בבחירות?",
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "שוק שהימרת בו הוכרע",
      body: "מי ינצח בבחירות?",
      url: "/market/m2",
    });
  });

  it("maps suggestion_approved to the approval copy + the new market url", () => {
    const event: NotificationEvent = {
      type: "suggestion_approved",
      userId: "u1",
      suggestionId: "s1",
      marketId: "m3",
      questionHe: "האם יעבור התקציב?",
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "ההצעה שלך אושרה",
      body: "נפתח שוק חדש: האם יעבור התקציב?",
      url: "/market/m3",
    });
  });

  it("maps suggestion_rejected (no market) to the inbox url", () => {
    const event: NotificationEvent = {
      type: "suggestion_rejected",
      userId: "u1",
      suggestionId: "s2",
      questionHe: "האם יעבור התקציב?",
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "ההצעה שלך נדחתה",
      body: "האם יעבור התקציב?",
      url: "/notifications",
    });
  });
});

describe("dedupeEventsPerUser", () => {
  it("keeps only the higher-priority bet_won when one user wins a resolution", () => {
    const betWon: NotificationEvent = {
      type: "bet_won",
      userId: "u1",
      marketId: "m1",
      betId: "b1",
      questionHe: "מי ינצח?",
      payout: 100,
    };
    const resolved: NotificationEvent = {
      type: "market_resolved",
      userId: "u1",
      marketId: "m1",
      questionHe: "מי ינצח?",
    };

    const winnerFirst = dedupeEventsPerUser([betWon, resolved]);
    expect(winnerFirst).toEqual([betWon]);

    // order-independent: market_resolved arriving first must not win
    const resolvedFirst = dedupeEventsPerUser([resolved, betWon]);
    expect(resolvedFirst).toEqual([betWon]);
  });

  it("keeps one event per distinct user", () => {
    const u1: NotificationEvent = {
      type: "market_resolved",
      userId: "u1",
      marketId: "m1",
      questionHe: "שאלה 1",
    };
    const u2: NotificationEvent = {
      type: "market_resolved",
      userId: "u2",
      marketId: "m2",
      questionHe: "שאלה 2",
    };

    const result = dedupeEventsPerUser([u1, u2]);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([u1, u2]));
  });

  it("passes single events through unchanged", () => {
    const only: NotificationEvent = {
      type: "suggestion_rejected",
      userId: "u9",
      suggestionId: "s1",
      questionHe: "שאלה",
    };
    expect(dedupeEventsPerUser([only])).toEqual([only]);
  });

  it("returns an empty array for no events", () => {
    expect(dedupeEventsPerUser([])).toEqual([]);
  });
});
