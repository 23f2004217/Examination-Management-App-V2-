from datetime import date

from flask import jsonify, request
from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError

import cache
from models import Booking, Exam, Slot, User, db
from services import email_html
from routes.common import ApiError, BOOKING_LOAD, api, audit, body, get_or_404, mail_async, notify, refresh_slot_status, roles, serialized, to_int


# ---------- bookings ----------
@api.get("/bookings")
@roles("admin", "student")
def list_bookings(u):
    q = Booking.query
    if u.role == "student":
        q = q.filter_by(student_id=u.id)
    elif request.args.get("q"):
        like = f"%{request.args['q']}%"
        q = q.join(User, Booking.student_id == User.id).join(Exam, Booking.exam_id == Exam.id).filter(
            or_(User.name.ilike(like), Exam.name.ilike(like), User.email.ilike(like),
                Booking.id == (int(request.args["q"]) if request.args["q"].isdigit() else -1)))
    if request.args.get("status"):
        q = q.filter(Booking.status == request.args["status"])
    # Load everything to_dict() touches in a few queries instead of several per booking (N+1).
    q = q.options(*BOOKING_LOAD)
    data = [b.to_dict(with_eval=True) for b in q.order_by(Booking.id.desc())]
    if u.role == "student":  # marks/remarks stay hidden until results are published
        for b in data:
            if not b["results_published"]:
                b.pop("evaluation", None)
    return jsonify(data)


@api.post("/bookings")
@roles("student")
@serialized
def book_slot(u):
    s = get_or_404(Slot, to_int(body().get("slot_id", 0), "slot_id"))
    exam = s.exam
    today = date.today()
    if exam.status != "Booking Open":
        raise ApiError("Booking is not open for this examination", 403)
    if s.date < today:
        raise ApiError("This slot is in the past", 409)
    if (exam.booking_start and today < exam.booking_start) or (exam.booking_end and today > exam.booking_end):
        raise ApiError("Outside the booking period", 403)
    if Booking.query.filter(Booking.student_id == u.id, Booking.exam_id == exam.id,
                            Booking.status != "Cancelled").first():
        raise ApiError("You already have a booking for this examination", 409)
    clash = Booking.query.join(Slot).filter(
        Booking.student_id == u.id,
        Booking.status != "Cancelled",
        Slot.date == s.date,
        Slot.start_time < s.end_time,
        Slot.end_time > s.start_time
    ).first()
    if clash:
        raise ApiError("You already have an active booking that overlaps with this time slot", 409)
    if s.status != "Available":
        raise ApiError("Slot is not available", 409)
    # atomic decrement guards against overbooking under concurrent requests
    n = Slot.query.filter(Slot.id == s.id, Slot.available_seats > 0).update(
        {Slot.available_seats: Slot.available_seats - 1}, synchronize_session=False)
    if not n:
        db.session.rollback()
        raise ApiError("Slot is full", 409)
    db.session.expire(s)
    b = Booking(student_id=u.id, slot_id=s.id, exam_id=exam.id)
    db.session.add(b)
    refresh_slot_status(s)
    notify(u.id, f"Booked {exam.name} on {s.date} at {s.start_time:%H:%M}", "/student/bookings")
    notify(s.examiner_id, f"{u.name} booked your {exam.name} slot on {s.date}", "/examiner/slots")
    try:
        db.session.commit()
    except IntegrityError:  # a parallel request won the race: the unique index rejects the second booking
        db.session.rollback()
        raise ApiError("You already have a booking for this examination", 409)
    cache.invalidate("schedule:")
    mail_async(u.email, f"Booking confirmed: {exam.name}",
               email_html("Your booking is confirmed", f"Hi {u.name}, your slot is booked.",
                          [("Examination", f"{exam.name} ({exam.course.code})"), ("Date", f"{s.date:%A, %d %B %Y}"),
                           ("Time", f"{s.start_time:%H:%M} - {s.end_time:%H:%M}"), ("Examiner", s.examiner.name),
                           ("Meeting link", s.meeting_link)],
                          note="You can cancel from My Bookings until the booking deadline."))
    return jsonify(b.to_dict()), 201


@api.post("/bookings/<int:bid>/cancel")
@roles("student")
def cancel_booking(u, bid):
    b = get_or_404(Booking, bid)
    if b.student_id != u.id:
        raise ApiError("Not your booking", 403)
    if b.status != "Booked":
        raise ApiError("Only active bookings can be cancelled")
    end = b.exam.booking_end
    if end and date.today() > end:
        raise ApiError("Booking deadline has passed", 403)
    if b.slot.date < date.today():
        raise ApiError("The examination date has already passed", 403)
    b.status = "Cancelled"
    Slot.query.filter(Slot.id == b.slot_id, Slot.available_seats < Slot.capacity).update(
        {Slot.available_seats: Slot.available_seats + 1}, synchronize_session=False)
    db.session.expire(b.slot)
    refresh_slot_status(b.slot)
    notify(u.id, f"Cancelled booking for {b.exam.name}", "/student/bookings")
    db.session.commit()
    mail_async(u.email, f"Booking cancelled: {b.exam.name}",
               email_html("Your booking was cancelled", f"Hi {u.name}, your booking has been cancelled.",
                          [("Examination", f"{b.exam.name} ({b.exam.course.code})"), ("Date", f"{b.slot.date:%A, %d %B %Y}"),
                           ("Time", f"{b.slot.start_time:%H:%M} - {b.slot.end_time:%H:%M}")],
                          note="You may book another slot while booking is open."))
    cache.invalidate("schedule:")
    return jsonify(b.to_dict())


@api.put("/bookings/<int:bid>/reschedule")
@roles("admin")
@serialized
def reschedule_booking(u, bid):
    b = get_or_404(Booking, bid)
    new = get_or_404(Slot, to_int(body().get("slot_id", 0), "slot_id"))
    if b.status != "Booked":
        raise ApiError("Only active bookings can be rescheduled")
    if new.exam_id != b.exam_id:
        raise ApiError("New slot must belong to the same examination")
    if new.id == b.slot_id:
        raise ApiError("Booking is already in this slot")
    if new.status != "Available" or new.available_seats <= 0:
        raise ApiError("New slot has no free seat", 409)
    clash = Booking.query.join(Slot).filter(
        Booking.student_id == b.student_id,
        Booking.id != b.id,
        Booking.status != "Cancelled",
        Slot.date == new.date,
        Slot.start_time < new.end_time,
        Slot.end_time > new.start_time
    ).first()
    if clash:
        raise ApiError("Student already has an active booking that overlaps with this time slot", 409)
    old_id, new_id = b.slot_id, new.id
    taken = Slot.query.filter(Slot.id == new_id, Slot.available_seats > 0).update(
        {Slot.available_seats: Slot.available_seats - 1}, synchronize_session=False)
    if not taken:
        db.session.rollback()
        raise ApiError("New slot has no free seat", 409)
    Slot.query.filter(Slot.id == old_id, Slot.available_seats < Slot.capacity).update(
        {Slot.available_seats: Slot.available_seats + 1}, synchronize_session=False)
    b.slot_id = new_id
    db.session.flush()
    db.session.expire_all()
    refresh_slot_status(db.session.get(Slot, old_id))
    refresh_slot_status(db.session.get(Slot, new_id))
    new = db.session.get(Slot, new_id)
    b = db.session.get(Booking, bid)
    notify(b.student_id, f"Your {b.exam.name} booking moved to {new.date} {new.start_time:%H:%M} "
                         f"with {new.examiner.name}", "/student/bookings")
    db.session.commit()
    mail_async(b.student.email, f"Booking rescheduled: {b.exam.name}",
               email_html("Your booking was rescheduled", f"Hi {b.student.name}, the administrator moved your slot.",
                          [("Examination", f"{b.exam.name} ({b.exam.course.code})"), ("New date", f"{new.date:%A, %d %B %Y}"),
                           ("Time", f"{new.start_time:%H:%M} - {new.end_time:%H:%M}"), ("Examiner", new.examiner.name),
                           ("Meeting link", new.meeting_link)]))
    audit(u, "booking.reschedule", booking=bid, old_slot=old_id, new_slot=new_id)
    cache.invalidate("schedule:")
    return jsonify(b.to_dict())
