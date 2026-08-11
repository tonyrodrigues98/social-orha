import {
  Compass,
  House,
  MessageCircle,
  UserRound,
  UsersRound,
} from "lucide-react";
import { TabBar } from "@/components/godui/tab-bar";
import type { AppSection } from "../types";

const tabs = [
  { value: "inicio", label: "Início", icon: <House aria-hidden size={20} /> },
  {
    value: "comunidade",
    label: "Comunidade",
    icon: <UsersRound aria-hidden size={20} />,
  },
  {
    value: "explorar",
    label: "Explorar",
    icon: <Compass aria-hidden size={20} />,
  },
  {
    value: "conversas",
    label: "Conversas",
    icon: <MessageCircle aria-hidden size={20} />,
    badge: 3,
  },
  {
    value: "perfil",
    label: "Perfil",
    icon: <UserRound aria-hidden size={20} />,
  },
];

type BottomNavigationProps = {
  value: AppSection;
  onChange: (value: AppSection) => void;
};

export function BottomNavigation({ value, onChange }: BottomNavigationProps) {
  return (
    <div className="bottom-navigation-wrap">
      <TabBar
        tabs={tabs}
        value={value}
        labelsOnActiveOnly
        safeArea
        onChange={(next) => onChange(next as AppSection)}
        className="orha-tab-bar"
      />
    </div>
  );
}
