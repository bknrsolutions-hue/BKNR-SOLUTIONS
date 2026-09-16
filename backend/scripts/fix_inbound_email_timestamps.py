"""
ONE-TIME migration: fix crm_quotation_replies INBOUND timestamps.

Problem:
  email_poller.py was storing received_at = datetime.utcnow() (UTC)
  while all OUTBOUND records use ist_now() (IST = UTC+5:30).
  This caused INBOUND messages to appear 5h30m "earlier" than they
  actually were, breaking chronological sort in the UI.

Fix:
  Add +5h 30m to every INBOUND record that was Gmail-synced
  (message_id IS NOT NULL) whose timestamp is clearly UTC
  (i.e. more than 4h before the earliest OUTBOUND for that quotation).

SAFETY: Run this script ONCE only.
        Wrap in a transaction — review the preview before confirming.
"""

import sys
from pathlib import Path
from datetime import timedelta

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.database import SessionLocal

IST_DELTA = timedelta(hours=5, minutes=30)
UTC_THRESHOLD = timedelta(hours=4)   # INBOUND >4h before earliest OUTBOUND → treat as UTC


def run():
    db = SessionLocal()
    try:
        # ── 1. Find INBOUND records (gmail-synced) that appear to be UTC ──────
        rows = db.execute(text("""
            SELECT r.id, r.quotation_id, r.received_at, r.direction,
                   MIN(out_r.received_at) AS first_outbound
            FROM crm_quotation_replies r
            LEFT JOIN crm_quotation_replies out_r
                ON out_r.quotation_id = r.quotation_id
               AND out_r.direction = 'OUTBOUND'
            WHERE r.direction = 'INBOUND'
              AND r.message_id IS NOT NULL
            GROUP BY r.id, r.quotation_id, r.received_at, r.direction
        """)).fetchall()

        to_fix = []
        for row in rows:
            if row.first_outbound is None:
                continue
            diff = row.first_outbound - row.received_at
            if diff > UTC_THRESHOLD:
                to_fix.append({
                    "id": row.id,
                    "old": row.received_at,
                    "new": row.received_at + IST_DELTA,
                    "first_outbound": row.first_outbound,
                })

        if not to_fix:
            print("✅ No records need fixing. Already correct or no Gmail-synced INBOUND records.")
            return

        # ── 2. Preview ─────────────────────────────────────────────────────────
        print(f"\n{'─'*70}")
        print(f"  Records to fix: {len(to_fix)}")
        print(f"{'─'*70}")
        for r in to_fix[:20]:
            print(f"  ID {r['id']:6d}  {r['old']}  →  {r['new']}  (first_out: {r['first_outbound']})")
        if len(to_fix) > 20:
            print(f"  ... and {len(to_fix) - 20} more")
        print(f"{'─'*70}\n")

        confirm = input("Apply this fix? [yes/no]: ").strip().lower()
        if confirm != "yes":
            print("Aborted. No changes made.")
            return

        # ── 3. Apply ──────────────────────────────────────────────────────────
        ids = [r["id"] for r in to_fix]
        db.execute(text("""
            UPDATE crm_quotation_replies
            SET received_at = received_at + INTERVAL '5 hours 30 minutes'
            WHERE id = ANY(:ids)
        """), {"ids": ids})
        db.commit()
        print(f"✅ Fixed {len(to_fix)} INBOUND records. Timestamps now in IST.")

    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    run()
