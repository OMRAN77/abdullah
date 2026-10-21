// عبدالله ↔ تقويم جوجل. شغّل setup مرة وحدة بس.
const TZ = 'Asia/Dubai';

function setup() {
  const props = PropertiesService.getScriptProperties();
  let s = props.getProperty('SECRET');
  if (!s) {
    s = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('SECRET', s);
  }
  CalendarApp.getDefaultCalendar().getName();
  Logger.log('CALENDAR_SECRET = ' + s);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
function at(date, time) {
  return Utilities.parseDate(date + ' ' + (time || '09:00'), TZ, 'yyyy-MM-dd HH:mm');
}
function fmt(d) {
  return Utilities.formatDate(d, TZ, 'yyyy-MM-dd HH:mm');
}
function view(ev) {
  return {
    id: ev.getId(), title: ev.getTitle(), start: fmt(ev.getStartTime()), end: fmt(ev.getEndTime()),
    all_day: ev.isAllDayEvent(), location: ev.getLocation(), notes: String(ev.getDescription() || '').slice(0, 300)
  };
}

function doPost(e) {
  try {
    const b = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!secret || b.secret !== secret) return out({ ok: false, error: 'Unauthorized' });
    const cal = CalendarApp.getDefaultCalendar();

    if (b.action === 'list') {
      const from = at(b.from_date, '00:00');
      const to = at(b.to_date || b.from_date, '23:59');
      return out({ ok: true, events: cal.getEvents(from, to).slice(0, 50).map(view) });
    }

    if (b.action === 'create') {
      if (!b.title || !b.date) return out({ ok: false, error: 'Missing title or date' });
      const opts = { location: b.location || '', description: b.notes || '' };
      let ev;
      if (!b.time) {
        ev = cal.createAllDayEvent(b.title, at(b.date, '00:00'), opts);
      } else {
        const s = at(b.date, b.time);
        const m = Math.max(5, Math.min(1440, parseInt(b.duration_minutes, 10) || 60));
        ev = cal.createEvent(b.title, s, new Date(s.getTime() + m * 60000), opts);
      }
      ev.removeAllReminders();
      const rem = (b.reminder_minutes == null || b.reminder_minutes === '') ? [60, 10] : [parseInt(b.reminder_minutes, 10)];
      rem.forEach(function (x) { if (x >= 0 && x <= 40320) ev.addPopupReminder(x); });
      return out({ ok: true, created: view(ev) });
    }

    if (b.action === 'update' || b.action === 'cancel') {
      const ev = b.id ? cal.getEventById(b.id) : null;
      if (!ev) return out({ ok: false, error: 'Event not found - call list first to get its id' });
      if (b.action === 'cancel') {
        const v = view(ev);
        ev.deleteEvent();
        return out({ ok: true, cancelled: v });
      }
      if (b.title) ev.setTitle(b.title);
      if (b.date && b.time) {
        const s = at(b.date, b.time);
        const dur = b.duration_minutes ? parseInt(b.duration_minutes, 10) : (ev.getEndTime() - ev.getStartTime()) / 60000;
        ev.setTime(s, new Date(s.getTime() + dur * 60000));
      }
      if (b.location != null) ev.setLocation(b.location);
      if (b.notes != null) ev.setDescription(b.notes);
      return out({ ok: true, updated: view(ev) });
    }

    return out({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  }
}
