#!/usr/bin/env python3
"""Knesset OData — per-politician parliamentary-activity counts (current term + lifetime).

Returns, for a given KNS_Person PersonID, the number of bills (הצעות חוק) and
queries (שאילתות) the MK is tied to, split into the *current* Knesset and their
*lifetime* total — using only the official Knesset OData service.

Why this exists: the card needs "2 בכנסת ה-25 / 213 בסך הכל", but a naive ingest
only stores the current Knesset, so a senior figure (a Speaker, a former minister)
looks empty. Each number here is ONE cheap HTTP call — the service returns the total
in `odata.count` without sending the rows — so there is no "download every Knesset"
cost. See SKILL.md for the full provenance.

Stdlib only. No third-party deps.

Usage:
    python knesset_activity.py 30300            # Amir Ohana, current Knesset = 25
    python knesset_activity.py 427 --knesset 25 # Avigdor Liberman, explicit term
    python knesset_activity.py 30300 --cross-check   # re-prove counts vs pagination

Verified live 2026-06-11:
    Ohana(30300)    bills 2/213   queries 0/11
    Liberman(427)   bills 301/532 queries 2/3
"""

import argparse
import json
import urllib.parse
import urllib.request

# The official system of record. OData v4. This is the same base the app's
# app/lib/knesset/odata.ts (PARLIAMENT_BASE) ingests from — NOT Votes.svc.
BASE = "https://knesset.gov.il/Odata/ParliamentInfo.svc/"

# Verified current as of 2026-06-11 (KNS_Bill has rows for 25, zero for 26).
# Re-verify with assert_current_knesset() rather than trusting this blindly.
DEFAULT_KNESSET = 25


def _get(*, entity, params):
    """GET an OData entity set. We percent-encode with urllib.parse.quote so spaces
    become %20 (the service rejects the '+' that form-encoding would produce) and the
    '$' sigils + Hebrew filter literals are encoded correctly."""
    url = BASE + entity + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.load(r)


def count(*, entity, filt):
    """Total rows matching `filt`, in ONE call, without downloading them.

    The working mechanism on this service is the v3-style `$inlinecount=allpages`
    (NOT `$count=true` and NOT the `/$count` path — both are broken here, returning
    a missing field / HTTP 400 / HTTP 415). The total comes back under the key
    `odata.count` as a STRING, so it must be int()-coerced."""
    page = _get(entity=entity, params=[
        ("$format", "json"),
        ("$filter", filt),
        ("$inlinecount", "allpages"),
        ("$top", "1"),  # we want the count, not the rows
    ])
    raw = page.get("odata.count")
    if raw is None:
        raise RuntimeError(f"no odata.count for {entity} ?$filter={filt} — API shape changed?")
    return int(raw)


def activity(*, person_id, knesset_num=DEFAULT_KNESSET):
    """Bills + queries for one MK, split current-term vs lifetime.

    - Bills: KNS_BillInitiator has no KnessetNum column of its own, so the
      current-term count filters through its KNS_Bill navigation property.
    - Queries: KNS_Query carries its own KnessetNum, so it filters directly.
    Returns a plain dict (RORO-friendly)."""
    return {
        "personId": person_id,
        "knessetNum": knesset_num,
        "billsCurrent": count(
            entity="KNS_BillInitiator",
            filt=f"PersonID eq {person_id} and KNS_Bill/KnessetNum eq {knesset_num}",
        ),
        "billsLifetime": count(entity="KNS_BillInitiator", filt=f"PersonID eq {person_id}"),
        "queriesCurrent": count(
            entity="KNS_Query",
            filt=f"PersonID eq {person_id} and KnessetNum eq {knesset_num}",
        ),
        "queriesLifetime": count(entity="KNS_Query", filt=f"PersonID eq {person_id}"),
    }


def _paginate(*, entity, filt, expand=None):
    """Fetch every row (following the relative odata.nextLink). The server caps each
    page at 100 rows, so we request a large $top to make it emit a nextLink and page
    to exhaustion. Used only by the cross-check — the counts above never need it."""
    params = [("$format", "json"), ("$filter", filt), ("$top", "100000")]
    if expand:
        params.append(("$expand", expand))
    url = BASE + entity + "?" + urllib.parse.urlencode(params, quote_via=urllib.parse.quote)
    rows = []
    while url:
        req = urllib.request.Request(url, headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=40) as r:
            page = json.load(r)
        rows.extend(page.get("value", []))
        nxt = page.get("@odata.nextLink") or page.get("odata.nextLink")
        url = urllib.parse.urljoin(BASE, nxt) if nxt else None
    return rows


def cross_check(*, person_id, knesset_num=DEFAULT_KNESSET):
    """Honesty tool: re-derive every number by actually downloading + counting the
    rows, and assert it equals the cheap `odata.count`. If this ever fails, do NOT
    trust the counts — the API changed. Returns (ok, details)."""
    a = activity(person_id=person_id, knesset_num=knesset_num)
    bill_rows = _paginate(entity="KNS_BillInitiator", filt=f"PersonID eq {person_id}", expand="KNS_Bill")
    q_rows = _paginate(entity="KNS_Query", filt=f"PersonID eq {person_id}")
    truth = {
        "billsLifetime": len(bill_rows),
        "billsCurrent": sum(1 for r in bill_rows if (r.get("KNS_Bill") or {}).get("KnessetNum") == knesset_num),
        "queriesLifetime": len(q_rows),
        "queriesCurrent": sum(1 for r in q_rows if r.get("KnessetNum") == knesset_num),
    }
    details = {k: {"count": a[k], "paginated": truth[k], "match": a[k] == truth[k]} for k in truth}
    return all(d["match"] for d in details.values()), details


def assert_current_knesset(n):
    """Verify n is the current Knesset from primitives: n has bills, n+1 has none."""
    has_n = count(entity="KNS_Bill", filt=f"KnessetNum eq {n}") > 0
    has_next = count(entity="KNS_Bill", filt=f"KnessetNum eq {n + 1}") > 0
    return has_n and not has_next


def main():
    ap = argparse.ArgumentParser(description="Knesset per-MK activity counts (current + lifetime)")
    ap.add_argument("person_id", type=int, help="KNS_Person PersonID (e.g. 30300 = Amir Ohana)")
    ap.add_argument("--knesset", type=int, default=DEFAULT_KNESSET, help="current-term Knesset number")
    ap.add_argument("--cross-check", action="store_true", help="re-prove counts against full pagination")
    args = ap.parse_args()

    if args.cross_check:
        ok, details = cross_check(person_id=args.person_id, knesset_num=args.knesset)
        print(json.dumps(details, ensure_ascii=False, indent=2))
        print("CROSS-CHECK:", "PASS" if ok else "FAIL")
        raise SystemExit(0 if ok else 1)

    print(json.dumps(activity(person_id=args.person_id, knesset_num=args.knesset),
                      ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
