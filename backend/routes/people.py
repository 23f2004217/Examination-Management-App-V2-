from flask import jsonify, request
from sqlalchemy import or_

from models import User, db
from routes.common import ApiError, api, body, check_phone, clean, get_or_404, need, roles, valid_email, valid_password


# ---------- examiners / students ----------
@api.get("/examiners")
@roles("admin")
def list_examiners(u):
    q = User.query.filter_by(role="examiner")
    if request.args.get("q"):
        like = f"%{request.args['q']}%"
        q = q.filter(or_(User.name.ilike(like), User.email.ilike(like), User.department.ilike(like)))
    return jsonify([x.to_dict() for x in q.order_by(User.name)])


@api.post("/examiners")
@roles("admin")
def create_examiner(u):
    d = body()
    need(d, "email", "name", "password")
    email = valid_email(d["email"])
    valid_password(d["password"])
    phone = check_phone(d.get("phone"))
    if User.query.filter_by(email=email).first():
        raise ApiError("Email already registered", 409)
    x = User(email=email, name=clean(d["name"], "name", required=True), role="examiner",
             phone=phone, department=clean(d.get("department"), "department"))
    x.set_password(d["password"])
    db.session.add(x)
    db.session.commit()
    return jsonify(x.to_dict()), 201


@api.put("/examiners/<int:xid>")
@roles("admin")
def update_examiner(u, xid):
    x, d = get_or_404(User, xid), body()
    if x.role != "examiner":
        raise ApiError("Not an examiner", 404)
    x.name = clean(d.get("name", x.name), "name", required=True)
    x.phone = check_phone(d.get("phone", x.phone))
    x.department = clean(d.get("department", x.department), "department")
    if d.get("status") in ("Active", "Inactive"):
        x.status = d["status"]
    if d.get("password"):
        x.set_password(valid_password(d["password"]))
    db.session.commit()
    return jsonify(x.to_dict())


@api.get("/students")
@roles("admin")
def list_students(u):
    q = User.query.filter_by(role="student")
    if request.args.get("q"):
        like = f"%{request.args['q']}%"
        q = q.filter(or_(User.name.ilike(like), User.email.ilike(like), User.id == (
            int(request.args["q"]) if request.args["q"].isdigit() else -1)))
    return jsonify([x.to_dict() for x in q.order_by(User.name)])


@api.put("/students/<int:sid>/status")
@roles("admin")
def student_status(u, sid):
    s = get_or_404(User, sid)
    if s.role != "student" or body().get("status") not in ("Active", "Inactive"):
        raise ApiError("Invalid request")
    s.status = body()["status"]
    db.session.commit()
    return jsonify(s.to_dict())
