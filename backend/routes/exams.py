from datetime import date

from flask import jsonify, request
from sqlalchemy import or_

import cache
from models import Booking, Course, EXAM_STATUSES, EXAM_TRANSITIONS, EXAM_TYPES, Evaluation, Exam, Slot, User, db
from services import email_html
from routes.common import ApiError, EXAM_LOAD, _schedule_lock, api, audit, body, clean, clear_exam_cache, exam_for, get_or_404, mail_async, need, notify, pdate, pint, require_assigned, roles, to_int


# ---------- examinations ----------
def validate_exam(d, exam=None):
    need(d, "course_id", "name", "type", "duration", "max_marks")
    if d["type"] not in EXAM_TYPES:
        raise ApiError("Invalid examination type")
    course_id = to_int(d["course_id"], "course_id")
    get_or_404(Course, course_id)
    out = dict(course_id=course_id, name=clean(d["name"], "name", required=True), type=d["type"],
               duration=pint(d["duration"], "duration"), max_marks=pint(d["max_marks"], "max_marks"),
               instructions=clean(d.get("instructions"), "instructions"))
    for f in ("slot_start", "slot_end", "booking_start", "booking_end"):
        out[f] = pdate(d.get(f), f)
    if out["slot_start"] and out["slot_end"] and out["slot_end"] < out["slot_start"]:
        raise ApiError("Slot creation end must be after start")
    if out["booking_start"] and out["booking_end"] and out["booking_end"] < out["booking_start"]:
        raise ApiError("Booking end must be after start")
    return out


@api.get("/exams")
@roles("admin", "examiner", "student")
def list_exams(u):
    key = f"exams:{u.role}:{u.id if u.role == 'examiner' else 0}:{request.query_string.decode()}"
    hit = cache.get(key)
    if hit is not None:
        return jsonify(hit)
    q = Exam.query.join(Course).options(*EXAM_LOAD)
    a = request.args
    if a.get("q"):
        like = f"%{a['q']}%"
        q = q.filter(or_(Exam.name.ilike(like), Course.name.ilike(like), Course.code.ilike(like)))
    if a.get("type"):
        q = q.filter(Exam.type == a["type"])
    if a.get("status"):
        q = q.filter(Exam.status == a["status"])
    if a.get("course_id"):
        q = q.filter(Exam.course_id == to_int(a["course_id"], "course_id"))
    if u.role == "student":
        q = q.filter(Exam.status != "Draft")
    elif u.role == "examiner":
        q = q.filter(Exam.examiners.any(User.id == u.id))
    data = [e.to_dict() for e in q.order_by(Exam.id.desc()).all()]
    cache.put(key, data)
    return jsonify(data)


@api.post("/exams")
@roles("admin")
def create_exam(u):
    e = Exam(**validate_exam(body()))
    db.session.add(e)
    db.session.commit()
    clear_exam_cache()
    return jsonify(e.to_dict()), 201


@api.get("/exams/<int:eid>")
@roles("admin", "examiner", "student")
def get_exam(u, eid):
    return jsonify(exam_for(u, eid).to_dict())


@api.put("/exams/<int:eid>")
@roles("admin")
def update_exam(u, eid):
    e = get_or_404(Exam, eid)
    fields = validate_exam(body())
    if fields["max_marks"] != e.max_marks and has_evaluations(e.id):
        raise ApiError("Maximum marks cannot change after evaluations exist", 409)
    for k, v in fields.items():
        setattr(e, k, v)
    db.session.commit()
    clear_exam_cache()
    return jsonify(e.to_dict())


@api.delete("/exams/<int:eid>")
@roles("admin")
def delete_exam(u, eid):
    e = get_or_404(Exam, eid)
    if e.slots:
        raise ApiError("Examination has slots; close it instead of deleting", 409)
    db.session.delete(e)
    db.session.commit()
    clear_exam_cache()
    return jsonify(ok=True)


@api.put("/exams/<int:eid>/examiners")
@roles("admin")
def assign_examiners(u, eid):
    e, ids = get_or_404(Exam, eid), body().get("examiner_ids", [])
    if not isinstance(ids, list):
        raise ApiError("'examiner_ids' must be a list")
    ids = {to_int(i, "examiner_ids") for i in ids}
    found = User.query.filter(User.id.in_(ids), User.role == "examiner").all() if ids else []
    if len(found) != len(ids):
        raise ApiError("Every id in 'examiner_ids' must be an existing examiner")
    keep = {x.id for x in found}
    for x in found:  # new assignments only for active accounts; existing ones stay as they are
        if x not in e.examiners and x.status != "Active":
            raise ApiError(f"{x.name} is inactive and cannot be assigned")
    with _schedule_lock:  # no new slot may appear for an examiner while we check that they are not being cut off
        for x in e.examiners:
            if x.id not in keep and Slot.query.filter(Slot.exam_id == e.id, Slot.examiner_id == x.id,
                                                      Slot.status.in_(("Available", "Full"))).first():
                raise ApiError(f"{x.name} still has open slots in this examination. Reassign or cancel them first.", 409)
        e.examiners = found
        db.session.commit()
    audit(u, "exam.assign_examiners", exam=e.id, examiners=",".join(str(i) for i in sorted(keep)))
    clear_exam_cache()
    return jsonify(e.to_dict())


@api.post("/exams/<int:eid>/status")
@roles("admin", "examiner")
def set_status(u, eid):
    e, status = get_or_404(Exam, eid), body().get("status")
    if status not in EXAM_STATUSES:
        raise ApiError("Invalid status")
    if e.results_published and status != "Completed":
        raise ApiError("Results are published, so the status is locked at Completed", 409)
    if u.role == "examiner":
        require_assigned(u, e)
        if status not in ("Closed", "Completed"):
            raise ApiError("Examiners may only mark an examination Closed or Completed", 403)
    if status == e.status:
        return jsonify(e.to_dict())
    if e.results_published:
        raise ApiError("Results are published, so the status can no longer change", 409)
    if status not in EXAM_TRANSITIONS[e.status]:
        allowed = ", ".join(EXAM_TRANSITIONS[e.status]) or "none"
        raise ApiError(f"An examination that is {e.status} can only move to: {allowed}", 409)
    if status == "Draft" and (e.slots or Booking.query.filter_by(exam_id=e.id).first()):
        raise ApiError("An examination that has slots or bookings cannot go back to Draft", 409)
    if status == "Slot Creation" and not e.examiners:
        raise ApiError("Assign at least one examiner first")
    if status == "Booking Open":
        if not e.rubrics:
            raise ApiError("Create at least one rubric criterion first")
        if not Slot.query.filter_by(exam_id=e.id, status="Available").count():
            raise ApiError("No available slots to book yet")
    if status == "Completed":
        if pending_for_exam(e.id):
            raise ApiError("Evaluate all booked students first")
        later = (Slot.query.join(Booking, Booking.slot_id == Slot.id)
                 .filter(Slot.exam_id == e.id, Slot.status != "Cancelled", Slot.date > date.today(),
                         Booking.status != "Cancelled").first())
        if later:
            raise ApiError(f"A session with booked students is still scheduled for {later.date}", 409)
    audit(u, "exam.status", exam=e.id, old=e.status.replace(" ", "_"), new=status.replace(" ", "_"))
    e.status = status
    db.session.commit()
    clear_exam_cache()
    return jsonify(e.to_dict())


def has_evaluations(eid):
    return Evaluation.query.join(Booking, Evaluation.booking_id == Booking.id) \
        .filter(Booking.exam_id == eid).first() is not None


def pending_for_exam(eid):
    return (Booking.query.outerjoin(Evaluation, Evaluation.booking_id == Booking.id)
            .filter(Booking.exam_id == eid, Booking.status == "Booked", Evaluation.id.is_(None)).count())


@api.post("/exams/<int:eid>/publish")
@roles("admin")
def publish_results(u, eid):
    e = get_or_404(Exam, eid)
    if e.results_published:
        raise ApiError("Results are already published", 409)
    if e.status not in ("Closed", "Completed"):
        raise ApiError("Close the examination before publishing its results", 409)
    pending = pending_for_exam(eid)
    if pending and body().get("force") is not True:  # publishing is final, so unevaluated students need a deliberate yes
        raise ApiError(f"{pending} booked student(s) have not been evaluated yet. "
                       "They will get no result if you publish now.", 409, pending_evaluations=pending)
    e.results_published = True
    e.status = "Completed"
    for b in Booking.query.filter(Booking.exam_id == eid, Booking.status == "Completed").all():
        notify(b.student_id, f"Results published for {e.name}", "/student/results")
        mail_async(b.student.email, f"Results published: {e.name}",
                   email_html(f"Your result for {e.name} is available", f"Hi {b.student.name}, the results have been published.",
                              [("Examination", f"{e.name} ({e.course.code})")],
                              note="Sign in to the portal (Results) to see your marks, rubric breakdown and examiner feedback."))
    db.session.commit()
    audit(u, "exam.publish", exam=eid, pending_evaluations=pending)
    clear_exam_cache()
    return jsonify(exam=e.to_dict(), pending_evaluations=pending)
