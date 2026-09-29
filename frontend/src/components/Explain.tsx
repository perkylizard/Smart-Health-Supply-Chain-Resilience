import * as Dialog from "@radix-ui/react-dialog";
import { useMutation } from "@tanstack/react-query";
import { api } from "../api";
import { useApp } from "../App";
import { sB } from "../stringsB";
import Badge from "./Badge";

/** What the explanation is about, built from the item itself so it shows before the text arrives. */
function aboutOf(item: unknown): string {
  const r = (item ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof r[k] === "string" || typeof r[k] === "number" ? String(r[k]) : "");
  if (s("from_name") || s("to_name")) return [s("commodity_name"), [s("from_name"), s("to_name")].filter(Boolean).join(" to ")].filter(Boolean).join(" · ");
  return [s("commodity_name"), s("facility_name")].filter(Boolean).join(" · ");
}

export default function Explain({ kind, item, children }: { kind: "alert" | "transfer"; item: unknown; children: React.ReactNode }) {
  const { lang, t } = useApp();
  const b = sB[lang];
  const m = useMutation({ mutationFn: () => api.explain(kind, item, lang) });
  const about = aboutOf(item);
  return (
    <Dialog.Root onOpenChange={(o) => { if (o && !m.data) m.mutate(); }}>
      <Dialog.Trigger asChild>{children}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog mdl" aria-describedby={undefined}>
          <div className="mdl-head">
            <span className="mdl-icon amber" aria-hidden>?</span>
            <div><Dialog.Title asChild><h2>{b.whyTitle}</h2></Dialog.Title></div>
            <Dialog.Close asChild><button className="mdl-x" aria-label={t.close}>×</button></Dialog.Close>
          </div>
          <div className="mdl-body">
            {about && <div className="explain-about"><span className="lbl">{b.about}</span><strong>{about}</strong></div>}
            {m.isPending && <p className="skeleton">Loading explanation text placeholder that is long enough to look right</p>}
            {m.data && (<>
              <p className="explain-text">{m.data.explanation}</p>
              {m.data.numbers_used?.length > 0 && <ul className="explain-nums" aria-label={b.numbers}>{m.data.numbers_used.map((x, i) => <li key={i}>{x}</li>)}</ul>}
              <p style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: 0 }}><Badge kind="ai" /><span className="faint" style={{ fontSize: "var(--t-xs)" }}>{m.data.status}</span>{m.data.confidence && <span className="chip">{b.confidence}: {m.data.confidence}</span>}</p>
            </>)}
            {m.isError && <p className="muted" role="alert">Explanation unavailable right now.</p>}
          </div>
          <div className="mdl-foot"><Dialog.Close asChild><button className="btn dark">{b.understood}</button></Dialog.Close></div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
