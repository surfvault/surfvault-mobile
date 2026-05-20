// Session date label for grid/sheet UI. Omits the year for sessions in the
// current calendar year, includes it otherwise (e.g. "Dec 18" vs "Sep 9, 2025").
export const formatSessionDate = (dateStr?: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr.split('T')[0] + 'T00:00:00');
  const showYear = d.getFullYear() !== new Date().getFullYear();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(showYear && { year: 'numeric' }) });
};
