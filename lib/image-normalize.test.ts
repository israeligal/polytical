import { expect, test } from "vitest";
import { coverSquareCrop } from "@/lib/image-normalize";

test("landscape: crops a centered square the height tall, offset on x", () => {
  expect(coverSquareCrop({ srcW: 200, srcH: 100 })).toEqual({ sx: 50, sy: 0, size: 100 });
});

test("portrait: crops a centered square the width wide, offset on y", () => {
  expect(coverSquareCrop({ srcW: 100, srcH: 200 })).toEqual({ sx: 0, sy: 50, size: 100 });
});

test("square: no crop, no offset", () => {
  expect(coverSquareCrop({ srcW: 120, srcH: 120 })).toEqual({ sx: 0, sy: 0, size: 120 });
});

test("odd overflow floors the centered offset", () => {
  expect(coverSquareCrop({ srcW: 201, srcH: 100 })).toEqual({ sx: 50, sy: 0, size: 100 });
});

test("zero dimension yields an empty crop (no negative size)", () => {
  expect(coverSquareCrop({ srcW: 0, srcH: 100 })).toEqual({ sx: 0, sy: 50, size: 0 });
});
