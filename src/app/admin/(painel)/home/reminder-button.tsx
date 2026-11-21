"use client";

import { markRemindedAction } from "../agenda/avisos/actions";

// The "WhatsApp" shortcut of the "Próxima" card: opens the conversation with
// the reminder already typed and, for a confirmed appointment, marks it as
// reminded (the same marker as the agenda's "Avisar pelo WhatsApp" queue).
export function ReminderButton({
  href,
  appointmentId,
  mark,
  className,
}: {
  href: string;
  appointmentId: string;
  mark: boolean;
  className: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        // A failed mark changes nothing for her: the conversation opens anyway.
        if (mark) void markRemindedAction(appointmentId).catch(() => {});
      }}
    >
      WhatsApp
    </a>
  );
}
