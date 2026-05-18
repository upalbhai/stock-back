function getDayRange(dateInput) {
  const date = dateInput ? new Date(dateInput) : /* @__PURE__ */ new Date();
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}
export {
  getDayRange
};
