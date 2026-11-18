from flask import current_app, jsonify, send_from_directory

from models import ExportJob, Notification, db
from routes.common import ApiError, api, get_or_404, roles, run_task


# ---------- notifications & CSV export ----------
@api.get("/notifications")
@roles("admin", "examiner", "student")
def notifications(u):
    n = Notification.query.filter_by(user_id=u.id).order_by(Notification.id.desc()).limit(30).all()
    return jsonify([x.to_dict() for x in n])


@api.post("/notifications/read")
@roles("admin", "examiner", "student")
def read_notifications(u):
    Notification.query.filter_by(user_id=u.id, read=False).update({Notification.read: True})
    db.session.commit()
    return jsonify(ok=True)


@api.post("/export/history")
@roles("student")
def export_history(u):
    from tasks import export_history as task
    job = ExportJob(user_id=u.id)
    db.session.add(job)
    db.session.commit()
    run_task(task, job.id)
    return jsonify(job.to_dict()), 202


@api.get("/export/<int:jid>")
@roles("student")
def export_status(u, jid):
    j = get_or_404(ExportJob, jid)
    if j.user_id != u.id:
        raise ApiError("Not your export", 403)
    return jsonify(j.to_dict())


@api.get("/export/<int:jid>/download")
@roles("student")
def export_download(u, jid):
    j = get_or_404(ExportJob, jid)
    if j.user_id != u.id or j.status != "Done":
        raise ApiError("Export not available", 404)
    return send_from_directory(current_app.config["EXPORT_DIR"], j.filename, as_attachment=True)
