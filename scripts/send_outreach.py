"""
Personalized batch email sender — one.com SMTP
================================================
Requirements covered:
  1. SMTP: port 587 STARTTLS preferred, fallback to port 465 SSL
  2. Rate limit: 12 s between sends (= 25 emails / 5 min, one.com limit)
  3. Data input: CSV with columns Email, FirstName, LastName
  4. Email content: MIMEMultipart (plain + HTML), {{Variable}} substitution, spam-safe headers
  5. Error handling: try/except, console log per send, send counter, errors → send_errors.log

Setup
-----
1. Install nothing — stdlib only (smtplib, email, csv, os, time, logging).

2. Set environment variables:
     Windows:  set SMTP_USER=you@yourdomain.com
               set SMTP_PASS=yourpassword
               set FROM_NAME=Your Name
     Mac/Linux: export SMTP_USER=...  (same pattern)

3. Prepare contacts.csv:
     Email,FirstName,LastName
     creator@gmail.com,Alex,Johnson
     studio@example.com,Maria,Smith

4. Customise SUBJECT, BODY_TEXT and BODY_HTML below.

5. Run:
     python send_outreach.py contacts.csv

The script skips rows with a missing or invalid Email.
Failures are appended to send_errors.log in the same directory.
"""

import csv
import logging
import os
import smtplib
import sys
import time
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ─── Credentials (from environment variables) ─────────────────────────────────

SMTP_USER = os.environ.get("SMTP_USER", "")   # full email address
SMTP_PASS = os.environ.get("SMTP_PASS", "")
FROM_NAME = os.environ.get("FROM_NAME", "Martin")

# ─── SMTP settings ────────────────────────────────────────────────────────────

SMTP_HOST       = "send.one.com"
SMTP_PORT_TLS   = 587    # STARTTLS — preferred
SMTP_PORT_SSL   = 465    # SSL fallback

# ─── Rate limiting ────────────────────────────────────────────────────────────
# one.com: max 25 emails per 5 minutes → 1 email per 12 seconds exactly.

DELAY_SECONDS = 12

# ─── Email templates ──────────────────────────────────────────────────────────
# Use {{FirstName}}, {{LastName}}, {{Email}} as placeholders.
# They are replaced at send time with values from the CSV row.

SUBJECT = "Partnership opportunity for {{FirstName}}"

BODY_TEXT = """\
Hi {{FirstName}},

I came across your channel and think there could be a great fit for a collaboration.

We're launching a new indie game and would love to explore working together.

Would you be open to a quick chat?

Best,
{{FromName}}
"""

BODY_HTML = """\
<html><body>
<p>Hi <strong>{{FirstName}}</strong>,</p>

<p>I came across your channel and think there could be a great fit for a collaboration.</p>

<p>We're launching a new indie game and would love to explore working together.</p>

<p>Would you be open to a quick chat?</p>

<p>Best,<br>{{FromName}}</p>
</body></html>
"""

# ─── Logging setup ────────────────────────────────────────────────────────────

logging.basicConfig(
    filename="send_errors.log",
    level=logging.ERROR,
    format="%(asctime)s  %(levelname)s  %(message)s",
)

# ─── Helpers ──────────────────────────────────────────────────────────────────

def substitute(template: str, row: dict) -> str:
    """Replace {{Key}} placeholders with values from row dict."""
    result = template
    for key, value in row.items():
        result = result.replace(f"{{{{{key}}}}}", value)
    result = result.replace("{{FromName}}", FROM_NAME)
    return result


def build_message(to_addr: str, first_name: str, last_name: str) -> MIMEMultipart:
    row = {
        "FirstName": first_name,
        "LastName":  last_name,
        "Email":     to_addr,
    }

    msg = MIMEMultipart("alternative")
    msg["Subject"] = substitute(SUBJECT, row)
    msg["From"]    = f"{FROM_NAME} <{SMTP_USER}>"
    msg["To"]      = to_addr
    # Spam-filter headers: Message-ID and Date are added automatically by smtplib.
    # Reply-To keeps replies coming back to your real address.
    msg["Reply-To"] = SMTP_USER

    plain = MIMEText(substitute(BODY_TEXT, row), "plain", "utf-8")
    html  = MIMEText(substitute(BODY_HTML, row), "html",  "utf-8")

    # Attach plain first, HTML second — clients prefer the last part they support.
    msg.attach(plain)
    msg.attach(html)
    return msg


def connect() -> smtplib.SMTP:
    """Connect to one.com SMTP. Try STARTTLS on 587 first, fallback to SSL on 465."""
    try:
        print(f"  Connecting via STARTTLS (port {SMTP_PORT_TLS})...")
        server = smtplib.SMTP(SMTP_HOST, SMTP_PORT_TLS, timeout=30)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(SMTP_USER, SMTP_PASS)
        print("  Connected via STARTTLS.")
        return server
    except Exception as e:
        print(f"  STARTTLS failed ({e}), falling back to SSL port {SMTP_PORT_SSL}...")
        server = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT_SSL, timeout=30)
        server.login(SMTP_USER, SMTP_PASS)
        print("  Connected via SSL.")
        return server

# ─── Main ─────────────────────────────────────────────────────────────────────

def main(csv_path: str) -> None:
    if not SMTP_USER or not SMTP_PASS:
        print("ERROR: SMTP_USER and SMTP_PASS environment variables must be set.")
        sys.exit(1)

    if not os.path.exists(csv_path):
        print(f"ERROR: File not found: {csv_path}")
        sys.exit(1)

    print(f"\n{'─'*50}")
    print(f"  Outreach sender — one.com SMTP")
    print(f"  From : {FROM_NAME} <{SMTP_USER}>")
    print(f"  CSV  : {csv_path}")
    print(f"  Rate : 1 email every {DELAY_SECONDS}s (25/5 min)")
    print(f"{'─'*50}\n")

    server = connect()

    sent    = 0
    failed  = 0
    skipped = 0

    try:
        with open(csv_path, newline="", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)

            for i, row in enumerate(reader, start=1):
                to_addr    = (row.get("Email")     or "").strip()
                first_name = (row.get("FirstName") or "").strip()
                last_name  = (row.get("LastName")  or "").strip()

                if not to_addr or "@" not in to_addr:
                    skipped += 1
                    print(f"[{i:>4}]  SKIP  (no valid email in row {i})")
                    continue

                if not first_name:
                    first_name = to_addr.split("@")[0]  # fallback: use username part

                msg = build_message(to_addr, first_name, last_name)

                try:
                    server.sendmail(SMTP_USER, [to_addr], msg.as_string())
                    sent += 1
                    print(f"[{i:>4}]  OK    {first_name} {last_name} <{to_addr}>  (total sent: {sent})")

                except smtplib.SMTPRecipientsRefused as e:
                    failed += 1
                    print(f"[{i:>4}]  FAIL  {to_addr} — refused: {e}")
                    logging.error("SMTPRecipientsRefused row=%d addr=%s err=%s", i, to_addr, e)

                except smtplib.SMTPServerDisconnected:
                    print(f"[{i:>4}]  RECONNECTING...")
                    logging.warning("Server disconnected at row %d, reconnecting", i)
                    try:
                        server = connect()
                        server.sendmail(SMTP_USER, [to_addr], msg.as_string())
                        sent += 1
                        print(f"[{i:>4}]  OK    {first_name} {last_name} <{to_addr}> (after reconnect, total sent: {sent})")
                    except Exception as retry_err:
                        failed += 1
                        print(f"[{i:>4}]  FAIL  {to_addr} — reconnect retry failed: {retry_err}")
                        logging.error("RetryFailed row=%d addr=%s err=%s", i, to_addr, retry_err)

                except smtplib.SMTPException as e:
                    failed += 1
                    print(f"[{i:>4}]  FAIL  {to_addr} — {e}")
                    logging.error("SMTPException row=%d addr=%s err=%s", i, to_addr, e)

                # ── Rate limit: sleep between every send ──
                if sent + failed < sum(1 for _ in open(csv_path)) - 1:
                    time.sleep(DELAY_SECONDS)

    finally:
        try:
            server.quit()
        except Exception:
            pass

    print(f"\n{'─'*50}")
    print(f"  Sent:    {sent}")
    print(f"  Failed:  {failed}")
    print(f"  Skipped: {skipped}")
    if failed:
        print(f"  Errors logged to: send_errors.log")
    print(f"{'─'*50}\n")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python send_outreach.py contacts.csv")
        sys.exit(1)
    main(sys.argv[1])
