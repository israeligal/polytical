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
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "ניחשת נכון! 🎯",
      body: "צדקת בניחוש · מי ינצח בבחירות?",
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
      title: "תחזית שניחשת בה הוכרעה",
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
      body: "נפתחה תחזית חדשה: האם יעבור התקציב?",
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

  it("maps market_voided to the void copy + the market url", () => {
    const event: NotificationEvent = {
      type: "market_voided",
      userId: "u1",
      marketId: "m4",
      questionHe: "האם יעבור התקציב?",
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "התחזית בוטלה",
      body: "הניחוש שלך בוטל · האם יעבור התקציב?",
      url: "/market/m4",
    });
  });

  it("maps market_closing_soon to the urgency copy + the market url", () => {
    const event: NotificationEvent = {
      type: "market_closing_soon",
      userId: "u1",
      marketId: "m5",
      questionHe: "האם יעבור התקציב?",
    };
    expect(eventToPush(event)).toEqual<PushPayload>({
      title: "תחזית נסגרת בקרוב ⏰",
      body: "הספיקו לנחש לפני הסגירה · האם יעבור התקציב?",
      url: "/market/m5",
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
