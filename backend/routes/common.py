import base64
import logging
import re
import secrets
import threading
from datetime import datetime
from functools import wraps

from flask import Blueprint, current_app, jsonify, request
from itsdangerous import BadSignature, URLSafeTimedSerializer
from sqlalchemy.orm import configure_mappers, joinedload, selectinload

import cache
from models import Booking, Evaluation, EvaluationScore, Exam, Notification, Slot, User, db
from services import send_mail


api = Blueprint("api", __name__)
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
audit_log = logging.getLogger("emp.audit")
LOGIN_ROLES = {"admin": "an admin", "examiner": "an examiner", "student": "a student"}  # role -> wording for messages

# "Check for a clash, then insert" is not atomic, so every endpoint that does it runs one at a time. The app is a
# single process (threaded dev server), which is what makes an in-process lock sufficient. For several worker
# processes this would have to move into the database.
_schedule_lock = threading.RLock()


def serialized(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        with _schedule_lock:
            return fn(*a, **kw)
    return wrapper


def audit(u, action, **info):
    """Append one line to instance/audit.log: who did what to which record."""
    audit_log.info("user=%s role=%s action=%s %s", u.id, u.role, action,
                   " ".join(f"{k}={v}" for k, v in info.items()))


class ApiError(Exception):
    def __init__(self, msg, code=400, **extra):
        self.msg, self.code, self.extra = msg, code, extra


def clean(v, label="field", required=False):
    """Trimmed text or None. Output escaping is left to Vue (and html.escape in emails), so nothing is rewritten."""
    if v is None:
        v = ""
    if not isinstance(v, str):
        raise ApiError(f"'{label}' must be text")
    v = v.strip()
    if required and not v:
        raise ApiError(f"'{label}' is required")
    if len(v) > 2000:
        raise ApiError(f"'{label}' is too long")
    return v or None


def to_int(v, label):
    """Integer from JSON/query input; anything else is a 400 instead of a crash."""
    if isinstance(v, bool):
        raise ApiError(f"'{label}' must be a number")
    try:
        return int(v)
    except (ValueError, TypeError):
        raise ApiError(f"'{label}' must be a number")


def valid_password(pw):
    if not isinstance(pw, str) or not 6 <= len(pw) <= 128:
        raise ApiError("Password must be 6-128 characters")
    return pw


def valid_email(v):
    if not isinstance(v, str) or len(v) > 120 or not EMAIL_RE.match(v.strip()):
        raise ApiError("Invalid email")
    return v.strip().lower()


def check_phone(v):
    v = clean(v, "phone")
    if v and not re.match(r"^[0-9+\- ]{7,15}$", v):
        raise ApiError("Invalid phone number")
    return v


def valid_link(v):
    """Meeting links are rendered as <a href>, so only http(s) is allowed (blocks javascript: URLs)."""
    v = clean(v, "meeting_link")
    if v and (len(v) > 255 or not re.match(r"^https?://[^\s<>\"']+$", v, re.I)):
        raise ApiError("Meeting link must be a valid http:// or https:// URL")
    return v


def course_status(v):
    if v not in ("Active", "Inactive"):
        raise ApiError("Status must be Active or Inactive")
    return v


def rate_limit(bucket, limit, window):
    if cache.hit(f"{bucket}:{request.remote_addr}", window) > limit:
        raise ApiError("Too many attempts. Please wait a minute and try again.", 429)


def error_response(e):
    return jsonify(error=e.msg, **e.extra), e.code


# ---------- helpers ----------
# ---------- token auth (itsdangerous, part of Flask: no extra library) ----------
def create_access_token(user_id):
    s = URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt="emp-access")
    return s.dumps({"sub": str(user_id), "jti": secrets.token_hex(8)})


def read_token():
    """Validated token payload from `Authorization: Bearer <token>`; 401 if missing, forged, expired or revoked."""
    head = request.headers.get("Authorization", "")
    if not head.startswith("Bearer ") or not head[7:].strip():
        raise ApiError("Missing or malformed Authorization header", 401)
    s = URLSafeTimedSerializer(current_app.config["JWT_SECRET_KEY"], salt="emp-access")
    try:
        data = s.loads(head[7:].strip(), max_age=current_app.config["JWT_ACCESS_TOKEN_EXPIRES"])
    except BadSignature:                      # includes SignatureExpired
        raise ApiError("Invalid or expired token", 401)
    if cache.get("revoked:" + data["jti"]) is not None:   # revoked by /auth/logout (Redis, survives restarts)
        raise ApiError("Token has been revoked", 401)
    return data

def current_user():
    u = db.session.get(User, int(read_token()["sub"]))
    if not u or u.status != "Active":
        raise ApiError("Account inactive or not found", 401)
    return u


def roles(*allowed):
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            u = current_user()
            if u.role not in allowed:
                raise ApiError("Forbidden for your role", 403)
            return fn(u, *a, **kw)
        return wrapper
    return deco


def body():
    return request.get_json(silent=True) or {}


def need(data, *fields):
    for f in fields:
        if data.get(f) in (None, ""):
            raise ApiError(f"'{f}' is required")


def pdate(v, name):
    if v in (None, ""):
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%d").date()
    except (ValueError, TypeError):
        raise ApiError(f"'{name}' must be YYYY-MM-DD")


def ptime(v, name):
    try:
        return datetime.strptime(v, "%H:%M").time()
    except (ValueError, TypeError):
        raise ApiError(f"'{name}' must be HH:MM")


def pint(v, name, minimum=1):
    try:
        n = int(v)
    except (ValueError, TypeError):
        raise ApiError(f"'{name}' must be a number")
    if n < minimum:
        raise ApiError(f"'{name}' must be at least {minimum}")
    return n


# Eager-loading options: load everything a to_dict() touches in a few queries instead of several per row (N+1).
configure_mappers()  # backrefs such as Slot.exam only exist once the mappers are configured
SLOT_LOAD = (joinedload(Slot.exam), joinedload(Slot.examiner), selectinload(Slot.bookings))
EXAM_LOAD = (joinedload(Exam.course),)
BOOKING_LOAD = (joinedload(Booking.student), joinedload(Booking.exam).joinedload(Exam.course),
                joinedload(Booking.slot).joinedload(Slot.examiner),
                selectinload(Booking.evaluation).selectinload(Evaluation.scores).joinedload(EvaluationScore.rubric))


def get_or_404(model, id_):
    obj = db.session.get(model, id_)
    if not obj:
        raise ApiError(f"{model.__name__} not found", 404)
    return obj


def notify(user_id, message, link=None):
    db.session.add(Notification(user_id=user_id, message=message[:250], link=link))


def run_task(task, *args):
    """Queue on Celery when the broker answers quickly; otherwise run inline so the feature still works locally."""
    if cache.broker_available():
        try:
            task.delay(*args)
            return
        except Exception:
            pass
    task(*args)


def mail_async(to, subject, html_body, pdf=None):
    """Hand the mail to Celery when a broker answers. Otherwise send it from a background thread: the request must
    not wait for an SMTP connection (a missing mail server costs several seconds per recipient)."""
    from tasks import send_email
    if cache.broker_available():
        try:
            send_email.delay(to, subject, html_body, base64.b64encode(pdf).decode() if pdf else None)
            return
        except Exception:
            pass
    app = current_app._get_current_object()

    def work():
        with app.app_context():
            send_mail(to, subject, html_body, pdf)
    threading.Thread(target=work, daemon=True).start()


def exam_for(u, eid):
    """Load an exam the caller may see: students never see Drafts, examiners only exams they are assigned to now."""
    e = get_or_404(Exam, eid)
    if u.role == "student" and e.status == "Draft":
        raise ApiError("Examination not found", 404)
    if u.role == "examiner" and u not in e.examiners:
        raise ApiError("Examination not found", 404)
    return e


def require_assigned(u, exam):
    """Examiner actions on slots and evaluations need a current assignment, not just an old slot."""
    if u not in exam.examiners:
        raise ApiError("You are no longer assigned to this examination", 403)


def refresh_slot_status(slot):
    if slot.status in ("Cancelled", "Completed"):
        return
    slot.status = "Full" if slot.available_seats <= 0 else "Available"


def clear_exam_cache():
    cache.invalidate("exams:")
    cache.invalidate("schedule:")
    cache.invalidate("rubrics:")
