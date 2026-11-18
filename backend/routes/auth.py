from flask import current_app, jsonify, request

import cache
from models import User, db
from routes.common import ApiError, LOGIN_ROLES, api, body, check_phone, clean, create_access_token, need, rate_limit, read_token, roles, valid_email, valid_password


# ---------- auth ----------
@api.post("/auth/register")
def register():
    rate_limit("register", 30, 3600)
    d = body()
    need(d, "email", "password", "name")
    email = valid_email(d["email"])
    valid_password(d["password"])
    phone = check_phone(d.get("phone"))
    if User.query.filter_by(email=email).first():
        raise ApiError("Email already registered", 409)
    u = User(email=email, name=clean(d["name"], "name", required=True), role="student",
             phone=phone, department=clean(d.get("department"), "department"))
    u.set_password(d["password"])
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict()), 201


@api.post("/auth/login")
def login():
    rate_limit("login", 120, 60)  # generous cap on all attempts (password hashing is CPU work)
    d = body()
    need(d, "email", "password")
    role = d.get("role")
    if role is not None and (not isinstance(role, str) or role not in LOGIN_ROLES):
        raise ApiError("'role' must be admin, examiner or student")
    ip_key = f"login_fail_ip:{request.remote_addr}"
    acct_key = f"login_fail_acct:{str(d['email']).strip().lower()}"
    # Only FAILED attempts count towards a lock-out, so successful sign-ins never lock anyone out.
    if cache.count(ip_key) >= 10 or cache.count(acct_key) >= 10:
        raise ApiError("Too many failed sign-in attempts. Please wait a few minutes and try again.", 429)
    u = None
    if isinstance(d["email"], str) and isinstance(d["password"], str):
        u = User.query.filter_by(email=d["email"].strip().lower()).first()
    if not u or not u.check_password(d["password"]):
        cache.hit(ip_key, 60)
        cache.hit(acct_key, 300)
        raise ApiError("Invalid credentials", 401)
    cache.clear(acct_key)
    # The sign-in form asks "Sign in as Admin / Examiner / Student". Checked only after the password is right, so it
    # tells nothing to someone who does not know the credentials.
    if role is not None and u.role != role:
        raise ApiError(f"This account is not {LOGIN_ROLES[role]} account. Choose the role you were given and try again.", 403)
    if u.status != "Active":
        raise ApiError("Account is inactive. Contact the administrator.", 403)
    return jsonify(token=create_access_token(u.id), user=u.to_dict())


@api.post("/auth/logout")
def logout_api():
    cache.put("revoked:" + read_token()["jti"], 1, current_app.config["JWT_ACCESS_TOKEN_EXPIRES"])
    return jsonify(ok=True)


@api.get("/auth/me")
@roles("admin", "examiner", "student")
def me(u):
    return jsonify(u.to_dict())


@api.put("/auth/me")
@roles("admin", "examiner", "student")
def update_me(u):
    d = body()
    if d.get("name"):
        u.name = clean(d["name"], "name", required=True)
    if "phone" in d:
        u.phone = check_phone(d["phone"])
    if "department" in d:
        u.department = clean(d["department"], "department")
    if d.get("password"):
        u.set_password(valid_password(d["password"]))
    db.session.commit()
    return jsonify(u.to_dict())
