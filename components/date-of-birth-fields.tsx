"use client";

import { useState } from "react";

type DateOfBirthFieldsProps = {
  value: string | null;
  onChange: (value: string | null) => void;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

function dateParts(value: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) } : { year: "", month: "", day: "" };
}

function daysInMonth(year: string, month: string) {
  if (!month) return 31;
  return new Date(Number(year || 2000), Number(month), 0).getDate();
}

export function DateOfBirthFields({ value, onChange }: DateOfBirthFieldsProps) {
  const [parts, setParts] = useState(() => dateParts(value));
  const currentYear = new Date().getFullYear();
  const dayCount = daysInMonth(parts.year, parts.month);

  const update = (next: Partial<typeof parts>) => {
    const nextParts = { ...parts, ...next };
    const normalizedDay = nextParts.day && Number(nextParts.day) > daysInMonth(nextParts.year, nextParts.month)
      ? String(daysInMonth(nextParts.year, nextParts.month))
      : nextParts.day;
    setParts({ ...nextParts, day: normalizedDay });
    if (!nextParts.year || !nextParts.month || !normalizedDay) {
      onChange(null);
      return;
    }
    onChange(`${nextParts.year}-${nextParts.month.padStart(2, "0")}-${normalizedDay.padStart(2, "0")}`);
  };

  return <div className="date-of-birth-fields" role="group" aria-label="Date of birth">
    <label><span className="sr-only">Birth month</span><select value={parts.month} aria-label="Birth month" onChange={(event) => update({ month: event.target.value })}><option value="">Month</option>{MONTHS.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label>
    <label><span className="sr-only">Birth day</span><select value={parts.day} aria-label="Birth day" disabled={!parts.month} onChange={(event) => update({ day: event.target.value })}><option value="">Day</option>{Array.from({ length: dayCount }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
    <label><span className="sr-only">Birth year</span><select value={parts.year} aria-label="Birth year" onChange={(event) => update({ year: event.target.value })}><option value="">Year</option>{Array.from({ length: currentYear - 1899 }, (_, index) => currentYear - index).map((year) => <option key={year} value={year}>{year}</option>)}</select></label>
  </div>;
}
