"use client";

export type SlotGroup = {
  period: "manha" | "tarde" | "noite";
  label: "Manhã" | "Tarde" | "Noite";
  slots: string[];
};

const timeOf = (slot: string) => slot.slice(11, 16);

// Slots carry the clinic's offset, so their HH:mm is the clinic's own time:
// before 12:00, 12:00-17:59 and 18:00 on. Empty groups are left out.
export function groupSlots(slots: string[]): SlotGroup[] {
  const groups: SlotGroup[] = [
    { period: "manha", label: "Manhã", slots: [] },
    { period: "tarde", label: "Tarde", slots: [] },
    { period: "noite", label: "Noite", slots: [] },
  ];
  for (const slot of slots) {
    const hour = Number(timeOf(slot).slice(0, 2));
    groups[hour < 12 ? 0 : hour < 18 ? 1 : 2]!.slots.push(slot);
  }
  return groups.filter((group) => group.slots.length > 0);
}

const groupId = (period: SlotGroup["period"]) => `periodo-${period}`;
const count = (total: number) =>
  `${total} ${total === 1 ? "horário" : "horários"}`;

// Period chips that jump to their group, then the groups in a 3-column grid.
export function SlotGroups({
  slots,
  disabled,
  onSlot,
}: {
  slots: string[];
  disabled: boolean;
  onSlot: (slot: string, trigger: HTMLElement) => void;
}) {
  const groups = groupSlots(slots);

  function jump(period: SlotGroup["period"]) {
    document.getElementById(groupId(period))?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        {groups.map((group) => (
          <button
            key={group.period}
            type="button"
            onClick={() => jump(group.period)}
            className="rounded-full border bg-card px-4 py-1.5 text-sm font-semibold outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {group.label}
          </button>
        ))}
      </div>
      <div role="group" aria-label="Horários livres" className="grid gap-5">
        {groups.map((group) => (
          <div
            key={group.period}
            id={groupId(group.period)}
            role="group"
            aria-label={`${group.label}, ${count(group.slots.length)}`}
            className="grid scroll-mt-4 gap-2"
          >
            <p className="flex items-baseline justify-between text-sm">
              <span className="font-semibold">{group.label}</span>
              <span className="text-muted-foreground">
                {count(group.slots.length)}
              </span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {group.slots.map((value) => (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={(event) => onSlot(value, event.currentTarget)}
                  className="h-11 rounded-xl border bg-card text-sm font-semibold outline-none hover:border-primary focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                >
                  {timeOf(value)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
