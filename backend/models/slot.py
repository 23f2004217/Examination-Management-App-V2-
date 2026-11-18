from models.base import db, iso, utc_now


class Slot(db.Model):
    __tablename__ = "slots"
    id = db.Column(db.Integer, primary_key=True)
    exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)
    examiner_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    date = db.Column(db.Date, nullable=False)
    start_time = db.Column(db.Time, nullable=False)
    end_time = db.Column(db.Time, nullable=False)
    capacity = db.Column(db.Integer, default=1, nullable=False)
    available_seats = db.Column(db.Integer, default=1, nullable=False)
    status = db.Column(db.String(10), default="Available", nullable=False)  # Available|Full|Cancelled|Completed
    meeting_link = db.Column(db.String(255))
    examiner = db.relationship("User", foreign_keys=[examiner_id])
    bookings = db.relationship("Booking", backref="slot", lazy=True)

    __table_args__ = (db.CheckConstraint("available_seats >= 0", name="ck_slot_seats"),)

    def to_dict(self):
        return dict(id=self.id, exam_id=self.exam_id, exam_name=self.exam.name, examiner_id=self.examiner_id,
                    examiner_name=self.examiner.name, date=iso(self.date),
                    start_time=self.start_time.strftime("%H:%M"), end_time=self.end_time.strftime("%H:%M"),
                    capacity=self.capacity, available_seats=self.available_seats, status=self.status,
                    meeting_link=self.meeting_link,
                    booked=sum(1 for b in self.bookings if b.status != "Cancelled"))


class Booking(db.Model):
    __tablename__ = "bookings"
    id = db.Column(db.Integer, primary_key=True)
    student_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    slot_id = db.Column(db.Integer, db.ForeignKey("slots.id"), nullable=False)
    exam_id = db.Column(db.Integer, db.ForeignKey("exams.id"), nullable=False)  # denormalised for the one-per-exam rule
    booked_at = db.Column(db.DateTime, default=utc_now)
    status = db.Column(db.String(10), default="Booked", nullable=False)  # Booked|Cancelled|Completed
    student = db.relationship("User", foreign_keys=[student_id])
    exam = db.relationship("Exam")
    evaluation = db.relationship("Evaluation", backref="booking", uselist=False)

    def to_dict(self, with_eval=False):
        s = self.slot
        d = dict(id=self.id, student_id=self.student_id, student_name=self.student.name, slot_id=self.slot_id,
                 exam_id=self.exam_id, exam_name=self.exam.name, course=self.exam.course.code,
                 date=iso(s.date), start_time=s.start_time.strftime("%H:%M"), end_time=s.end_time.strftime("%H:%M"),
                 examiner_id=s.examiner_id, examiner_name=s.examiner.name, meeting_link=s.meeting_link,
                 status=self.status, booked_at=iso(self.booked_at), max_marks=self.exam.max_marks,
                 evaluated=self.evaluation is not None, results_published=self.exam.results_published)
        if with_eval and self.evaluation:
            d["evaluation"] = self.evaluation.to_dict()
        return d
