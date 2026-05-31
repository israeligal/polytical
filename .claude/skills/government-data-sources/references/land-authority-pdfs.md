# Land Authority Plan PDFs (apps.land.gov.il)

**THIS IS A GOLDMINE — freely accessible, no auth needed!**

```
GET https://apps.land.gov.il/IturTabotData/takanonim/telmer/{planFileId}.pdf
```

- Returns the full plan regulation document (תקנון) as PDF
- **Contains developer name, architect, stakeholders, plan details**
- The `planFileId` is NOT the same as the plan number — it comes from MAVAT/XPLAN data
- Verified: returns HTTP 200 with `Content-Type: application/pdf`

**What's inside the PDF (extracted with `pdftotext`):**
- Section 1.8: "בעלי עניין / בעלי זכויות בקרקע / עורך התכנית ובעלי מקצוע"
  - 1.8.1: "מגיש התכנית" (plan submitter)
  - "יזם" (developer) — **THIS IS THE DEVELOPER NAME**
  - "שם תאגיד" (company name) — e.g., "מצלאוי חברה לבנין בע"מ"
  - "אדריכל" (architect), "עורך ראשי" (lead author)
- Full plan regulations, zoning rules, building heights, parking requirements

**Example:** Plan 502-0196659 (Rothschild Bat Yam) → PDF ID 5050655
- Developer: מצלאוי חברה לבנין בע"מ
- Architect: D.S. Urban Buildings + UN Studio

**How to find the PDF ID:**
- From entitiesByPoint layer 14: `מזהה תכנית` field gives the MAVAT plan ID
- The PDF file ID is a different number — may need mapping through XPLAN or MAVAT

**Status:** NOT integrated as a tool. Could build a `queryPlanDocument` tool that downloads + parses PDFs at query time.

## Verified examples (April 2026)

Plan 502-0749986 (כט בנובמבר, בת ים):
- **Regulations PDF:** `https://apps.land.gov.il/IturTabotData/takanonim-h/telmer/5050876.pdf` (note: `takanonim-h`, NOT `takanonim`)
- **Economic opinion PDF:** `https://apps.land.gov.il/IturTabotData/nispachim/telmer/5050876/100/חוות%20דעת%20כלכלית.pdf`
- **Nispachim directory:** `https://apps.land.gov.il/IturTabotData/nispachim/telmer/5050876/` (returns 200)
- Section 1.8.2: `יזם` → Section 1.8.3: `שם תאגיד: אלמוג פינוי בינוי בע"מ`
- Section 1.8.5: `עורך ראשי: אילן פיבקו`, `אדריכלים: קו אדריכלות`

**URL patterns discovered:**
- Regulations: `takanonim-h/{region}/{fileId}.pdf` (the `-h` suffix is for Hebrew version)
- Annexes: `nispachim/{region}/{fileId}/{docCode}/{docName}.pdf`
- Region codes: `telmer` (Tel Aviv district), `haifa`, `merkaz`, etc.

**fileId mapping problem (unsolved):** The `fileId` (e.g., 5050876) is NOT derivable from `mp_id` (5001003681), `pl_number` (502-0749986), `pl_order_print_version` (40), or any XPLAN/Plan Annexes field. Known ways to find it:
1. MAVAT SV4 `rsPlanDocs` array contains attachment IDs (requires reCAPTCHA)
2. Web search for `"{planNumber}"` often returns the Land Authority URL with fileId
3. The MAVAT plan page URL links to the PDF (requires browser access)
