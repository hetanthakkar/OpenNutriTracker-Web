"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import Image from "next/image";
import { meals } from "@/lib/mock-data";
import { Card, ProgressBar, SectionTitle } from "./ui";

export type DemoMealSection = "Breakfast" | "Lunch" | "Dinner";

export type DemoDiaryMeal = {
  id: number;
  section: DemoMealSection;
  name: string;
  detail: string;
  kcal: number;
  image: string;
};

type CalendarDay = {
  key: string;
  date: Date;
  label: number;
  outside: boolean;
  status: "tracked" | "missed" | "future";
};

const fixedToday = new Date(2026, 8, 5);

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function buildCalendar(month: Date): CalendarDay[] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const first = new Date(year, monthIndex, 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  const gridStart = new Date(year, monthIndex, 1 - mondayOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index);
    const outside = date.getMonth() !== monthIndex;
    const inFuture = startOfDay(date).getTime() > fixedToday.getTime();
    const missed = !outside && !inFuture && [4, 10, 13, 20].includes(date.getDate());
    return {
      key: `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`,
      date,
      label: date.getDate(),
      outside,
      status: inFuture ? "future" : missed ? "missed" : "tracked",
    };
  });
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
}

export function DiaryView({
  extraMeals,
  onAddMeal,
}: {
  extraMeals: DemoDiaryMeal[];
  onAddMeal: (section: DemoMealSection) => void;
}) {
  const [month, setMonth] = useState(new Date(2026, 8, 1));
  const [selectedDate, setSelectedDate] = useState(new Date(2026, 8, 5));
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const calendarDays = useMemo(() => buildCalendar(month), [month]);

  const shiftMonth = (delta: number) => {
    const next = new Date(month.getFullYear(), month.getMonth() + delta, 1);
    setMonth(next);
    setSelectedDate(next);
  };

  const selectCalendarDay = (day: CalendarDay) => {
    setSelectedDate(day.date);
    if (day.outside) setMonth(new Date(day.date.getFullYear(), day.date.getMonth(), 1));
  };

  const shiftDay = (delta: number) => {
    const next = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate() + delta);
    setSelectedDate(next);
    if (next.getMonth() !== month.getMonth() || next.getFullYear() !== month.getFullYear()) {
      setMonth(new Date(next.getFullYear(), next.getMonth(), 1));
    }
  };

  const groups: Array<{ title: DemoMealSection; base: typeof meals }> = [
    { title: "Breakfast", base: meals.slice(0, 1) },
    { title: "Lunch", base: meals.slice(1, 2) },
    { title: "Dinner", base: [] },
  ];

  return (
    <div className="diary-layout">
      <Card className="calendar-card">
        <div className="calendar-head">
          <button aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft /></button>
          <h2>{formatMonth(month)}</h2>
          <button aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight /></button>
        </div>
        <div className="weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {calendarDays.map((day) => (
            <button key={day.key} className={`${day.outside ? "outside" : ""} ${sameDay(selectedDate, day.date) ? "selected" : ""}`} onClick={() => selectCalendarDay(day)}>
              <span>{day.label}</span><i className={day.status} />
            </button>
          ))}
        </div>
        <div className="calendar-legend"><span><i className="tracked" /> Goal met</span><span><i className="missed" /> Goal missed</span></div>
      </Card>

      <div className="diary-day">
        <div className="diary-date">
          <div><span className="eyebrow">Your daily summary</span><h2>{formatDate(selectedDate)}</h2></div>
          <button className="date-step" aria-label="Previous day" onClick={() => shiftDay(-1)}><ChevronLeft size={18} /></button>
          <button className="date-step" aria-label="Next day" onClick={() => shiftDay(1)}><ChevronRight size={18} /></button>
        </div>
        <Card className="diary-summary">
          <div><span>Calories</span><strong>2,655 <small>/ 2,855 kcal</small></strong><ProgressBar value={93} /></div>
          <div className="diary-macros">
            <p><i className="dot carbs" /><span>Carbs<strong>374 / 428 g</strong></span></p>
            <p><i className="dot fat" /><span>Fat<strong>89 / 77 g</strong></span></p>
            <p><i className="dot protein" /><span>Protein<strong>92 / 107 g</strong></span></p>
          </div>
        </Card>

        <div className="diary-groups">
          {groups.map(({ title, base }) => {
            const entries = [...base, ...extraMeals.filter((meal) => meal.section === title)];
            const total = entries.reduce((sum, meal) => sum + meal.kcal, 0);
            return (
              <section key={title}>
                <SectionTitle title={title} action={`${total} kcal`} />
                <Card className={entries.length === 0 ? "empty-meal" : ""}>
                  {entries.length === 0 && <span>No {title.toLowerCase()} logged yet</span>}
                  {entries.map((meal) => <DiaryMeal key={meal.id} meal={meal} />)}
                  <button className="inline-add" onClick={() => onAddMeal(title)}><Plus size={17} /> Add {title.toLowerCase()}</button>
                </Card>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DiaryMeal({ meal }: { meal: { id: number; name: string; detail: string; kcal: number; image: string } }) {
  return <div className="diary-meal"><Image src={meal.image} width={54} height={54} alt="" /><div><strong>{meal.name}</strong><span>{meal.detail}</span></div><b>{meal.kcal} kcal</b></div>;
}
