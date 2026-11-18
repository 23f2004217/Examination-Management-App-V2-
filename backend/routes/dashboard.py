from datetime import date, timedelta

from flask import Response, current_app, jsonify, request
from sqlalchemy import func, or_

from models import Booking, Course, Evaluation, Exam, Slot, User, db, utc_now
from services import monthly_report_html, monthly_report_pdf, monthly_stats
from routes.common import BOOKING_LOAD, EXAM_LOAD, SLOT_LOAD, api, mail_async, roles


# ---------- dashboards ----------
@api.get("/dashboard")
@roles("admin", "examiner", "student")
def dashboard(u):
    today = date.today()
    if u.role == "admin":
        count = lambda col, *cond: db.select(func.count(col)).where(*cond).scalar_subquery()  # noqa: E731
        n = db.session.execute(db.select(
            count(Course.id), count(Exam.id), count(User.id, User.role == "student"), count(User.id, User.role == "examiner"),
            count(Slot.id, Slot.status != "Cancelled"), count(Booking.id, Booking.status != "Cancelled"))).one()
        return jsonify(courses=n[0], exams=n[1], students=n[2], examiners=n[3], slots=n[4], bookings=n[5])
    if u.role == "examiner":
        mine = Slot.query.options(*SLOT_LOAD).filter_by(examiner_id=u.id).filter(Slot.status != "Cancelled").all()
        ids = [s.id for s in mine]
        pend = (Booking.query.outerjoin(Evaluation, Evaluation.booking_id == Booking.id)
                .filter(Booking.slot_id.in_(ids), Booking.status == "Booked", Evaluation.id.is_(None)).count()) \
            if ids else 0
        exams = Exam.query.options(*EXAM_LOAD).filter(Exam.examiners.any(User.id == u.id)).all()
        return jsonify(assigned_exams=[e.to_dict() for e in exams], slots=len(mine),
                       slot_list=[s.to_dict() for s in mine],
                       booked_students=sum(1 for s in mine for b in s.bookings if b.status != "Cancelled"),
                       pending_evaluations=pend)
    bookings = Booking.query.options(*BOOKING_LOAD).filter_by(student_id=u.id).all()
    booked_exam_ids = {b.exam_id for b in bookings if b.status != "Cancelled"}
    # same eligibility as book_slot(): status, booking window, and (for slots) not in the past and not already booked
    in_window = (Exam.status == "Booking Open", or_(Exam.booking_start.is_(None), Exam.booking_start <= today),
                 or_(Exam.booking_end.is_(None), Exam.booking_end >= today))
    open_exams = Exam.query.options(*EXAM_LOAD).filter(*in_window).all()
    avail = (Slot.query.join(Exam).filter(*in_window, Slot.status == "Available", Slot.date >= today)
             .filter(Slot.exam_id.notin_(booked_exam_ids or [0])).count())
    upcoming = [b.to_dict() for b in bookings if b.status == "Booked" and b.slot.date >= today]
    res = [b.to_dict(with_eval=True) for b in bookings if b.evaluation and b.exam.results_published]
    return jsonify(available_exams=[e.to_dict() for e in open_exams if e.id not in booked_exam_ids],
                   available_slots=avail, upcoming=upcoming, booked=len(booked_exam_ids), results=res)


@api.get("/admin/charts")
@roles("admin")
def charts(u):
    popular = (db.session.query(Exam.name, func.count(Booking.id)).join(Booking, Booking.exam_id == Exam.id)
               .filter(Booking.status != "Cancelled").group_by(Exam.id).order_by(func.count(Booking.id).desc())
               .limit(8).all())
    workload = (db.session.query(User.name, func.count(Booking.id)).join(Slot, Slot.examiner_id == User.id)
                .join(Booking, Booking.slot_id == Slot.id).filter(Booking.status != "Cancelled")
                .group_by(User.id).all())
    since = utc_now() - timedelta(days=30)
    trend = (db.session.query(func.date(Booking.booked_at), func.count(Booking.id))
             .filter(Booking.booked_at >= since).group_by(func.date(Booking.booked_at)).all())
    return jsonify(popular=[dict(label=n, value=c) for n, c in popular],
                   workload=[dict(label=n, value=c) for n, c in workload],
                   trend=[dict(label=str(d), value=c) for d, c in sorted(trend)])


@api.get("/admin/search")
@roles("admin")
def search(u):
    q = request.args.get("q", "").strip()
    if not q:
        return jsonify(students=[], examiners=[], exams=[], bookings=[])
    like = f"%{q}%"
    users = User.query.filter(or_(User.name.ilike(like), User.email.ilike(like))).limit(50).all()
    exams = Exam.query.options(*EXAM_LOAD).filter(Exam.name.ilike(like)).limit(30).all()
    bookings = (Booking.query.options(*BOOKING_LOAD).join(User, Booking.student_id == User.id).join(Exam, Booking.exam_id == Exam.id)
                .filter(or_(User.name.ilike(like), Exam.name.ilike(like))).limit(30).all())
    return jsonify(students=[x.to_dict() for x in users if x.role == "student"],
                   examiners=[x.to_dict() for x in users if x.role == "examiner"],
                   exams=[e.to_dict() for e in exams], bookings=[b.to_dict() for b in bookings])


@api.get("/admin/report")
@roles("admin")
def report(u):
    t = date.today()
    return jsonify(monthly_stats(int(request.args.get("year", t.year)), int(request.args.get("month", t.month))))


@api.post("/admin/report/send")
@roles("admin")
def send_report(u):
    t = date.today()
    s = monthly_stats(t.year, t.month)
    mail_async(current_app.config["ADMIN_NOTIFY_EMAIL"], f"Examination report - {s['month']}", monthly_report_html(s), monthly_report_pdf(s))
    return jsonify(ok=True)


@api.get("/admin/report/pdf")
@roles("admin")
def report_pdf(u):
    t = date.today()
    s = monthly_stats(int(request.args.get("year", t.year)), int(request.args.get("month", t.month)))
    return Response(monthly_report_pdf(s), mimetype="application/pdf",
                    headers={"Content-Disposition": "attachment; filename=examination_report.pdf"})
