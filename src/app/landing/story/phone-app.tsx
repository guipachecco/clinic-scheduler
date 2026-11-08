// A stylized phone with a clinic page and today's agenda in Zemana's
// colours. Illustrative shapes, not real data.
const SLOTS = [
  { time: "09:00", bar: "bg-[#b7e7fc]", width: "w-3/4" },
  { time: "10:30", bar: "bg-[#ffd3f0]", width: "w-2/3" },
  { time: "14:00", bar: "bg-[#f5c700]", width: "w-4/5" },
  { time: "16:00", bar: "bg-[#b7e7fc]", width: "w-1/2" },
];

function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="size-4 shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 3 3 5-6" />
    </svg>
  );
}

export function PhoneApp() {
  return (
    <div className="w-[min(15.5rem,100%)] rounded-[2.4rem] border-[3px] border-[#2a0081] bg-[#ffd3f0] p-2.5 shadow-[8px_8px_0_0_#f5c700]">
      <div className="overflow-hidden rounded-[1.9rem] border-[3px] border-[#2a0081] bg-white text-[#2a0081]">
        <div className="relative bg-[#f5c700] px-4 pt-6 pb-4">
          <span
            aria-hidden="true"
            className="absolute top-2 left-1/2 h-1.5 w-14 -translate-x-1/2 rounded-full bg-[#2a0081]"
          />
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full border-[2.5px] border-[#2a0081] bg-[#ffd3f0] font-heading text-sm font-extrabold"
            >
              SC
            </span>
            <div className="min-w-0">
              <p className="font-heading text-base leading-tight font-extrabold">
                Sua clínica
              </p>
              <p
                aria-hidden="true"
                className="mt-0.5 flex gap-0.5 text-[#2a0081]"
              >
                {[0, 1, 2, 3, 4].map((star) => (
                  <svg
                    key={star}
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    className="size-3"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                ))}
              </p>
            </div>
          </div>
          <p className="mt-3 rounded-full border-[2.5px] border-[#2a0081] bg-[#2a0081] py-1.5 text-center font-heading text-sm font-extrabold text-white">
            Agendar horário
          </p>
        </div>
        <div className="px-4 pt-3 pb-5">
          <p className="font-heading text-sm font-extrabold uppercase">
            Agenda de hoje
          </p>
          <ul className="mt-2 space-y-2" aria-hidden="true">
            {SLOTS.map((slot) => (
              <li key={slot.time} className="flex items-center gap-2">
                <span className="w-10 shrink-0 text-xs font-bold tabular-nums">
                  {slot.time}
                </span>
                <span
                  className={`flex h-8 flex-1 items-center gap-1.5 rounded-lg border-2 border-[#2a0081] px-2 ${slot.bar}`}
                >
                  <span
                    className={`h-1.5 rounded-full bg-[#2a0081]/70 ${slot.width}`}
                  />
                </span>
                <Check />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
