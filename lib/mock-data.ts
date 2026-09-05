export const meals = [
  { id: 1, type: "Breakfast", name: "Greek yoghurt bowl", detail: "Blueberries, almonds & honey", kcal: 438, image: "/images/bowl.jpg", color: "amber" },
  { id: 2, type: "Lunch", name: "Salmon rice bowl", detail: "Brown rice, broccoli & olive oil", kcal: 684, image: "/images/salmon.jpg", color: "coral" },
  { id: 3, type: "Snack", name: "Apple & almond butter", detail: "1 serving", kcal: 226, image: "/images/apple.jpg", color: "teal" },
];

export const activity = [
  { label: "Aerobic workout", detail: "43 min", kcal: 249 },
  { label: "Evening walk", detail: "28 min", kcal: 128 },
];

export const trendValues = {
  calories: [2520, 2590, 2540, 2575, 2350, 2210, 2655],
  weight: [89.1, 88.8, 88.6, 88.4, 88.2, 87.7, 87.3],
  water: [1650, 1900, 2100, 1800, 2250, 1700, 2200],
};

export const calendarDays = Array.from({ length: 35 }, (_, index) => {
  const day = index - 2;
  return {
    label: day < 1 ? 30 + day : day > 31 ? day - 31 : day,
    outside: day < 1 || day > 31,
    status: [4, 10, 13, 20].includes(day) ? "missed" : day <= 27 && day > 0 ? "tracked" : "future",
  };
});
