// Modern harmonious color generator for exam cards
const cardColors = [
  'linear-gradient(135deg, #4f46e5 0%, #3730a3 100%)', // Indigo
  'linear-gradient(135deg, #0d9488 0%, #115e59 100%)', // Teal
  'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)', // Blue
  'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)', // Purple
  'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', // Sky
  'linear-gradient(135deg, #d97706 0%, #b45309 100%)', // Amber
];

export const cardColor = (id) => cardColors[(id || 0) % cardColors.length];

export const fmtDay = (iso) => {
  if (!iso) return { d: '--', m: '---' };
  const d = new Date(iso + 'T00:00:00');
  return { d: d.getDate(), m: d.toLocaleString('en', { month: 'short' }) };
};

export const fmtDate = (iso) => {
  if (!iso) return '-';
  const d = new Date(iso + 'T00:00:00');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString('en', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Soft badge style mapper
export const badgeClass = (s) => {
  const map = {
    Available: 'badge-soft-success',
    Active: 'badge-soft-success',
    Booked: 'badge-soft-primary',
    'Booking Open': 'badge-soft-success',
    'Slot Creation': 'badge-soft-info',
    Completed: 'badge-soft-secondary',
    Full: 'badge-soft-warning',
    Cancelled: 'badge-soft-danger',
    Closed: 'badge-soft-dark',
    Draft: 'badge-soft-secondary',
    Inactive: 'badge-soft-danger',
    Pending: 'badge-soft-warning',
    Done: 'badge-soft-success',
    Failed: 'badge-soft-danger',
  };
  return map[s] || 'badge-soft-secondary';
};
