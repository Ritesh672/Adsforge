import { useEffect, useMemo, useRef, useState } from 'react';

const PERIODS = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7D' },
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
];

const MONTH_LABEL = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
const DISPLAY_DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const toYmd = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const fromYmd = (value) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const addDays = (date, days) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const addMonths = (date, months) => {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
};

const sameDay = (a, b) => a && b && toYmd(a) === toYmd(b);

const getMonthDays = (monthDate) => {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];

  for (let i = 0; i < first.getDay(); i += 1) {
    days.push(null);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    days.push(new Date(year, month, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
};

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

function MonthView({ monthDate, draftStart, draftEnd, maxDate, onDayClick, onSingleDay }) {
  const days = getMonthDays(monthDate);

  return (
    <div className="calendar-month">
      <div className="calendar-month-title">{MONTH_LABEL.format(monthDate)}</div>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="calendar-days">
        {days.map((date, index) => {
          if (!date) return <span className="calendar-day empty" key={`empty-${index}`} />;

          const ymd = toYmd(date);
          const disabled = date > maxDate;
          const isStart = sameDay(date, draftStart);
          const isEnd = sameDay(date, draftEnd);
          const inRange = draftStart && draftEnd && date > draftStart && date < draftEnd;

          return (
            <button
              type="button"
              key={ymd}
              disabled={disabled}
              className={[
                'calendar-day',
                isStart ? 'selected start' : '',
                isEnd && !isStart ? 'selected end' : '',
                inRange ? 'in-range' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => onDayClick(date)}
              onContextMenu={(event) => {
                event.preventDefault();
                if (!disabled) onSingleDay(date);
              }}
              title="Right click to select only this date"
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Topbar({ title, subtitle, dateRange, onDateChange, onPeriodChange, activePeriod }) {
  const pickerRef = useRef(null);
  const today = useMemo(() => {
    const date = new Date();
    date.setHours(23, 59, 59, 999);
    return date;
  }, []);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [draftStart, setDraftStart] = useState(fromYmd(dateRange.start));
  const [draftEnd, setDraftEnd] = useState(fromYmd(dateRange.end));
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const start = fromYmd(dateRange.start);
    return new Date(start.getFullYear(), start.getMonth() - 1, 1);
  });

  useEffect(() => {
    if (!isCalendarOpen) {
      setDraftStart(fromYmd(dateRange.start));
      setDraftEnd(fromYmd(dateRange.end));
      const start = fromYmd(dateRange.start);
      setVisibleMonth(new Date(start.getFullYear(), start.getMonth() - 1, 1));
    }
  }, [dateRange.end, dateRange.start, isCalendarOpen]);

  useEffect(() => {
    if (!isCalendarOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!pickerRef.current?.contains(event.target)) {
        setIsCalendarOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isCalendarOpen]);

  const displayLabel = dateRange.start === dateRange.end
    ? DISPLAY_DATE.format(fromYmd(dateRange.start))
    : `${DISPLAY_DATE.format(fromYmd(dateRange.start))} - ${DISPLAY_DATE.format(fromYmd(dateRange.end))}`;

  const applyRange = (start, end) => {
    onDateChange({ start: toYmd(start), end: toYmd(end) });
    setIsCalendarOpen(false);
  };

  const handleDayClick = (date) => {
    if (!draftStart || (draftStart && draftEnd && !sameDay(draftStart, draftEnd))) {
      setDraftStart(date);
      setDraftEnd(date);
      return;
    }

    if (date < draftStart) {
      setDraftEnd(draftStart);
      setDraftStart(date);
      return;
    }

    setDraftEnd(date);
  };

  const handleSingleDay = (date) => {
    applyRange(date, date);
  };

  const presetSingleDay = (offset) => {
    const date = addDays(new Date(), offset);
    applyRange(date, date);
  };

  const presetLastDays = (days) => {
    const end = addDays(new Date(), -1);
    const start = addDays(end, -(days - 1));
    applyRange(start, end);
  };

  return (
    <div className="topbar">
      <div className="topbar-left">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>

      <div className="date-range-picker">
        <div className="period-tabs">
          {PERIODS.map(p => (
            <button
              key={p.id}
              className={`period-tab${activePeriod === p.id ? ' active' : ''}`}
              onClick={() => onPeriodChange(p.id)}
              type="button"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 24, background: 'var(--border)', margin: '0 8px' }} />

        <div className="calendar-picker-wrap" ref={pickerRef}>
          <button
            type="button"
            className="calendar-trigger"
            onClick={() => setIsCalendarOpen((open) => !open)}
          >
            <CalendarIcon />
            <span>{displayLabel}</span>
            <span className={`calendar-trigger-caret${isCalendarOpen ? ' open' : ''}`}>^</span>
          </button>

          {isCalendarOpen && (
            <div className="calendar-popover">
              <div className="calendar-sidebar">
                <button type="button" onClick={() => presetSingleDay(0)}>Today</button>
                <button type="button" onClick={() => presetSingleDay(-1)}>Yesterday</button>
                <div className="calendar-sidebar-divider" />
                <button type="button" onClick={() => presetLastDays(7)}>Last 7 days</button>
                <button type="button" onClick={() => presetLastDays(30)}>Last 30 days</button>
                <button type="button" onClick={() => presetLastDays(90)}>Last 90 days</button>
                <div className="calendar-sidebar-divider" />
                <button type="button" className="active">Custom range</button>
              </div>

              <div className="calendar-main">
                <div className="calendar-input-row">
                  <div className="calendar-date-box">{DISPLAY_DATE.format(draftStart)}</div>
                  <span className="calendar-range-arrow">&rarr;</span>
                  <div className="calendar-date-box">{DISPLAY_DATE.format(draftEnd)}</div>
                </div>

                <div className="calendar-month-nav">
                  <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>←</button>
                  <button type="button" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>→</button>
                </div>

                <div className="calendar-months">
                  <MonthView
                    monthDate={visibleMonth}
                    draftStart={draftStart}
                    draftEnd={draftEnd}
                    maxDate={today}
                    onDayClick={handleDayClick}
                    onSingleDay={handleSingleDay}
                  />
                  <MonthView
                    monthDate={addMonths(visibleMonth, 1)}
                    draftStart={draftStart}
                    draftEnd={draftEnd}
                    maxDate={today}
                    onDayClick={handleDayClick}
                    onSingleDay={handleSingleDay}
                  />
                </div>

                <div className="calendar-footer">
                  <span>Right click any date to open only that single day.</span>
                  <div>
                    <button type="button" className="calendar-secondary-btn" onClick={() => setIsCalendarOpen(false)}>Cancel</button>
                    <button type="button" className="calendar-primary-btn" onClick={() => applyRange(draftStart, draftEnd)}>Apply</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
