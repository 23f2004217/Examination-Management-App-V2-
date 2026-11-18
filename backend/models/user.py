from werkzeug.security import check_password_hash, generate_password_hash

from models.base import db, utc_now


class User(db.Model):
    """Unified user model for admin / examiner / student."""
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(256), nullable=False)
    name = db.Column(db.String(100), nullable=False)
    role = db.Column(db.String(10), nullable=False)  # admin | examiner | student
    phone = db.Column(db.String(20))
    department = db.Column(db.String(80))
    status = db.Column(db.String(10), default="Active", nullable=False)  # Active | Inactive
    created_at = db.Column(db.DateTime, default=utc_now)

    __table_args__ = (db.CheckConstraint("role in ('admin','examiner','student')", name="ck_user_role"),)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return dict(id=self.id, email=self.email, name=self.name, role=self.role, phone=self.phone,
                    department=self.department, status=self.status)
