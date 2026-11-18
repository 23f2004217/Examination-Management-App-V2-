from models.base import db, iso


# many-to-many: examiners assigned to an examination
exam_examiners = db.Table(
    "exam_examiners",
    db.Column("exam_id", db.Integer, db.ForeignKey("exams.id"), primary_key=True),
    db.Column("examiner_id", db.Integer, db.ForeignKey("users.id"), primary_key=True),
)

EXAM_TYPES = ["Viva", "Practical", "Project Demo", "Assessment"]
EXAM_STATUSES = ["Draft", "Slot Creation", "Booking Open", "Closed", "Completed"]
# The only moves the status endpoint accepts (the UI offers just these). Completed can step back to Closed only
# until results are published; after that the status is locked.
EXAM_TRANSITIONS = {
    "Draft": ["Slot Creation"],
    "Slot Creation": ["Draft", "Booking Open", "Closed"],
    "Booking Open": ["Slot Creation", "Closed"],
    "Closed": ["Booking Open", "Completed"],
    "Completed": ["Closed"],
}


class Exam(db.Model):
    __tablename__ = "exams"
    id = db.Column(db.Integer, primary_key=True)
    course_id = db.Column(db.Integer, db.ForeignKey("courses.id"), nullable=False)
    name = db.Column(db.String(120), nullable=False)
    type = db.Column(db.String(20), nullable=False)
    duration = db.Column(db.Integer, nullable=False)  # minutes
    max_marks = db.Column(db.Integer, nullable=False)
    instructions = db.Column(db.Text)
    slot_start = db.Column(db.Date)
    slot_end = db.Column(db.Date)
    booking_start = db.Column(db.Date)
    booking_end = db.Column(db.Date)
    status = db.Column(db.String(15), default="Draft", nullable=False)
    results_published = db.Column(db.Boolean, default=False, nullable=False)
    examiners = db.relationship("User", secondary=exam_examiners, lazy="subquery")
    rubrics = db.relationship("Rubric", backref="exam", cascade="all, delete-orphan", lazy=True)
    slots = db.relationship("Slot", backref="exam", lazy=True)

    def to_dict(self):
        return dict(id=self.id, course_id=self.course_id, course_code=self.course.code, course_name=self.course.name,
                    name=self.name, type=self.type, duration=self.duration, max_marks=self.max_marks,
                    instructions=self.instructions, slot_start=iso(self.slot_start), slot_end=iso(self.slot_end),
                    booking_start=iso(self.booking_start), booking_end=iso(self.booking_end), status=self.status,
                    results_published=self.results_published,
                    next_statuses=[] if self.results_published else EXAM_TRANSITIONS.get(self.status, []),
                    examiners=[dict(id=e.id, name=e.name) for e in self.examiners])


class Rubric(db.Model):
    __tablename__ = "rubrics"
    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)
    criterion = db.Column(db.String(120), nullable=False)
    max_marks = db.Column(db.Float, nullable=False)
    weightage = db.Column(db.Float, default=1, nullable=False)
    description = db.Column(db.Text)

    def to_dict(self):
        return dict(id=self.id, exam_id=self.exam_id, criterion=self.criterion, max_marks=self.max_marks,
                    weightage=self.weightage, description=self.description)
