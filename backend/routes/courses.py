from flask import jsonify

from models import Course, db
from routes.common import ApiError, api, body, clean, clear_exam_cache, course_status, get_or_404, roles


# ---------- courses ----------
@api.get("/courses")
@roles("admin", "examiner", "student")
def list_courses(u):
    q = Course.query
    if u.role != "admin":
        q = q.filter_by(status="Active")
    return jsonify([c.to_dict() for c in q.order_by(Course.code).all()])


@api.post("/courses")
@roles("admin")
def create_course(u):
    d = body()
    code = clean(d.get("code"), "code", required=True).upper()
    if len(code) > 20:
        raise ApiError("'code' must be at most 20 characters")
    if Course.query.filter_by(code=code).first():
        raise ApiError("Course code already exists", 409)
    c = Course(code=code, name=clean(d.get("name"), "name", required=True),
               description=clean(d.get("description"), "description"),
               status=course_status(d.get("status", "Active")))
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


@api.put("/courses/<int:cid>")
@roles("admin")
def update_course(u, cid):
    c, d = get_or_404(Course, cid), body()
    code = clean(d.get("code", c.code), "code", required=True).upper()
    if len(code) > 20:
        raise ApiError("'code' must be at most 20 characters")
    if code != c.code and Course.query.filter_by(code=code).first():
        raise ApiError("Course code already exists", 409)
    c.code, c.name = code, clean(d.get("name", c.name), "name", required=True)
    c.description = clean(d.get("description", c.description), "description")
    c.status = course_status(d.get("status", c.status))
    db.session.commit()
    clear_exam_cache()
    return jsonify(c.to_dict())


@api.delete("/courses/<int:cid>")
@roles("admin")
def delete_course(u, cid):
    c = get_or_404(Course, cid)
    if c.exams:
        raise ApiError("Course has examinations; mark it Inactive instead", 409)
    db.session.delete(c)
    db.session.commit()
    return jsonify(ok=True)
