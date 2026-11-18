from models.base import db, iso, utc_now


class Notification(db.Model):
    __tablename__ = "notifications"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, index=True)
    message = db.Column(db.String(255), nullable=False)
    link = db.Column(db.String(255))
    read = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self):
        return dict(id=self.id, message=self.message, link=self.link, read=self.read, created_at=iso(self.created_at))


class ExportJob(db.Model):
    __tablename__ = "export_jobs"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    status = db.Column(db.String(10), default="Pending", nullable=False)  # Pending|Done|Failed
    filename = db.Column(db.String(200))
    created_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self):
        return dict(id=self.id, status=self.status, created_at=iso(self.created_at))
