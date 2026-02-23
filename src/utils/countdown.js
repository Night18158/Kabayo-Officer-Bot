/**
 * Calculate time remaining until next Monday 04:00 JST
 * @returns {{ days: number, hours: number, minutes: number, totalMs: number, formatted: string }}
 */
function getTimeUntilReset() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  const nextReset = new Date(jstNow);
  const dayOfWeek = jstNow.getDay(); // 0=Sun, 1=Mon, ...

  let daysUntilMonday;
  if (dayOfWeek === 1 && jstNow.getHours() < 4) {
    daysUntilMonday = 0; // It's Monday before 04:00
  } else {
    daysUntilMonday = ((8 - dayOfWeek) % 7) || 7; // Days until next Monday
  }

  nextReset.setDate(jstNow.getDate() + daysUntilMonday);
  nextReset.setHours(4, 0, 0, 0);

  const diff = nextReset - jstNow;
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  let formatted;
  if (days > 0) formatted = `${days}d ${hours}h`;
  else if (hours > 0) formatted = `${hours}h ${minutes}m`;
  else formatted = `${minutes}m`;

  return { days, hours, minutes, totalMs: diff, formatted };
}

/**
 * Get the next scheduled event name and approximate time remaining.
 * Events are based on JST schedule:
 *   Mon 04:05 — Week Start
 *   Thu 12:00 — Midweek Checkpoint
 *   Sun 10:00 — Push Day Morning
 *   Sun 18:00 — Push Day Evening
 *   Mon 02:00 — Final DMs
 *   Mon 03:55 — Week Close
 * @returns {{ name: string, formatted: string }}
 */
function getNextScheduledEvent() {
  const now = new Date();
  const jstNow = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));

  const day = jstNow.getDay();   // 0=Sun, 1=Mon, ..., 4=Thu, 6=Sat
  const hour = jstNow.getHours();
  const minute = jstNow.getMinutes();
  const totalMinutes = hour * 60 + minute;

  // Define events as [dayOfWeek, hourOfDay, minuteOfHour, eventName]
  const events = [
    [1, 2, 0, 'Final DMs'],
    [1, 3, 55, 'Week Close'],
    [1, 4, 5, 'Week Start'],
    [4, 12, 0, 'Midweek Checkpoint'],
    [0, 10, 0, 'Push Day Morning'],
    [0, 18, 0, 'Push Day Evening'],
  ];

  let minDiff = Infinity;
  let nextName = '';
  let nextDiff = 0;

  for (const [evDay, evHour, evMin, evName] of events) {
    let dayDiff = evDay - day;
    if (dayDiff < 0) dayDiff += 7;
    if (dayDiff === 0 && (evHour * 60 + evMin) <= totalMinutes) dayDiff = 7;

    const diffMs =
      dayDiff * 24 * 60 * 60 * 1000 +
      (evHour * 60 + evMin - totalMinutes) * 60 * 1000;

    if (diffMs < minDiff) {
      minDiff = diffMs;
      nextName = evName;
      nextDiff = diffMs;
    }
  }

  const days = Math.floor(nextDiff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((nextDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((nextDiff % (1000 * 60 * 60)) / (1000 * 60));

  let formatted;
  if (days > 0) formatted = `${days}d ${hours}h`;
  else if (hours > 0) formatted = `${hours}h ${minutes}m`;
  else formatted = `${minutes}m`;

  return { name: nextName, formatted };
}

module.exports = { getTimeUntilReset, getNextScheduledEvent };
