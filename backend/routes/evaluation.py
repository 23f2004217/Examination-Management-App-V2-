import json
import re
from datetime import date

from flask import Response, jsonify

from models import Booking, Evaluation, EvaluationHistory, EvaluationScore, Exam, User, db, utc_now
from services import scorecard_pdf
from routes.common import ApiError, BOOKING_LOAD, api, audit, body, clean, get_or_404, require_assigned, roles, to_int


# ---------- evaluation ----------
@api.post("/bookings/<int:bid>/evaluate")
@roles("examiner")
def evaluate(u, bid):
    b, d = get_or_404(Booking, bid), body()
    if b.slot.examiner_id != u.id:
        raise ApiError("You can only evaluate students booked into your slots", 403)
    require_assigned(u, b.exam)
    if b.status == "Cancelled":
        raise ApiError("Booking was cancelled")
    if b.exam.results_published:
        raise ApiError("Results already published", 403)
    if b.exam.status in ("Draft", "Slot Creation"):  # defensive: bookings only exist once booking has opened
        raise ApiError("This examination has not started yet", 409)
    rubrics = {r.id: r for r in b.exam.rubrics}
    if not rubrics:
        raise ApiError("No rubric defined for this examination")
    raw = d.get("scores", [])
    if not isinstance(raw, list) or not all(isinstance(x, dict) and "rubric_id" in x for x in raw):
        raise ApiError("'scores' must be a list of {rubric_id, marks}")
    scores = {to_int(x["rubric_id"], "rubric_id"): x.get("marks") for x in raw}
    if set(scores) != set(rubrics):
        raise ApiError("Provide marks for every rubric criterion")
    weighted, wsum = 0.0, 0.0
    for rid, r in rubrics.items():
        try:
            m = float(scores[rid])
        except (TypeError, ValueError):
            raise ApiError(f"Marks for '{r.criterion}' must be a number")
        if not 0 <= m <= r.max_marks:
            raise ApiError(f"Marks for '{r.criterion}' must be between 0 and {r.max_marks:g}")
        scores[rid] = m
        weighted += m / r.max_marks * r.weightage
        wsum += r.weightage
    total = round(weighted / wsum * b.exam.max_marks, 2)
    remarks = clean(d.get("remarks"), "remarks")
    ev = b.evaluation
    if ev:  # re-evaluation: keep what is about to be overwritten
        db.session.add(EvaluationHistory(
            evaluation_id=ev.id, examiner_id=ev.examiner_id, total_marks=ev.total_marks, remarks=ev.remarks,
            evaluated_at=ev.evaluated_at,
            scores_json=json.dumps([dict(rubric_id=s.rubric_id, criterion=s.rubric.criterion, marks=s.marks)
                                    for s in ev.scores])))
    else:
        ev = Evaluation(booking_id=b.id, student_id=b.student_id, examiner_id=u.id, total_marks=total)
    ev.total_marks, ev.remarks, ev.evaluated_at, ev.status = total, remarks, utc_now(), "Evaluated"
    ev.examiner_id = u.id
    ev.scores = [EvaluationScore(rubric_id=rid, marks=m) for rid, m in scores.items()]
    b.status = "Completed"
    db.session.add(ev)
    db.session.commit()
    audit(u, "evaluation.save", booking=b.id, student=b.student_id, total=total)
    return jsonify(b.to_dict(with_eval=True))


@api.get("/bookings/<int:bid>/evaluation-history")
@roles("admin")
def evaluation_history(u, bid):
    """Earlier versions of an evaluation that was changed before results were published (newest first)."""
    b = get_or_404(Booking, bid)
    rows = []
    if b.evaluation:
        rows = EvaluationHistory.query.filter_by(evaluation_id=b.evaluation.id).order_by(EvaluationHistory.id.desc())
    return jsonify([h.to_dict() for h in rows])


@api.get("/bookings/<int:bid>/scorecard.pdf")
@roles("student")
def scorecard(u, bid):
    """Downloadable PDF scorecard of the student's OWN evaluated booking, available once the results are published."""
    b = get_or_404(Booking, bid)
    if b.student_id != u.id:
        raise ApiError("Not your booking", 403)
    ev = b.evaluation
    if not ev or not b.exam.results_published:
        raise ApiError("The scorecard is available once the results are published", 404)
    examiner = db.session.get(User, ev.examiner_id) or b.slot.examiner
    pdf = scorecard_pdf(dict(
        student=u.name, email=u.email, exam=b.exam.name, course=f"{b.exam.course.code} · {b.exam.course.name}",
        examiner=examiner.name, evaluated=ev.evaluated_at.strftime("%d %B %Y") if ev.evaluated_at else "-",
        generated=date.today().strftime("%d %B %Y"), total=ev.total_marks, max_total=b.exam.max_marks, remarks=ev.remarks,
        rows=[(s.rubric.criterion, s.marks, s.rubric.max_marks) for s in sorted(ev.scores, key=lambda s: s.rubric_id)]))
    name = re.sub(r"[^A-Za-z0-9]+", "_", b.exam.name).strip("_") or "exam"
    return Response(pdf, mimetype="application/pdf", headers={"Content-Disposition": f"attachment; filename=scorecard_{name}.pdf"})


@api.get("/results")
@roles("student")
def results(u):
    bs = (Booking.query.options(*BOOKING_LOAD).join(Exam, Booking.exam_id == Exam.id)
          .filter(Booking.student_id == u.id, Exam.results_published.is_(True), Booking.status == "Completed").all())
    return jsonify([b.to_dict(with_eval=True) for b in bs])
