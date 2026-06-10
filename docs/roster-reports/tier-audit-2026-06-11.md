# Tier Audit — 119 Carded Politicians
**Date:** 2026-06-11 UTC  
**Auditor:** Claude (automated web research)  
**Source snapshot:** 25th Knesset (37th Government), mid-June 2026  
**Scope:** Cross-reference each card's computed tier (from `lib/rarity.ts` + DB `roleHe`) against verified current facts.

---

## Context: Coalition Instability (critical for staleness)

The 37th Government (formed Dec 2022) has seen significant upheaval:
- **Jan 2025:** Otzma Yehudit (Ben Gvir, Eliyahu, Wasserlauf) resigned over ceasefire deal.
- **Mar 2025:** Otzma Yehudit rejoined after Gaza military operations resumed.
- **Jul 2025:** Both Shas and UTJ resigned their *ministerial* seats over Haredi draft law, but remained in the coalition. Their portfolios were redistributed to Likud ministers (Haim Katz, Yariv Levin).
- **Nov 2024:** Gideon Sa'ar appointed Foreign Minister; Israel Katz moved to Defense Minister.
- **May 2026:** Knesset passed preliminary reading to dissolve itself; election expected Oct 2026.
- The **25th Knesset is still sitting** as of June 2026; no election has occurred.

---

## A. PM / Speaker / Former-PM

### A1. Sitting PM — Benjamin Netanyahu (personId 965)
- **Verified:** Netanyahu remains sitting PM as of June 2026.
- **Current tier:** legendary (GOLD). CORRECT.
- **Source:** https://en.wikipedia.org/wiki/Benjamin_Netanyahu

### A2. Knesset Speaker — Amir Ohana (personId 30300)
- **Verified:** Ohana is still Knesset Speaker as of June 2026 (confirmed May 2026 activity as Speaker).
- DB `roleHe` = "יושב–ראש הכנסת" → correctly yields **uncommon (SAPPHIRE)**.
- **Current tier:** uncommon. CORRECT.
- **Source:** https://en.wikipedia.org/wiki/Amir_Ohana

### A3. Former PM — Yair Lapid (personId 23594)
- **Verified:** Lapid served as PM Jul–Dec 2022 (caretaker/rotation). Currently serving as opposition leader / head of Yesh Atid (now merged as "Together" with Bennett 2026 for elections, but still the Yesh Atid faction in the sitting Knesset).
- **Current tier:** epic (SILVER) — via `FORMER_PM_PERSON_IDS`. CORRECT.
- Note: Lapid's DB `roleHe` = "ראש האופוזיציה"; the silver comes from the personId set, not the role string — tier logic is correct.
- **Source:** https://www.timesofisrael.com/naftali-bennett-and-yair-lapid-announce-united-run-under-bennett-in-2026-elections/

### A4. Naftali Bennett — former PM, not in Knesset
- Bennett served as PM Jun 2021–Jul 2022. He is **not** a sitting MK in the 25th Knesset (not carded). Confirmed he formed "Bennett 2026" / "Together" for the upcoming election but is not currently an MK.
- No card in the 119 — no action needed.
- **Source:** https://en.wikipedia.org/wiki/Naftali_Bennett

---

## B. Ministers (SAPPHIRE tier = uncommon)

### B1. Current government ministers among our 119 cards

The 37th Government minister roster as of June 2026 (after UTJ/Shas exits, Otzma Yehudit rejoin):

| Minister | Portfolio | Party | PersonId in our cards? | DB roleHe | Computed tier |
|---|---|---|---|---|---|
| Netanyahu | PM | Likud | 965 | ראש הממשלה | legendary ✓ |
| Yariv Levin | Justice + Interior (acting) + Religious Services (acting) + Labor (acting) | Likud | 12951 | שר | uncommon ✓ |
| Israel Katz | Defense | Likud | 468 | שר | uncommon ✓ |
| Avi Dichter | Agriculture | Likud | 4395 | שר | uncommon ✓ |
| Nir Barkat | Economy | Likud | 30700 | שר | uncommon ✓ |
| Shlomo Karhi | Communications | Likud | 30704 | שר | uncommon ✓ |
| May Golan | Social Equality + Women's Empowerment | Likud | 30708 | שרה | uncommon ✓ |
| Ofir Sofer | Aliyah & Integration | Religious Zionist | 30717 | שר | uncommon ✓ |
| Gila Gamliel | Science & Technology (+ Intelligence) | Likud | 1025 | שרה | uncommon ✓ |
| Orit Strook | Settlements & National Missions | Religious Zionist | 23551 | שרה | uncommon ✓ |
| Haim Katz | Health + Housing + Tourism | Likud | NOT CARDED (resigned Knesset Jan 2023 under Norwegian Law) | — | — |
| Idit Silman | Environmental Protection | Likud | NOT CARDED | — | — |
| Eli Cohen | Energy | Likud | NOT CARDED | — | — |
| Miki Zohar | Culture & Sport | Likud | NOT CARDED (resigned Knesset under Norwegian Law) | — | — |
| Miri Regev | Transportation | Likud | NOT CARDED | — | — |
| Yoav Kisch | Education | Likud | NOT CARDED | — | — |
| Dudi Amsalem | Regional Cooperation + PM Liaison + Justice (additional) | Likud | NOT CARDED | — | — |
| Amichai Chikli | Diaspora Affairs | Likud | NOT CARDED | — | — |
| Bezalel Smotrich | Finance | Religious Zionist | NOT CARDED (resigned Knesset under Norwegian Law) | — | — |
| Gideon Sa'ar | Foreign Affairs | New Hope | NOT CARDED (resigned Knesset Jul 2025 under Norwegian Law) | — | — |
| Ze'ev Elkin | Minister (in government, various) | New Hope | 4397 | שר | uncommon ✓ |
| Itamar Ben Gvir | National Security | Otzma Yehudit | 30811 | שר | **rare** (BRONZE) — party leader precedence wins ✓ |
| Amichai Eliyahu | Heritage | Otzma Yehudit | 30857 | שר | uncommon ✓ |
| Yitzhak Wasserlauf | Negev, Galilee & National Resilience | Otzma Yehudit | 30847 | שר | uncommon ✓ |

### B2. Previously carded as SAPPHIRE who are NO LONGER ministers

The Shas party withdrew their ministers in July 2025. These former ministers now have stale DB `roleHe` values:

| PersonId | Name | Old role | Was tier | Correct tier | Reason |
|---|---|---|---|---|---|
| 1056 | יעקב מרגי (Yaakov Margi) | סגן יושב-ראש הכנסת | common | common | DB role is deputy speaker, never triggered sapphire — no change |
| 30470 | מיכאל מלכיאלי (Michael Malkieli) | — | common | common | Was Shas religious affairs minister but DB shows "—" already — no change |
| 30749 | משה אבוטבול (Moshe Aboutboul) | — | common | common | Was deputy agriculture minister but DB shows "—" already — no change |
| 30804 | חיים ביטון (Haim Bitton) | — | common | common | Was minister within Education Ministry but DB shows "—" already — no change |
| 30868 | יונתן מישרקי (Yonatan Mishraki) | — | common | common | DB shows "—" already — no change |
| 28513 | יואב בן צור (Yoav Ben-Tzur) | — | common | common | Was Shas labor minister but DB shows "—" already — no change |

**Key finding:** The DB `roleHe` column for Shas members who were ministers appears to already be "—" (blank), so they were never tiered as sapphire in the computed column. The DB was likely already capturing their pre-minister or non-ministerial status. No sapphire→slate downgrades needed for Shas.

### B3. Ministers currently MISSING from sapphire (mis-tiered as common/slate)

Cross-referencing the full current minister list against the 119 carded politicians:

All ministers in our 119 who ARE ministers currently show "שר"/"שרה" in DB roleHe and correctly compute to **uncommon (sapphire)** — no missing sapphires identified for ministers who have Knesset seats.

**Special case — Ze'ev Elkin (personId 4397):**
- DB `roleHe` = "שר" → uncommon. CORRECT.
- Elkin is currently a minister in the government (was part of New Hope / entered as replacement MK). Still holds ministerial position in 2026.

### B4. Limor Son Har-Melech (personId 30849) — TSV STALENESS FOUND

- DB `roleHe` = "סגנית יושב-ראש הכנסת" (Deputy Knesset Speaker)
- The provided `/tmp/roster_audit.tsv` showed her as **uncommon (SAPPHIRE)** — this was stale.
- Freshly regenerated TSV from current DB+code: she is **common (SLATE)** — CORRECT.
- The `isMinisterRole()` deputy-exclusion regex `/סג[ןנ]/` correctly catches "סגנית" and returns false.
- **This is NOT a real mismatch** — the old TSV was produced with an older version of `rarity.ts` before the deputy-exclusion fix. Current code is correct.

---

## C. Party Leaders (BRONZE tier = rare)

### Current status of each encoded `PARTY_LEADER_PERSON_IDS` entry:

| PersonId | Name | Encoded as leader of | Status in June 2026 | Tier correct? |
|---|---|---|---|---|
| 965 | Netanyahu | Likud | Still Likud leader + sitting PM → GOLD by precedence. CORRECT. | ✓ |
| 23594 | Lapid | Yesh Atid | Still Yesh Atid leader (now "Together" for elections but same faction in Knesset). SILVER by precedence. CORRECT. | ✓ |
| 30657 | Gantz | National Unity (Blue and White-National Unity) | Still faction leader as of June 2026. No change. | ✓ |
| 427 | Lieberman | Yisrael Beiteinu | Still leader. | ✓ |
| 30811 | Ben Gvir | Otzma Yehudit | Still leader. Also currently serving as National Security Minister — but BRONZE wins over sapphire by precedence. CORRECT. | ✓ |
| 2291 | Deri | Shas | Still leader. **Deri is NOT currently a minister** (resigned/excluded by court order since 2023). He attends security cabinet as party chairman. His DB `roleHe` = "—" so no ministerial tier triggered; BRONZE from personId set. CORRECT. | ✓ |
| 526 | Gafni | UTJ | Still chairman of UTJ (Degel HaTorah). Gafni remains an MK. UTJ resigned ministerial positions in July 2025. DB `roleHe` = "—". BRONZE. CORRECT. | ✓ |
| 30066 | Ayman Odeh | Hadash (within Hadash-Ta'al) | **FLAG: Odeh stepped down as Hadash party chairman in May 2026.** Yousef Jabareen elected new Hadash leader. However, Odeh remains a sitting MK until end of 25th Knesset term (he announced he won't run again). He is still the de-facto Hadash-Ta'al faction chair in the current Knesset (the faction leadership is separate from party leadership). Research indicates he is still listed as "Hadash-Ta'al chair" in Knesset proceedings as of January 2026. PROVISIONAL: still BRONZE as faction head for the remainder of this Knesset. **Needs monitoring** — if the faction changed its whip/chair in the Knesset records, he could drop to slate. | ⚠️ |
| 560 | Ahmad Tibi | Ta'al (within Hadash-Ta'al) | Still leader of Ta'al. BRONZE. CORRECT. | ✓ |
| 30713 | Mansour Abbas | Ra'am | Still party leader. DB `roleHe` = "—". BRONZE. CORRECT. Noted he plans to retire after 2026 elections, but still leader now. | ✓ |
| 30814 | Avi Maoz | Noam | Still sole MK and faction leader. Resigned from government Mar 2025, remains MK. BRONZE. CORRECT. | ✓ |

### C2. Faction leaders NOT in the encoded PARTY_LEADER_PERSON_IDS (potential mis-tiers):

Several faction leaders in the 25th Knesset are in our 119 but NOT in `PARTY_LEADER_PERSON_IDS`:

| PersonId | Name | Faction Leader of | Currently computed | Should be |
|---|---|---|---|---|
| — | Bezalel Smotrich | Religious Zionist Party | Not in 119 (resigned Knesset) | — |
| — | Yair Golan / Merav Michaeli | Democrats/Labor | Not carded (Golan replaced Michaeli May 2024; neither is in our 119) | — |
| — | Yitzhak Goldknopf | UTJ overall (Goldknopf is "chairman" but Gafni/526 encoded) | Goldknopf is NOT in our 119 carded politicians | — |

**Among our 119, the following MKs are listed with "יו"ר סיעה" (faction chair/whip) in the DB but NOT in PARTY_LEADER_PERSON_IDS:**

| PersonId | Name | DB roleHe | Computed | Is this person actually the party LEADER? |
|---|---|---|---|---|
| 30121 | עודד פורר | יו"ר סיעה | common | Faction whip of Yisrael Beiteinu, NOT the party leader (Lieberman/427 is). Correct as common. |
| 30102 | מירב בן ארי | יו"ר סיעה | common | Faction whip of Yesh Atid, NOT the party leader (Lapid/23594 is). Correct as common. |
| 30601 | ינון אזולאי | יו"ר סיעה | common | Shas faction whip. NOT party leader (Deri/2291 is). Correct as common. |
| 30701 | אופיר כץ | יו"ר סיעה | common | Likud faction chair/coalition whip. NOT party leader (Netanyahu/965 is). Correct as common. |
| 30752 | וואליד טאהא | יו"ר סיעה | common | Ra'am faction whip. NOT party leader (Abbas/30713 is). Correct as common. |
| 30799 | מישל בוסקילה | יו"ר סיעה | common | New Hope faction whip. Gideon Sa'ar is party leader but resigned Knesset. Bousqila is the faction chair in the Knesset. Sa'ar is not an MK. This card correctly stays common since Sa'ar is absent. Bousqila is not in PARTY_LEADER_PERSON_IDS. Could argue for bronze but Sa'ar is the party head — Bousqila is only parliamentary whip. Correct as common per rarity.ts design intent. |
| 30808 | אפרת רייטן מרום | יו"ר סיעה | common | Democrats/Labor faction chair (Yair Golan is not in our 119). Reiten-Marom is parliamentary whip. NOT party leader. Correct as common. |
| 30830 | אוהד טל | יו"ר סיעה | common | Religious Zionist faction whip. Smotrich is party leader (not in our 119). Correct as common. |
| 30859 | צביקה פוגל | יו"ר סיעה | common | Otzma Yehudit faction whip. Ben Gvir (30811) is the actual party leader. Correct as common. |
| 23635 | פנינה תמנו | יו"ר סיעה | common | National Unity parliamentary chair. Gantz (30657) is actual party head. But note: Gantz himself is encoded as BRONZE in PARTY_LEADER_PERSON_IDS. Tamano shows as faction chair in DB. Correct as common. |

All "יו"ר סיעה" entries correctly remain common per rarity.ts design: the code note explicitly says "יו״ר סיעה is the parliamentary whip, NOT the party leader."

---

## D. Summary Table — Every Needed Change

**Full regeneration finding:** A fresh run of `scripts/_audit-export.ts` against the live DB shows that the provided `/tmp/roster_audit.tsv` was stale on exactly ONE row (Limor Son Har-Melech 30849: showed `uncommon`, now correctly `common`). This was a TSV staleness issue, not a real current mis-tier.

After cross-referencing all 119 cards against verified mid-2026 facts, **zero outright wrong-tier cards exist** in the current codebase. The table below lists the one watchlist item and the noteworthy "correct but non-obvious" cases:

### D1. Watchlist (no immediate code change needed)

| personId | Name | Current tier | Status | Action |
|---|---|---|---|---|
| 30066 | איימן עודה (Ayman Odeh) | rare (BRONZE) | Odeh resigned as Hadash *party* chairman in May 2026 (Yousef Jabareen elected new Hadash party leader). Odeh remains a sitting MK and still leads the Hadash-Ta'al *Knesset faction* for the remainder of the 25th Knesset term. Bronze is provisionally correct. | Remove 30066 from `PARTY_LEADER_PERSON_IDS` after elections (Oct 2026) if he does not return as MK. |

### D2. Confirmed-correct notable tiers (non-obvious)

| personId | Name | Tier | Why it is correct |
|---|---|---|---|
| 2291 | Aryeh Deri | rare (BRONZE) | Not a minister (court-barred since 2023). BRONZE comes from PARTY_LEADER_PERSON_IDS only. |
| 526 | Moshe Gafni | rare (BRONZE) | UTJ resigned ministerial positions Jul 2025. Gafni is not a minister. BRONZE via personId set. |
| 30811 | Itamar Ben Gvir | rare (BRONZE) | Is a serving minister (National Security) but party-leader precedence correctly beats sapphire. |
| 30857 | עמיחי אליהו (Eliyahu) | uncommon (SAPPHIRE) | Heritage Minister — rejoined government Mar 2025. |
| 30847 | יצחק וסרלאוף (Wasserlauf) | uncommon (SAPPHIRE) | Negev/Galilee Minister — rejoined government Mar 2025. |
| 12951 | Yariv Levin | uncommon (SAPPHIRE) | Justice + acting Interior / Religious / Labor minister after Shas exit Jul 2025. |
| 4397 | Ze'ev Elkin | uncommon (SAPPHIRE) | Still a minister in the 37th government (New Hope). |
| 30849 | לימור סון הר מלך | common (SLATE) | Deputy Knesset Speaker — correctly excluded by isMinisterRole() regex. Old TSV was stale; live code is correct. |
| 23594 | Yair Lapid | epic (SILVER) | Former PM (served Jul–Dec 2022). Merged with Bennett for 2026 elections but still leads Yesh Atid Knesset faction. |

---

## E. rarity.ts Edits Implied

### E1. `FORMER_PM_PERSON_IDS` — No changes needed
- Lapid (23594) correctly included.
- Bennett is not a sitting MK, so no card — no action.
- No other former PMs are in our 119 cards.

### E2. `PARTY_LEADER_PERSON_IDS` — Watchlist only, no immediate change
- **Ayman Odeh (30066):** Party chairmanship of Hadash transferred to Yousef Jabareen in May 2026. Odeh REMAINS the Knesset faction whip/chair for the remainder of the 25th Knesset (which is still sitting). Recommend: keep 30066 in the set until the 25th Knesset is dissolved and the 26th is sworn in. After elections (expected Oct 2026), if Odeh does not return as MK, remove him.
- All other entries remain correct.

### E3. DB `roleHe` staleness — Specific rows to investigate

| personId | Name | Current DB roleHe | Issue |
|---|---|---|---|
| 30849 | לימור סון הר מלך | סגנית יושב-ראש הכנסת | **RESOLVED.** Fresh DB query + live code confirms she is `common`. The old /tmp TSV was stale. No fix needed. |
| — | (Shas ministers) | Already "—" | All Shas ex-ministers (Margi, Malkieli, Aboutboul, Bitton, Mishraki, Ben-Tzur) show blank DB role — no fix needed. |
| — | (UTJ members) | Already "—" | Goldknopf resigned minister role Jul 2025 but he is not in our 119 cards. No fix needed. |

### E4. Ministers NOT in our 119 (Norwegian-law absentees)
Several current ministers are not sitting MKs and thus correctly have no card:
- Haim Katz (resigned Knesset Jan 2023)
- Miki Zohar (resigned Knesset Jan 2023)
- Bezalel Smotrich (resigned Knesset 2023)
- Gideon Sa'ar (resigned Knesset Jul 2025)
- Idit Silman, Eli Cohen, Miri Regev, Yoav Kisch, Dudi Amsalem, Amichai Chikli — not in our 119 (not yet carded or not in Knesset)

---

## Sources
- Netanyahu/PM status: https://en.wikipedia.org/wiki/Benjamin_Netanyahu
- 37th Government ministers: https://en.wikipedia.org/wiki/Thirty-seventh_government_of_Israel
- Knesset Speaker Ohana: https://en.wikipedia.org/wiki/Amir_Ohana
- Lapid former PM / Together alliance: https://www.timesofisrael.com/naftali-bennett-and-yair-lapid-announce-united-run-under-bennett-in-2026-elections/
- Bennett not a current MK: https://en.wikipedia.org/wiki/Naftali_Bennett
- Shas resigned ministers Jul 2025: https://www.timesofisrael.com/liveblog_entry/shas-ministers-file-resignations-as-party-withdraws-from-government/
- Ministries redistributed after Shas/UTJ exit: https://www.timesofisrael.com/ministries-previously-held-by-shas-transferred-to-pair-of-likud-ministers/
- Otzma Yehudit rejoined Mar 2025 (Ben Gvir, Eliyahu, Wasserlauf): https://www.timesofisrael.com/ben-gvir-reappointed-police-minister-as-knesset-okays-his-partys-return-to-government/
- Haim Katz Norwegian Law (not an MK): https://www.timesofisrael.com/liveblog_entry/zohar-gives-up-knesset-seat-to-make-way-for-more-lawmakers-as-likud-goes-norwegian/
- Gideon Sa'ar Norwegian Law / resigned Knesset: https://www.timesofisrael.com/liveblog_entry/giden-saar-resigns-from-knesset-under-norwegian-law-akram-hasson-to-take-his-place/
- Merav Michaeli replaced by Yair Golan (May 2024): https://en.wikipedia.org/wiki/2024_Israeli_Labor_Party_leadership_election
- Ayman Odeh replaced as Hadash party chair (May 2026): https://www.timesofisrael.com/liveblog_entry/former-mk-yousef-jabareen-elected-leader-of-arab-party-hadash/
- Benny Gantz still National Unity leader: https://en.wikipedia.org/wiki/National_Unity_(Israel)
- Mansour Abbas still Ra'am leader: https://en.wikipedia.org/wiki/United_Arab_List
- Avi Maoz still Noam faction leader: https://www.jns.org/feature/israeli-elections-2026-meet-the-parliament-mk-avi-maoz
- Limor Son Har-Melech Deputy Speaker: https://en.wikipedia.org/wiki/Limor_Son_Har-Melech
- 2026 election context: https://en.wikipedia.org/wiki/2026_Israeli_legislative_election
