import { expect, test } from "vitest";
import { parseCsv } from "./odata";

test("parseCsv handles header, quoted commas, and Hebrew", () => {
  const csv = [
    "PersonID,mk_individual_name_eng,note",
    '30749,"Asher, Yaakov","סיעה"',
    "48,Yardena,",
  ].join("\n");
  const rows = parseCsv(csv);
  expect(rows[0].PersonID).toBe("30749");
  expect(rows[0].mk_individual_name_eng).toBe("Asher, Yaakov");
  expect(rows[1].note).toBe("");
});
