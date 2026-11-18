from datetime import date

from flask import jsonify, request

import cache
from models import Booking, Exam, Slot, User, db
from routes.common import ApiError, BOOKING_LOAD, SLOT_LOAD, api, audit, body, exam_for, get_or_404, need, notify, pdate, pint, ptime, refresh_slot_status, require_assigned, roles, serialized, to_int, valid_link


# ---------- slots ----------
def slot_fields(d, exam):
    need(d, "date", "start_time", "end_time", "capacity")
    out = dict(date=pdate(d["date"], "date"), start_time=ptime(d["start_time"], "start_time"),
               end_time=ptime(d["end_time"], "end_time"), capacity=pint(d["capacity"], "capacity"),
               meeting_link=valid_link(d.get("meeting_link")))
    if out["end_time"] <= out["start_time"]:
        raise ApiError("End time must be after start time")
    return out


def check_overlap(examiner_id, f, ignore_id=None):
    q = Slot.query.filter(Slot.examiner_id == examiner_id, Slot.date == f["date"], Slot.status != "Cancelled",
                          Slot.start_time < f["end_time"], Slot.end_time > f["start_time"])
    if ignore_id:
        q = q.filter(Slot.id != ignore_id)
    if q.first():
        raise ApiError("The examiner already has an overlapping slot at that time", 409)


@api.get("/slots")
@roles("admin", "examiner", "student")
def list_slots(u):
    a = request.args
    if u.role == "student":
        if not a.get("exam_id"):
            raise ApiError("exam_id is required")
        exam_id = to_int(a["exam_id"], "exam_id")
        exam_for(u, exam_id)
        key = f"schedule:{exam_id}"
        hit = cache.get(key)
        if hit is None:
            hit = [s.to_dict() for s in Slot.query.options(*SLOT_LOAD)
                   .filter(Slot.exam_id == exam_id, Slot.status != "Cancelled").order_by(Slot.date, Slot.start_time)]
            cache.put(key, hit, 60)
        return jsonify(hit)
    q = Slot.query.options(*SLOT_LOAD)
    if u.role == "examiner":
        q = q.filter_by(examiner_id=u.id)
    if a.get("exam_id"):
        q = q.filter_by(exam_id=to_int(a["exam_id"], "exam_id"))
    if a.get("examiner_id") and u.role == "admin":
        q = q.filter_by(examiner_id=to_int(a["examiner_id"], "examiner_id"))
    return jsonify([s.to_dict() for s in q.order_by(Slot.date, Slot.start_time)])


@api.post("/slots")
@roles("admin", "examiner")
@serialized
def create_slot(u):
    d = body()
    need(d, "exam_id")
    exam = get_or_404(Exam, to_int(d["exam_id"], "exam_id"))
    examiner_id = u.id
    if u.role == "admin":
        need(d, "examiner_id")
        examiner_id = to_int(d["examiner_id"], "examiner_id")
    else:
        today = date.today()
        if exam.status != "Slot Creation":
            raise ApiError("Slot creation is not open for this examination", 403)
        if (exam.slot_start and today < exam.slot_start) or (exam.slot_end and today > exam.slot_end):
            raise ApiError("Outside the slot creation period "
                           f"({exam.slot_start or '-'} to {exam.slot_end or '-'})", 403)
    if examiner_id not in [x.id for x in exam.examiners]:
        raise ApiError("Examiner is not assigned to this examination", 403)
    f = slot_fields(d, exam)
    if f["date"] < date.today():
        raise ApiError("Slot date cannot be in the past")
    if exam.results_published or exam.status not in ("Slot Creation", "Booking Open"):
        # The admin may add slots outside the examiner's slot-creation dates (e.g. an extra session while booking
        # is open), but never to a Draft, Closed or Completed examination.
        raise ApiError("Slots can only be added while the examination is in Slot Creation or Booking Open", 409)
    check_overlap(examiner_id, f)
    s = Slot(exam_id=exam.id, examiner_id=examiner_id, available_seats=f["capacity"], **f)
    db.session.add(s)
    db.session.commit()
    audit(u, "slot.create", slot=s.id, exam=exam.id, examiner=examiner_id)
    cache.invalidate("schedule:")
    return jsonify(s.to_dict()), 201


@api.put("/slots/<int:sid>")
@roles("admin", "examiner")
@serialized
def update_slot(u, sid):
    s, d = get_or_404(Slot, sid), body()
    active = [b for b in s.bookings if b.status != "Cancelled"]
    if u.role == "examiner":
        if s.examiner_id != u.id:
            raise ApiError("Not your slot", 403)
        require_assigned(u, s.exam)
        if s.exam.status not in ("Draft", "Slot Creation") or active:
            raise ApiError("Slots can only be changed before student booking begins", 403)
    f = slot_fields(d, s.exam)
    if f["date"] != s.date and f["date"] < date.today():
        raise ApiError("Slot date cannot be moved into the past")
    if f["capacity"] < len(active):
        raise ApiError("Capacity cannot be lower than the number of booked students")
    check_overlap(s.examiner_id, f, s.id)
    for k, v in f.items():
        setattr(s, k, v)
    s.available_seats = f["capacity"] - len(active)
    refresh_slot_status(s)
    db.session.commit()
    cache.invalidate("schedule:")
    if u.role == "admin":
        for b in active:
            notify(b.student_id, f"Your {s.exam.name} slot was rescheduled to {s.date} {s.start_time:%H:%M}",
                   "/student/bookings")
        db.session.commit()
    return jsonify(s.to_dict())


@api.delete("/slots/<int:sid>")
@roles("admin", "examiner")
def delete_slot(u, sid):
    s = get_or_404(Slot, sid)
    active = [b for b in s.bookings if b.status != "Cancelled"]
    if u.role == "examiner":
        if s.examiner_id != u.id:
            raise ApiError("Not your slot", 403)
        if s.exam.status not in ("Draft", "Slot Creation") or active:
            raise ApiError("Slots can only be removed before student booking begins", 403)
    if active:
        raise ApiError("Slot has bookings. Reschedule them first.", 409)
    s.status = "Cancelled"
    db.session.commit()
    cache.invalidate("schedule:")
    return jsonify(ok=True)


@api.put("/slots/<int:sid>/examiner")
@roles("admin")
@serialized
def reassign_examiner(u, sid):
    s = get_or_404(Slot, sid)
    x = get_or_404(User, to_int(body().get("examiner_id", 0), "examiner_id"))
    if x.role != "examiner" or x not in s.exam.examiners:
        raise ApiError("Examiner must be assigned to this examination")
    if x.status != "Active":
        raise ApiError(f"{x.name} is inactive and cannot be assigned a slot")
    check_overlap(x.id, dict(date=s.date, start_time=s.start_time, end_time=s.end_time), s.id)
    old_examiner = s.examiner_id
    s.examiner_id = x.id
    for b in s.bookings:
        if b.status != "Cancelled":
            notify(b.student_id, f"Examiner for {s.exam.name} changed to {x.name}", "/student/bookings")
    notify(x.id, f"You were assigned a slot for {s.exam.name} on {s.date}", "/examiner/slots")
    db.session.commit()
    audit(u, "slot.reassign", slot=s.id, old_examiner=old_examiner, new_examiner=x.id)
    cache.invalidate("schedule:")
    return jsonify(s.to_dict())


@api.get("/slots/<int:sid>/bookings")
@roles("admin", "examiner")
def slot_bookings(u, sid):
    s = get_or_404(Slot, sid)
    if u.role == "examiner":
        if s.examiner_id != u.id:
            raise ApiError("Not your slot", 403)
        require_assigned(u, s.exam)
    rows = Booking.query.options(*BOOKING_LOAD).filter(Booking.slot_id == s.id, Booking.status != "Cancelled").all()
    return jsonify([b.to_dict(with_eval=True) for b in rows])


@api.post("/slots/<int:sid>/complete")
@roles("examiner")
def complete_slot(u, sid):
    s = get_or_404(Slot, sid)
    if s.examiner_id != u.id:
        raise ApiError("Not your slot", 403)
    require_assigned(u, s.exam)
    if any(b.status == "Booked" and not b.evaluation for b in s.bookings):
        raise ApiError("Evaluate all booked students first")
    s.status = "Completed"
    db.session.commit()
    cache.invalidate("schedule:")
    return jsonify(s.to_dict())
