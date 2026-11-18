from models.base import db, iso, utc_now


class Evaluation(db.Model):
    __tablename__ = "evaluations"
    id = db.Column(db.Integer, primary_key=True)
    booking_id = db.Column(db.Integer, db.ForeignKey("bookings.id"), unique=True, nullable=False)
    student_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    examiner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    total_marks = db.Column(db.Float, nullable=False)
    remarks = db.Column(db.Text)
    evaluated_at = db.Column(db.DateTime, default=utc_now)
    status = db.Column(db.String(12), default="Evaluated", nullable=False)
    scores = db.relationship("EvaluationScore", backref="evaluation", cascade="all, delete-orphan")

    def to_dict(self):
        return dict(id=self.id, total_marks=self.total_marks, remarks=self.remarks,
                    evaluated_at=iso(self.evaluated_at), status=self.status,
                    scores=[dict(rubric_id=s.rubric_id, criterion=s.rubric.criterion, marks=s.marks,
                                 max_marks=s.rubric.max_marks) for s in self.scores])


class EvaluationScore(db.Model):
    __tablename__ = "evaluation_scores"
    id = db.Column(db.Integer, primary_key=True)
    evaluation_id = db.Column(db.Integer, db.ForeignKey("evaluations.id"), nullable=False)
    rubric_id = db.Column(db.Integer, db.ForeignKey("rubrics.id"), nullable=False)
    marks = db.Column(db.Float, nullable=False)
    rubric = db.relationship("Rubric")


class EvaluationHistory(db.Model):
    """Snapshot of an evaluation taken just before it is overwritten (re-evaluation before publication)."""
    __tablename__ = "evaluation_history"
    id = db.Column(db.Integer, primary_key=True)
    evaluation_id = db.Column(db.Integer, db.ForeignKey("evaluations.id"), nullable=False, index=True)
    examiner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    total_marks = db.Column(db.Float, nullable=False)
    remarks = db.Column(db.Text)
    scores_json = db.Column(db.Text, nullable=False)  # [{"rubric_id": 1, "criterion": "...", "marks": 8.0}, ...]
    evaluated_at = db.Column(db.DateTime)
    superseded_at = db.Column(db.DateTime, default=utc_now)

    def to_dict(self):
        import json
        return dict(id=self.id, evaluation_id=self.evaluation_id, examiner_id=self.examiner_id,
                    total_marks=self.total_marks, remarks=self.remarks, scores=json.loads(self.scores_json),
                    evaluated_at=iso(self.evaluated_at), superseded_at=iso(self.superseded_at))
