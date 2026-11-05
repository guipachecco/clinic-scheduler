"use client";

import { createContext, useContext } from "react";

// Lets the side panel ask the calendar to reload its events after a status
// change. The calendar provides it; outside it, this does nothing.
export const AgendaRefreshContext = createContext<() => void>(() => {});

export function useAgendaRefresh() {
  return useContext(AgendaRefreshContext);
}
