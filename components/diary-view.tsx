"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import Image from "next/image";
import { calendarDays, meals } from "@/lib/mock-data";
import { Card, ProgressBar, SectionTitle } from "./ui";

export function DiaryView() {
  const [selected, setSelected] = useState(5);
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const selectedDay = calendarDays[selected]?.label;

  return (
    <div className="diary-layout">
      <Card className="calendar-card">
        <div className="calendar-head"><button aria-label="Previous month"><ChevronLeft /></button><h2>September 2026</h2><button aria-label="Next month"><ChevronRight /></button></div>
        <div className="weekdays">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
        <div className="calendar-grid">
          {calendarDays.map((day, index) => (
            <button key={index} className={`${day.outside ? "outside" : ""} ${selected === index ? "selected" : ""}`} onClick={() => setSelected(index)}>
              <span>{day.label}</span><i className={day.status} />
            </button>
          ))}
        </div>
        <div className="calendar-legend"><span><i className="tracked" /> Goal met</span><span><i className="missed" /> Goal missed</span></div>
      </Card>

      <div className="diary-day">
        <div className="diary-date"><div><span className="eyebrow">Your daily summary</span><h2>Saturday, September {selectedDay}</h2></div><button className="date-step"><ChevronLeft size={18} /></button><button className="date-step"><ChevronRight size={18} /></button></div>
        <Card className="diary-summary">
          <div><span>Calories</span><strong>2,655 <small>/ 2,855 kcal</small></strong><ProgressBar value={93} /></div>
          <div className="diary-macros">
            <p><i className="dot carbs" /><span>Carbs<strong>374 / 428 g</strong></span></p>
            <p><i className="dot fat" /><span>Fat<strong>89 / 77 g</strong></span></p>
            <p><i className="dot protein" /><span>Protein<strong>92 / 107 g</strong></span></p>
          </div>
        </Card>

        <div className="diary-groups">
          <section><SectionTitle title="Breakfast" action="438 kcal" /><Card>{meals.slice(0, 1).map((meal) => <DiaryMeal key={meal.id} meal={meal} />)}<button className="inline-add"><Plus size={17} /> Add breakfast</button></Card></section>
          <section><SectionTitle title="Lunch" action="684 kcal" /><Card>{meals.slice(1, 2).map((meal) => <DiaryMeal key={meal.id} meal={meal} />)}<button className="inline-add"><Plus size={17} /> Add lunch</button></Card></section>
          <section><SectionTitle title="Dinner" action="0 kcal" /><Card className="empty-meal"><span>No dinner logged yet</span><button className="inline-add"><Plus size={17} /> Add dinner</button></Card></section>
        </div>
      </div>
    </div>
  );
}

function DiaryMeal({ meal }: { meal: (typeof meals)[number] }) {
  return <div className="diary-meal"><Image src={meal.image} width={54} height={54} alt="" /><div><strong>{meal.name}</strong><span>{meal.detail}</span></div><b>{meal.kcal} kcal</b><button aria-label="Meal options"><MoreHorizontal /></button></div>;
}
