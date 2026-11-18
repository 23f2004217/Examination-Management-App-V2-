"""Helpers shared by the API and the Celery tasks: mail, chat webhook, monthly statistics."""
import html
import json
import logging
import re
import smtplib
import time
import urllib.request
from calendar import monthrange
from datetime import date, datetime
from email.header import Header
from email.utils import formataddr, formatdate, make_msgid
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from flask import current_app
from sqlalchemy import func

from models import db, Booking, Evaluation, Slot, User

log = logging.getLogger("emp")
_mail_down_until = 0.0   # after a failed connection, skip the SMTP server for a while (see send_mail)


def _plain(html_text):
    """Readable plain-text version of an HTML mail (for clients that do not show HTML)."""
    t = re.sub(r"(?is)<(style|head).*?</\\1>", "", html_text)
    t = re.sub(r"(?i)<br\\s*/?>|</(p|div|tr|h[1-6])>", "\\n", t)
    t = re.sub(r"(?i)</t[dh]>", "  ", t)
    t = re.sub(r"<[^>]+>", "", t)
    return re.sub(r"\\n\\s*\\n+", "\\n\\n", html.unescape(t)).strip()


def email_html(title, intro, rows=None, note=None, footer="This is an automated message from the Examination Management Portal."):
    """One consistent, mail-client-safe layout (tables + inline styles). rows = [(label, value), ...] (escaped here)."""
    e = html.escape
    table = ""
    if rows:
        body = "".join(
            f'<tr><td style="padding:8px 12px;color:#64748b;border-bottom:1px solid #e2e8f0;width:38%">{e(str(k))}</td>'
            f'<td style="padding:8px 12px;font-weight:600;border-bottom:1px solid #e2e8f0">{e(str(v))}</td></tr>'
            for k, v in rows if v not in (None, ""))
        table = f'<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:16px 0;font-size:14px">{body}</table>'
    note_html = f'<p style="font-size:14px;color:#334155;margin:0 0 12px">{e(note)}</p>' if note else ""
    return (
        '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
        '<body style="margin:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a">'
        '<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px 12px">'
        '<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;overflow:hidden">'
        '<tr><td style="background:#4f46e5;color:#ffffff;padding:18px 24px;font-size:18px;font-weight:bold">Examination Management Portal</td></tr>'
        f'<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px">{e(title)}</h2>'
        f'<p style="font-size:15px;line-height:1.5;margin:0 0 8px">{e(intro)}</p>{table}{note_html}</td></tr>'
        f'<tr><td style="padding:14px 24px;background:#f8fafc;color:#94a3b8;font-size:12px">{e(footer)}</td></tr>'
        '</table></td></tr></table></body></html>')


def send_mail(to, subject, html_body, pdf=None, text=None):
    """Send one e-mail (HTML + plain-text alternative, optional PDF). Never raises. If the SMTP server cannot be reached,
    further mails are skipped for 60 s: a refused connection costs seconds, which would otherwise be paid per recipient.
    Works with a local sink (MailHog/Mailpit) and with a real server (MAIL_USERNAME/MAIL_PASSWORD, MAIL_USE_TLS/SSL)."""
    global _mail_down_until
    cfg = current_app.config
    if time.time() < _mail_down_until:
        log.warning("mail to %s skipped (SMTP server unreachable a moment ago). Subject: %s", to, subject)
        return False
    msg = MIMEMultipart("mixed")
    alt = MIMEMultipart("alternative")
    alt.attach(MIMEText(text or _plain(html_body), "plain", "utf-8"))
    alt.attach(MIMEText(html_body, "html", "utf-8"))
    msg.attach(alt)
    if pdf:
        part = MIMEApplication(pdf, _subtype="pdf")
        part.add_header("Content-Disposition", "attachment", filename="examination_report.pdf")
        msg.attach(part)
    sender = cfg["MAIL_FROM"]
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = formataddr((cfg.get("MAIL_FROM_NAME", "Examination Portal"), sender))
    msg["To"] = to
    msg["Date"] = formatdate(localtime=True)
    msg["Message-ID"] = make_msgid(domain=sender.split("@")[-1] or "localhost")
    try:
        if cfg.get("MAIL_USE_SSL"):
            smtp = smtplib.SMTP_SSL(cfg["MAIL_HOST"], cfg["MAIL_PORT"], timeout=10)
        else:
            smtp = smtplib.SMTP(cfg["MAIL_HOST"], cfg["MAIL_PORT"], timeout=10)
        with smtp as s:
            if cfg.get("MAIL_USE_TLS") and not cfg.get("MAIL_USE_SSL"):
                s.starttls()
            if cfg.get("MAIL_USERNAME"):
                # Offer only PLAIN: after a refused login Gmail hangs up, which smtplib reports as a vague
                # "connection closed" when it then tries the next method. One method = the real error (535 bad password).
                s.ehlo()
                if "PLAIN" in s.esmtp_features.get("auth", ""):
                    s.esmtp_features["auth"] = "PLAIN"
                s.login(cfg["MAIL_USERNAME"], cfg.get("MAIL_PASSWORD", ""))
            s.send_message(msg, from_addr=sender, to_addrs=[to])
        return True
    except Exception as e:  # mail server not running is fine for local demos
        if isinstance(e, OSError):  # cannot connect / timed out (not e.g. a rejected recipient)
            _mail_down_until = time.time() + 60
        log.warning("mail to %s not sent (%s). Subject: %s", to, e, subject)
        return False


def send_chat(text):
    url = current_app.config["GCHAT_WEBHOOK"]
    if not url:
        return False
    try:
        req = urllib.request.Request(url, data=json.dumps({"text": text}).encode(),
                                     headers={"Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=5)
        return True
    except Exception as e:
        log.warning("chat webhook failed: %s", e)
        return False


def monthly_stats(year, month):
    first = date(year, month, 1)
    last = date(year, month, monthrange(year, month)[1])
    in_month = (Slot.date >= first) & (Slot.date <= last)

    completed = (Booking.query.join(Slot).filter(Booking.status == "Completed", in_month).count())
    conducted = (db.session.query(func.count(func.distinct(Booking.exam_id))).join(Slot, Booking.slot_id == Slot.id)
                 .filter(Booking.status == "Completed", in_month).scalar())
    evaluated = (db.session.query(func.count(func.distinct(Evaluation.student_id)))
                 .filter(Evaluation.evaluated_at >= datetime.combine(first, datetime.min.time()),
                         Evaluation.evaluated_at <= datetime.combine(last, datetime.max.time())).scalar())
    pending = (Booking.query.join(Slot).outerjoin(Evaluation, Evaluation.booking_id == Booking.id)
               .filter(Booking.status == "Booked", Evaluation.id.is_(None), Slot.date <= last).count())
    top = (db.session.query(User.name, func.count(Evaluation.id)).join(Evaluation, Evaluation.examiner_id == User.id)
           .filter(Evaluation.evaluated_at >= datetime.combine(first, datetime.min.time()),
                   Evaluation.evaluated_at <= datetime.combine(last, datetime.max.time()))
           .group_by(User.id).order_by(func.count(Evaluation.id).desc()).limit(5).all())
    return dict(month=first.strftime("%B %Y"), examinations_conducted=conducted, students_evaluated=evaluated,
                completed_bookings=completed, pending_evaluations=pending,
                active_examiners=[dict(name=n, evaluations=c) for n, c in top])


# ---- a tiny PDF writer: standard library only (no PDF library is permitted for this project) -------------------------
_HELV = ([278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278] + [556] * 10 +
         [278, 278, 584, 584, 584, 556, 1015] +
         [667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611] +
         [278, 278, 278, 469, 556, 333] +
         [556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500] +
         [334, 260, 334, 584])        # Helvetica character widths for ASCII 32..126 (1/1000 em); used to align and wrap text


def _pdf_w(s, size, bold=False):
    """Approximate width in points of s in Helvetica (bold is about 7 % wider)."""
    w = sum(_HELV[ord(c) - 32] if 32 <= ord(c) <= 126 else 556 for c in str(s)) / 1000 * size
    return w * 1.07 if bold else w


def _pdf_esc(t):
    return str(t).encode("latin-1", "replace").decode("latin-1").replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _pdf_file(stream):
    """Wrap one A4 page content stream (fonts: F1 = Helvetica, F2 = Helvetica-Bold) into a complete PDF file."""
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R "
            b"/Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",       # WinAnsi: "é", "ñ" ... show
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>"]  # correctly (not as "Ø")
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for i, o in enumerate(objs, 1):
        offsets.append(len(out))
        out += b"%d 0 obj\n" % i + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1)
    out += b"".join(b"%010d 00000 n \n" % off for off in offsets)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref)
    return bytes(out)


def scorecard_pdf(c):
    """One-page A4 scorecard. c = dict(student, email, exam, course, examiner, evaluated, generated, total, max_total,
    remarks, rows=[(criterion, marks, max_marks), ...])."""
    page_h, ops = 842, []
    ink, mute, hair, indigo, white = (0.06, 0.09, 0.16), (0.39, 0.45, 0.55), (0.89, 0.91, 0.94), (0.31, 0.27, 0.90), (1, 1, 1)

    def rect(x, top, w, h, rgb):                                   # filled box; `top` is measured from the top of the page
        ops.append("%.3f %.3f %.3f rg %.1f %.1f %.1f %.1f re f" % (*rgb, x, page_h - top - h, w, h))

    def frame(x, top, w, h, rgb=hair):
        ops.append("%.3f %.3f %.3f RG 0.8 w %.1f %.1f %.1f %.1f re S" % (*rgb, x, page_h - top - h, w, h))

    def rule(x1, x2, top, rgb=hair):
        ops.append("%.3f %.3f %.3f RG 0.8 w %.1f %.1f m %.1f %.1f l S" % (*rgb, x1, page_h - top, x2, page_h - top))

    def text(x, top, s, size=10.5, bold=False, rgb=ink, right=False):       # `top` is the text baseline
        s = str(s)
        if right:
            x -= _pdf_w(s, size, bold)
        ops.append("%.3f %.3f %.3f rg BT /%s %.1f Tf %.1f %.1f Td (%s) Tj ET" % (*rgb, "F2" if bold else "F1", size, x, page_h - top, _pdf_esc(s)))

    def fit(s, size, width, bold=False):                           # shorten with "..." so nothing runs into the next column
        s = str(s)
        if _pdf_w(s, size, bold) <= width:
            return s
        while len(s) > 1 and _pdf_w(s + "...", size, bold) > width:
            s = s[:-1]
        return s.rstrip() + "..."

    def wrap(s, size, width):
        lines = []
        for para in str(s).splitlines() or [""]:
            line = ""
            for word in para.split():
                trial = (line + " " + word).strip()
                if _pdf_w(trial, size) <= width:
                    line = trial
                else:
                    if line:
                        lines.append(line)
                    line = fit(word, size, width)
            lines.append(line)
        return lines

    # header band
    rect(0, 0, 595, 104, indigo)
    text(50, 52, "Examination Management Portal", 20, True, white)
    text(50, 76, "Official Academic Scorecard", 12, False, (0.88, 0.90, 1.0))
    text(545, 76, "OFFICIAL ASSESSMENT TRANSCRIPT", 8, True, (0.88, 0.90, 1.0), right=True)

    def field(x, top, label, value, sub=None):
        text(x, top, label.upper(), 8, True, mute)
        text(x, top + 17, fit(value, 12.5, 235, True), 12.5, True)
        if sub:
            text(x, top + 32, fit(sub, 9.5, 235), 9.5, False, mute)

    field(50, 142, "Student", c["student"], c["email"])
    field(320, 142, "Examination", c["exam"], c["course"])
    field(50, 206, "Examiner", c["examiner"])
    field(320, 206, "Evaluation date", c["evaluated"])

    # Everything must fit on one page: work out how many criteria fit once the remarks and signatures are accounted for.
    remark_lines = wrap(c["remarks"] or "No remarks provided.", 10.5, 470)[:8]
    box = 22 + 15 * len(remark_lines)
    room = 790 - (270 + 26 + 34) - (30 + 10 + box + 56)
    n = max(1, min(10, int(room // 28)))
    if len(c["rows"]) > n:
        n = max(1, n - 1)                                          # leave space for the "+N more criteria" note
    shown = c["rows"][:n]

    # rubric table
    top = 270
    rect(50, top, 495, 26, (0.95, 0.96, 0.98))
    text(62, top + 17, "RUBRIC CRITERION", 8, True, mute)
    text(430, top + 17, "MARKS SCORED", 8, True, mute, right=True)
    text(533, top + 17, "MAX MARKS", 8, True, mute, right=True)
    top += 26
    for name, got, most in shown:
        text(62, top + 18, fit(name, 10.5, 300), 10.5)
        text(430, top + 18, "%g" % got, 10.5, right=True)
        text(533, top + 18, "%g" % most, 10.5, False, mute, right=True)
        top += 28
        rule(50, 545, top)
    if len(c["rows"]) > len(shown):
        text(62, top + 16, "+ %d more criteria" % (len(c["rows"]) - len(shown)), 9, False, mute)
        top += 24
    rect(50, top, 495, 34, (0.93, 0.94, 1.0))
    text(62, top + 22, "Final weighted total", 11.5, True)
    text(533, top + 23, "%g / %g" % (c["total"], c["max_total"]), 14, True, indigo, right=True)
    top += 34 + 30

    # examiner remarks
    text(50, top, "EXAMINER REMARKS", 8, True, mute)
    frame(50, top + 10, 495, box)
    for i, ln in enumerate(remark_lines):
        text(62, top + 33 + 15 * i, ln, 10.5, False, ink if c["remarks"] else mute)
    top += 10 + box + 56

    # signatures + footer
    rule(50, 230, top)
    rule(365, 545, top)
    text(50, top + 14, "Evaluated by (Examiner)", 8.5, False, mute)
    text(50, top - 6, fit(c["examiner"], 10, 175, True), 10, True)
    text(365, top + 14, "Controller of Examinations", 8.5, False, mute)
    text(50, 818, "Generated by the Examination Management Portal on %s. Valid for published results only." % c["generated"], 8, False, mute)
    return _pdf_file("\n".join(ops).encode("latin-1"))


def monthly_report_pdf(stats):
    """Single-page text PDF built by hand (no PDF library is permitted for this project)."""
    lines = [("F2", 18, f"Examination Report - {stats['month']}"), ("F1", 12, ""),
             ("F1", 12, f"Examinations conducted: {stats['examinations_conducted']}"),
             ("F1", 12, f"Students evaluated: {stats['students_evaluated']}"),
             ("F1", 12, f"Completed bookings: {stats['completed_bookings']}"),
             ("F1", 12, f"Pending evaluations: {stats['pending_evaluations']}"), ("F1", 12, ""),
             ("F2", 14, "Most active examiners")]
    lines += [("F1", 12, f"  {e['name']}: {e['evaluations']} evaluations") for e in stats["active_examiners"]] \
        or [("F1", 12, "  No evaluations")]
    y, ops = 790, []
    for font, size, text in lines:
        ops.append(f"BT /{font} {size} Tf 50 {y} Td ({_pdf_esc(text)}) Tj ET")
        y -= size + 10
    return _pdf_file("\n".join(ops).encode("latin-1"))


def monthly_report_html(stats):
    exam_rows = [("Examinations conducted", stats["examinations_conducted"]), ("Students evaluated", stats["students_evaluated"]),
                 ("Completed bookings", stats["completed_bookings"]), ("Pending evaluations", stats["pending_evaluations"])]
    top = [(e["name"], f"{e['evaluations']} evaluation(s)") for e in stats["active_examiners"]] or [("Most active examiners", "No evaluations")]
    page = email_html(f"Examination report - {stats['month']}", "Here are the examination statistics for the month.",
                      exam_rows + [("Most active examiners", "")] + top,
                      note="The full report is attached as a PDF.")
    return page
