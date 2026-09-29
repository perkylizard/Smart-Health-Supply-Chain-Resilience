import * as Menu from "@radix-ui/react-dropdown-menu";
import { useApp } from "../App";
import { PERSONAS, type PersonaId } from "../personas";

const initials: Record<PersonaId, string> = { dho: "DH", state: "ST", phc: "PH", dm: "DM", warehouse: "WH" };

/** Who you are: an avatar that opens the five roles with a one-line description each. */
export default function RoleMenu() {
  const { t, persona, setPersona } = useApp();
  return (
    <Menu.Root modal={false}>
      <Menu.Trigger asChild>
        <button className="hdr-btn role" aria-label={t.persona}><span className="avatar" aria-hidden>{initials[persona]}</span><span className="role-text"><span className="faint role-lbl">{t.roleLbl}</span> {t.personas[persona]}</span><span className="chev" aria-hidden>▾</span></button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={8}>
          <Menu.Label className="menu-label">{t.persona}</Menu.Label>
          <Menu.RadioGroup value={persona} onValueChange={(v) => setPersona(v as PersonaId)}>
            {(Object.keys(PERSONAS) as PersonaId[]).map((id) => (
              <Menu.RadioItem key={id} value={id} className="menu-item">
                <span className="avatar small" aria-hidden>{initials[id]}</span>
                <span><span className="menu-title">{t.personas[id]}</span><span className="menu-hint">{t.personaHints[id]}</span></span>
              </Menu.RadioItem>
            ))}
          </Menu.RadioGroup>
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
