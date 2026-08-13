const signals = [
  {
    time: "09:40",
    label: "Спрос",
    title: "Молочная продукция",
    detail: "3 сети обновили требования категории",
    tone: "accent",
  },
  {
    time: "10:15",
    label: "Редакция",
    title: "Факты подтверждены",
    detail: "2 источника · материал утверждён",
    tone: "mint",
  },
  {
    time: "12:00",
    label: "Доставка",
    title: "Telegram-дайджест",
    detail: "8 персональных + 2 общерыночных",
    tone: "paper",
  },
  {
    time: "12:04",
    label: "Следующий шаг",
    title: "WorldFood Moscow",
    detail: "Мероприятие подходит выбранным тегам",
    tone: "signal",
  },
] as const;

export function SignalBoard() {
  return (
    <div className="signal-board" aria-label="Как работает лента сигналов">
      <div className="signal-board-head">
        <span>Лента сигналов</span>
        <span>демо · онлайн</span>
      </div>
      <div className="signal-items">
        {signals.map((signal, index) => (
          <div className="signal-item" key={`${signal.time}-${signal.title}`}>
            <span className="signal-number">0{index + 1}</span>
            <div>
              <strong>{signal.title}</strong>
              <span>
                {signal.time} · {signal.detail}
              </span>
            </div>
            <span className="status-pill">{signal.label}</span>
          </div>
        ))}
      </div>
      <div className="signal-board-foot">
        <span>Событие → проверка → выпуск</span>
        <span>80 / 20</span>
      </div>
    </div>
  );
}
