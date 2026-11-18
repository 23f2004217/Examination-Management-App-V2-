from flask import jsonify

import cache
from models import EvaluationScore, Exam, Rubric, db
from routes.common import ApiError, api, body, clean, exam_for, get_or_404, need, roles
from routes.exams import has_evaluations


# ---------- rubrics ----------
@api.get("/exams/<int:eid>/rubrics")
@roles("admin", "examiner", "student")
def list_rubrics(u, eid):
    exam_for(u, eid)
    key = f"rubrics:{eid}"
    hit = cache.get(key)
    if hit is None:
        hit = [r.to_dict() for r in Rubric.query.filter_by(exam_id=eid).order_by(Rubric.id)]
        cache.put(key, hit, 300)
    return jsonify(hit)


def rubric_fields(d):
    need(d, "criterion", "max_marks")
    try:
        mm, w = float(d["max_marks"]), float(d.get("weightage", 1))
    except (ValueError, TypeError):
        raise ApiError("Marks and weightage must be numbers")
    if not (0 < mm <= 1000 and 0 < w <= 1000):
        raise ApiError("Marks and weightage must be positive numbers (max 1000)")
    return dict(criterion=clean(d["criterion"], "criterion", required=True), max_marks=mm, weightage=w,
                description=clean(d.get("description"), "description"))


@api.post("/exams/<int:eid>/rubrics")
@roles("admin")
def create_rubric(u, eid):
    get_or_404(Exam, eid)
    if has_evaluations(eid):
        raise ApiError("The rubric is locked because evaluations already exist", 409)
    r = Rubric(exam_id=eid, **rubric_fields(body()))
    db.session.add(r)
    db.session.commit()
    cache.invalidate("rubrics:")
    return jsonify(r.to_dict()), 201


@api.put("/rubrics/<int:rid>")
@roles("admin")
def update_rubric(u, rid):
    r = get_or_404(Rubric, rid)
    if has_evaluations(r.exam_id):
        raise ApiError("The rubric is locked because evaluations already exist", 409)
    for k, v in rubric_fields(body()).items():
        setattr(r, k, v)
    db.session.commit()
    cache.invalidate("rubrics:")
    return jsonify(r.to_dict())


@api.delete("/rubrics/<int:rid>")
@roles("admin")
def delete_rubric(u, rid):
    r = get_or_404(Rubric, rid)
    if EvaluationScore.query.filter_by(rubric_id=rid).count():
        raise ApiError("Rubric already used in evaluations", 409)
    db.session.delete(r)
    db.session.commit()
    cache.invalidate("rubrics:")
    return jsonify(ok=True)
