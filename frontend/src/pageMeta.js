// Single source of truth for page titles: the sidebar, the topbar breadcrumb and the page header all read this.
export const pageMeta = {
  '/admin': { title: 'Dashboard' },
  '/admin/courses': { title: 'Courses', sub: 'Manage course codes and descriptions.' },
  '/admin/exams': { title: 'Examinations', sub: 'Configure timelines, rubrics and examiners, and publish results.' },
  '/admin/examiners': { title: 'Examiners', sub: 'Manage examiner accounts, departments and status.' },
  '/admin/students': { title: 'Students', sub: 'View registered students and manage their access.' },
  '/admin/slots': { title: 'Slots & Bookings', sub: 'Monitor examiner slots and reschedule student bookings.' },
  '/admin/search': { title: 'Search', sub: 'Find students, examiners, examinations and bookings.' },
  '/examiner': { title: 'Dashboard' },
  '/examiner/slots': { title: 'My Slots', sub: 'Create and manage your availability slots during the Slot Creation period.' },
  '/examiner/evaluate': { title: 'Evaluate Students', sub: 'Score students against the examination rubric.' },
  '/student': { title: 'Dashboard' },
  '/student/exams': { title: 'Examinations', sub: 'Browse examinations, review the rubric and book a slot.' },
  '/student/bookings': { title: 'My Bookings', sub: 'Track your booked slots and meeting links.' },
  '/student/results': { title: 'Results', sub: 'Published scores, rubric breakdowns and examiner feedback.' },
  '/profile': { title: 'Profile', sub: 'Update your contact details and password.' },
};
