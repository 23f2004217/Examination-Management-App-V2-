from models.base import db


class Course(db.Model):
    __tablename__ = "courses"
    id = db.Column(db.Integer, primary_key=True)
    code = db.Column(db.String(20), unique=True, nullable=False)
    name = db.Column(db.String(120), nullable=False)
    description = db.Column(db.Text)
    status = db.Column(db.String(10), default="Active", nullable=False)
    exams = db.relationship("Exam", backref="course", lazy=True)

    def to_dict(self):
        return dict(id=self.id, code=self.code, name=self.name, description=self.description, status=self.status)
