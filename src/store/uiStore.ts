import { create } from 'zustand';

export type Tab = 'today' | 'add' | 'waiting' | 'settings';

interface UIState {
  currentTab: Tab;
  setTab: (tab: Tab) => void;
}

export const useUIStore = create<UIState>((set) => ({
  currentTab: 'today',
  setTab: (tab) => set({ currentTab: tab }),
}));
