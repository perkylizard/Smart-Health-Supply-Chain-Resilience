import * as Menu from "@radix-ui/react-dropdown-menu";
import { useApp } from "../App";
import { ROLE_ORDER, type PersonaId } from "../personas";
import { startTour } from "./Tour";

const initials: Record<PersonaId, string> = { dho: "DH", state: "ST", phc: "PH", dm: "DM", warehouse: "WH" };

/** Who you are: an avatar that opens the five roles with a one-line description each. */
export default function RoleMenu() {
  const { t, persona, setPersona, lang } = useApp();
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button className="hdr-btn role" aria-label={t.persona}><span className="avatar" aria-hidden>{initials[persona]}</span><span className="role-text"><span className="faint role-lbl">{t.roleLbl}</span> {t.personas[persona]}</span><svg className="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M6 9l6 6 6-6" /></svg></button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={8}>
          <Menu.Label className="menu-label">{t.persona}</Menu.Label>
          <Menu.RadioGroup value={persona} onValueChange={(v) => setPersona(v as PersonaId)}>
            {ROLE_ORDER.map((id) => (
              <Menu.RadioItem key={id} value={id} className="menu-item">
                <span className="avatar small" aria-hidden>{initials[id]}</span>
                <span><span className="menu-title">{t.personas[id]}</span><span className="menu-hint">{t.personaHints[id]}</span></span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
          <Menu.Separator className="menu-sep" />
          <Menu.Item className="menu-item menu-tour" onSelect={() => setTimeout(startTour, 50)}>
            <span className="avatar small" aria-hidden>?</span>
            <span><span className="menu-title">{lang === "hi" ? "इस स्क्रीन का टूर" : "Take the tour"}</span><span className="menu-hint">{lang === "hi" ? "एक मिनट में समझें कि यहाँ क्या है" : "A one-minute walk through this role's screens"}</span></span>
          </Menu.Item>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
